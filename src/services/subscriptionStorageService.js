import yaml from 'js-yaml';
import { generateWebPath } from '../utils.js';
import { InvalidPayloadError, MissingDependencyError } from './errors.js';

const SUBSCRIPTION_PREFIX = 'subscription:';
const TOKEN_PREFIX = 'subscription:token:';
const INDEX_PREFIX = 'subscription:index:';
const DEFAULT_NAME = 'Untitled Subscription';

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeBoolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function serializeBaseConfig(configType, value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (isObject(value) || Array.isArray(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        throw new InvalidPayloadError('Invalid base config');
    }

    const content = value.trim();
    if (!content) return null;

    if (configType === 'clash') {
        const parsed = yaml.load(content);
        if (!isObject(parsed)) {
            throw new InvalidPayloadError('Invalid Clash base config');
        }
        return parsed;
    }

    const parsed = JSON.parse(content);
    if (!isObject(parsed)) {
        throw new InvalidPayloadError('Invalid base config JSON');
    }
    return parsed;
}

function normalizeSources(value) {
    const sources = normalizeArray(value)
        .map((source, index) => {
            if (!isObject(source)) return null;
            const content = normalizeString(source.content);
            if (!content) return null;
            return {
                id: normalizeString(source.id, `src_${generateWebPath(8)}`),
                name: normalizeString(source.name, `Source ${index + 1}`),
                content,
                enabled: source.enabled !== false
            };
        })
        .filter(Boolean);

    if (sources.length === 0) {
        throw new InvalidPayloadError('At least one source is required');
    }

    return sources;
}

function normalizeOptions(value = {}) {
    const input = isObject(value) ? value : {};
    const configType = ['singbox', 'clash', 'surge'].includes(input.configType) ? input.configType : 'singbox';
    const baseConfigValue = Object.prototype.hasOwnProperty.call(input, 'baseConfig')
        ? input.baseConfig
        : input.baseConfigContent;

    return {
        selectedRules: normalizeArray(input.selectedRules).filter(item => typeof item === 'string'),
        customRules: normalizeArray(input.customRules).filter(isObject),
        groupByCountry: normalizeBoolean(input.groupByCountry, false),
        includeAutoSelect: input.includeAutoSelect !== false,
        enableClashUI: normalizeBoolean(input.enableClashUI, false),
        externalController: normalizeString(input.externalController),
        externalUiDownloadUrl: normalizeString(input.externalUiDownloadUrl),
        ua: normalizeString(input.ua),
        configType,
        baseConfig: serializeBaseConfig(configType, baseConfigValue)
    };
}

function normalizeNodes(value) {
    return normalizeArray(value)
        .map((node, index) => {
            if (!isObject(node)) return null;
            const proxy = isObject(node.proxy) ? { ...node.proxy } : null;
            const name = normalizeString(node.name || proxy?.tag || proxy?.name, `Node ${index + 1}`);
            if (!proxy || !proxy.type || !name) return null;
            proxy.tag = name;
            return {
                id: normalizeString(node.id, `node_${generateWebPath(8)}`),
                sourceId: normalizeString(node.sourceId),
                name,
                type: normalizeString(node.type || proxy.type),
                enabled: node.enabled !== false,
                proxy
            };
        })
        .filter(Boolean);
}

function summarizeSubscription(subscription) {
    return {
        id: subscription.id,
        token: subscription.token,
        name: subscription.name,
        sourceCount: subscription.sources.length,
        enabledSourceCount: subscription.sources.filter(source => source.enabled !== false).length,
        nodeCount: Array.isArray(subscription.nodes) ? subscription.nodes.filter(node => node.enabled !== false).length : 0,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
    };
}

export class SubscriptionStorageService {
    constructor(kv) {
        this.kv = kv;
    }

    ensureKv() {
        if (!this.kv) {
            throw new MissingDependencyError('Subscription storage requires a KV store');
        }
        return this.kv;
    }

    subscriptionKey(id) {
        return `${SUBSCRIPTION_PREFIX}${id}`;
    }

    tokenKey(token) {
        return `${TOKEN_PREFIX}${token}`;
    }

    indexKey(ownerToken) {
        return `${INDEX_PREFIX}${ownerToken}`;
    }

    async getIndex(ownerToken) {
        const kv = this.ensureKv();
        const raw = await kv.get(this.indexKey(ownerToken));
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    async saveIndex(ownerToken, summaries) {
        const kv = this.ensureKv();
        await kv.put(this.indexKey(ownerToken), JSON.stringify(summaries));
    }

    async listSubscriptions(ownerToken) {
        const token = normalizeString(ownerToken);
        if (!token) {
            throw new InvalidPayloadError('Missing owner token');
        }
        return this.getIndex(token);
    }

    async createSubscription(payload) {
        const ownerToken = normalizeString(payload?.ownerToken);
        if (!ownerToken) {
            throw new InvalidPayloadError('Missing owner token');
        }

        const createdAt = nowIso();
        const subscription = {
            id: `sub_${generateWebPath(12)}`,
            token: generateWebPath(24),
            ownerToken,
            name: normalizeString(payload?.name, DEFAULT_NAME) || DEFAULT_NAME,
            sources: normalizeSources(payload?.sources),
            nodes: normalizeNodes(payload?.nodes),
            options: normalizeOptions(payload?.options),
            createdAt,
            updatedAt: createdAt
        };

        const kv = this.ensureKv();
        await kv.put(this.subscriptionKey(subscription.id), JSON.stringify(subscription));
        await kv.put(this.tokenKey(subscription.token), subscription.id);

        const index = await this.getIndex(ownerToken);
        await this.saveIndex(ownerToken, [summarizeSubscription(subscription), ...index.filter(item => item.id !== subscription.id)]);

        return subscription;
    }

    async getSubscription(id, ownerToken) {
        const token = normalizeString(ownerToken);
        if (!token) {
            throw new InvalidPayloadError('Missing owner token');
        }
        const subscription = await this.getSubscriptionById(id);
        if (!subscription) return null;
        if (subscription.ownerToken !== token) {
            return null;
        }
        return subscription;
    }

    async getSubscriptionById(id) {
        const keyId = normalizeString(id);
        if (!keyId) {
            throw new InvalidPayloadError('Missing subscription id');
        }
        const kv = this.ensureKv();
        const raw = await kv.get(this.subscriptionKey(keyId));
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            throw new InvalidPayloadError('Stored subscription is not valid JSON');
        }
    }

    async getSubscriptionByToken(token) {
        const publicToken = normalizeString(token);
        if (!publicToken) {
            throw new InvalidPayloadError('Missing subscription token');
        }
        const kv = this.ensureKv();
        const id = await kv.get(this.tokenKey(publicToken));
        if (!id) return null;
        return this.getSubscriptionById(id);
    }

    async updateSubscription(id, payload) {
        const ownerToken = normalizeString(payload?.ownerToken);
        if (!ownerToken) {
            throw new InvalidPayloadError('Missing owner token');
        }

        const existing = await this.getSubscription(id, ownerToken);
        if (!existing) return null;

        const updated = {
            ...existing,
            name: Object.prototype.hasOwnProperty.call(payload, 'name')
                ? normalizeString(payload.name, existing.name) || DEFAULT_NAME
                : existing.name,
            sources: Object.prototype.hasOwnProperty.call(payload, 'sources')
                ? normalizeSources(payload.sources)
                : existing.sources,
            nodes: Object.prototype.hasOwnProperty.call(payload, 'nodes')
                ? normalizeNodes(payload.nodes)
                : (Array.isArray(existing.nodes) ? existing.nodes : []),
            options: Object.prototype.hasOwnProperty.call(payload, 'options')
                ? normalizeOptions(payload.options)
                : existing.options,
            updatedAt: nowIso()
        };

        const kv = this.ensureKv();
        await kv.put(this.subscriptionKey(updated.id), JSON.stringify(updated));
        const index = await this.getIndex(ownerToken);
        await this.saveIndex(ownerToken, [
            summarizeSubscription(updated),
            ...index.filter(item => item.id !== updated.id)
        ]);

        return updated;
    }

    async deleteSubscription(id, ownerToken) {
        const token = normalizeString(ownerToken);
        if (!token) {
            throw new InvalidPayloadError('Missing owner token');
        }

        const existing = await this.getSubscription(id, token);
        if (!existing) return false;

        const kv = this.ensureKv();
        await kv.delete(this.subscriptionKey(existing.id));
        await kv.delete(this.tokenKey(existing.token));
        const index = await this.getIndex(token);
        await this.saveIndex(token, index.filter(item => item.id !== existing.id));

        return true;
    }
}

export function getEnabledSubscriptionInput(subscription) {
    if (subscription && Array.isArray(subscription.nodes)) {
        const outbounds = subscription.nodes
            .filter(node => node && node.enabled !== false && isObject(node.proxy))
            .map(node => {
                const proxy = { ...node.proxy };
                proxy.tag = normalizeString(node.name || proxy.tag || proxy.name, proxy.tag || proxy.name);
                return proxy;
            })
            .filter(proxy => proxy.tag && proxy.type);
        if (outbounds.length > 0) {
            return JSON.stringify({ outbounds });
        }
    }

    if (!subscription || !Array.isArray(subscription.sources)) {
        return '';
    }
    return subscription.sources
        .filter(source => source && source.enabled !== false && typeof source.content === 'string')
        .map(source => source.content.trim())
        .filter(Boolean)
        .join('\n');
}
