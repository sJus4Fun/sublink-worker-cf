import { generateWebPath } from '../utils.js';
import { InvalidPayloadError, MissingDependencyError } from './errors.js';

const USER_PREFIX = 'auth:user:';
const SESSION_PREFIX = 'auth:session:';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 100000;

function normalizeUsername(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePassword(value) {
    return typeof value === 'string' ? value : '';
}

function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function timingSafeEqual(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) {
        diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt
    };
}

export class AuthService {
    constructor(kv, options = {}) {
        this.kv = kv;
        this.options = options;
    }

    ensureKv() {
        if (!this.kv) {
            throw new MissingDependencyError('Auth requires a KV store');
        }
        return this.kv;
    }

    userKey(username) {
        return `${USER_PREFIX}${username}`;
    }

    sessionKey(token) {
        return `${SESSION_PREFIX}${token}`;
    }

    async hashPassword(password, salt = null) {
        const cryptoApi = globalThis.crypto;
        if (!cryptoApi?.subtle) {
            throw new MissingDependencyError('Web Crypto is required for auth');
        }

        const saltBytes = salt ? base64ToBytes(salt) : cryptoApi.getRandomValues(new Uint8Array(16));
        const keyMaterial = await cryptoApi.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const bits = await cryptoApi.subtle.deriveBits(
            {
                name: 'PBKDF2',
                hash: 'SHA-256',
                salt: saltBytes,
                iterations: PBKDF2_ITERATIONS
            },
            keyMaterial,
            256
        );

        return {
            salt: bytesToBase64(saltBytes),
            hash: bytesToBase64(new Uint8Array(bits)),
            iterations: PBKDF2_ITERATIONS
        };
    }

    async createSession(user) {
        const kv = this.ensureKv();
        const token = generateWebPath(48);
        const session = {
            token,
            userId: user.id,
            username: user.username,
            createdAt: new Date().toISOString()
        };
        const ttl = this.options.sessionTtlSeconds ?? SESSION_TTL_SECONDS;
        await kv.put(this.sessionKey(token), JSON.stringify(session), { expirationTtl: ttl });
        return { token, session };
    }

    async register(usernameInput, passwordInput) {
        const username = normalizeUsername(usernameInput);
        const password = normalizePassword(passwordInput);
        if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
            throw new InvalidPayloadError('用户名只能包含 3-32 位字母、数字、下划线或短横线');
        }
        if (password.length < 8) {
            throw new InvalidPayloadError('密码至少需要 8 位');
        }

        const kv = this.ensureKv();
        const key = this.userKey(username);
        const existing = await kv.get(key);
        if (existing) {
            throw new InvalidPayloadError('用户名已存在');
        }

        const createdAt = new Date().toISOString();
        const user = {
            id: `user_${generateWebPath(16)}`,
            username,
            password: await this.hashPassword(password),
            createdAt
        };
        await kv.put(key, JSON.stringify(user));
        const { token } = await this.createSession(user);
        return { user: publicUser(user), token };
    }

    async login(usernameInput, passwordInput) {
        const username = normalizeUsername(usernameInput);
        const password = normalizePassword(passwordInput);
        if (!username || !password) {
            throw new InvalidPayloadError('请输入用户名和密码');
        }

        const kv = this.ensureKv();
        const raw = await kv.get(this.userKey(username));
        if (!raw) {
            throw new InvalidPayloadError('用户名或密码错误');
        }
        const user = JSON.parse(raw);
        const hashed = await this.hashPassword(password, user.password?.salt);
        if (!timingSafeEqual(hashed.hash, user.password?.hash || '')) {
            throw new InvalidPayloadError('用户名或密码错误');
        }

        const { token } = await this.createSession(user);
        return { user: publicUser(user), token };
    }

    async getSession(token) {
        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) return null;
        const kv = this.ensureKv();
        const raw = await kv.get(this.sessionKey(normalizedToken));
        if (!raw) return null;
        try {
            const session = JSON.parse(raw);
            return {
                token: normalizedToken,
                user: {
                    id: session.userId,
                    username: session.username
                }
            };
        } catch {
            return null;
        }
    }

    async logout(token) {
        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) return;
        await this.ensureKv().delete(this.sessionKey(normalizedToken));
    }
}
