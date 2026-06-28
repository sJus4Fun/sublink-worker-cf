/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { Layout } from '../components/Layout.jsx';
import { Navbar } from '../components/Navbar.jsx';
import { Form } from '../components/Form.jsx';
import { SingboxConfigBuilder } from '../builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../builders/SurgeConfigBuilder.js';
import { createTranslator, resolveLanguage } from '../i18n/index.js';
import { encodeBase64, tryDecodeSubscriptionLines, generateWebPath } from '../utils.js';
import { ProxyParser } from '../parsers/index.js';
import { parseSubscriptionContent } from '../parsers/subscription/subscriptionContentParser.js';
import { APP_NAME, APP_SUBTITLE } from '../constants.js';
import { ShortLinkService } from '../services/shortLinkService.js';
import { ConfigStorageService } from '../services/configStorageService.js';
import { SubscriptionStorageService, getEnabledSubscriptionInput } from '../services/subscriptionStorageService.js';
import { AuthService } from '../services/authService.js';
import { ServiceError, MissingDependencyError } from '../services/errors.js';
import { normalizeRuntime } from '../runtime/runtimeConfig.js';
import { PREDEFINED_RULE_SETS, SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11, generateSubconverterConfig } from '../config/index.js';

const DEFAULT_USER_AGENT = 'curl/7.74.0';

export function createApp(bindings = {}) {
    const runtime = normalizeRuntime(bindings);
    const services = {
        shortLinks: runtime.kv ? new ShortLinkService(runtime.kv, { shortLinkTtlSeconds: runtime.config.shortLinkTtlSeconds }) : null,
        configStorage: runtime.kv ? new ConfigStorageService(runtime.kv, { configTtlSeconds: runtime.config.configTtlSeconds }) : null,
        subscriptions: runtime.kv ? new SubscriptionStorageService(runtime.kv) : null,
        auth: runtime.kv ? new AuthService(runtime.kv) : null
    };

    const app = new Hono();

    app.use('*', async (c, next) => {
        const acceptLanguage = getRequestHeader(c.req, 'Accept-Language');
        const lang = c.req.query('lang') || acceptLanguage?.split(',')[0] || 'zh-CN';
        c.set('lang', lang);
        c.set('t', createTranslator(lang));
        const auth = services.auth;
        if (auth) {
            const session = await auth.getSession(getSessionCookie(c.req));
            c.set('user', session?.user || null);
            c.set('sessionToken', session?.token || '');
        } else {
            c.set('user', null);
            c.set('sessionToken', '');
        }
        await next();
    });

    app.get('/', (c) => {
        const t = c.get('t');
        const lang = resolveLanguage(c.get('lang'));
        const subtitle = APP_SUBTITLE[lang] || APP_SUBTITLE['zh-CN'];
        const activeView = c.req.query('view') === 'subscriptions' ? 'subscriptions' : 'home';

        return c.html(
            <Layout title={t('pageTitle')} description={t('pageDescription')} keywords={t('pageKeywords')}>
                <div class="flex flex-col min-h-screen xl:h-screen xl:overflow-hidden">
                    <Navbar activeView={activeView} />
                    <main class="flex-1 min-h-0 xl:overflow-hidden">
                        <div class="max-w-[1500px] w-full mx-auto px-4 py-8 pt-24 xl:py-4 xl:pt-20 xl:pb-2 h-full flex flex-col min-h-0">
                            <div class="flex flex-col min-h-0 flex-1">
                                <div class="text-center mb-6 xl:mb-4 shrink-0">
                                    <h1 class="text-3xl md:text-4xl xl:text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                                        {activeView === 'subscriptions' ? '我的订阅' : APP_NAME}
                                    </h1>
                                    <p class="text-sm md:text-base xl:text-sm text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                                        {activeView === 'subscriptions' ? '管理你的订阅链接，快速编辑、复制和删除。' : subtitle}
                                    </p>
                                </div>
                                <Form t={t} lang={lang} />
                            </div>
                        </div>
                    </main>
                </div>
            </Layout>
        );
    });

    app.get('/singbox', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            const requestedSingboxVersion = c.req.query('singbox_version') || c.req.query('sb_version') || c.req.query('sb_ver');
            const requestUserAgent = getRequestHeader(c.req, 'User-Agent');
            const singboxConfigVersion = resolveSingboxConfigVersion(requestedSingboxVersion, requestUserAgent);

            let baseConfig = singboxConfigVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                const storedConfig = await storage.getConfigById(configId);
                if (storedConfig) {
                    baseConfig = storedConfig;
                }
            }

            const builder = new SingboxConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                singboxConfigVersion,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.json(builder.config);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/clash', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new ClashConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            const headers = { 'Content-Type': 'text/yaml; charset=utf-8' };
            if (userinfo) {
                headers['subscription-userinfo'] = userinfo;
            }
            return c.text(builder.formatConfig(), 200, headers);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/surge', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new SurgeConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                includeAutoSelect
            );
            builder.setSubscriptionUrl(c.req.url);
            await builder.build();

            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.text(builder.formatConfig());
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/subconverter', (c) => {
        try {
            const rawSelectedRules = c.req.query('selectedRules');
            let selectedRules;

            if (!rawSelectedRules) {
                selectedRules = PREDEFINED_RULE_SETS.balanced;
            } else if (PREDEFINED_RULE_SETS[rawSelectedRules]) {
                selectedRules = PREDEFINED_RULE_SETS[rawSelectedRules];
            } else {
                try {
                    const parsed = JSON.parse(rawSelectedRules);
                    if (Array.isArray(parsed)) {
                        selectedRules = parsed;
                    } else {
                        return c.text('Invalid selectedRules: must be a preset name (minimal, balanced, comprehensive) or a JSON array', 400);
                    }
                } catch {
                    return c.text(`Invalid selectedRules: "${rawSelectedRules}" is not a valid preset name or JSON array. Valid presets: minimal, balanced, comprehensive`, 400);
                }
            }

            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const lang = c.get('lang');

            const config = generateSubconverterConfig({
                selectedRules,
                customRules,
                lang,
                includeAutoSelect,
                groupByCountry
            });

            return c.text(config, 200, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/xray', async (c) => {
        const inputString = c.req.query('config');
        if (!inputString) {
            return c.text('Missing config parameter', 400);
        }

        const proxylist = inputString.split('\n');
        const finalProxyList = [];
        let subscriptionUserinfo;
        const userAgent = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
        const headers = { 'User-Agent': userAgent };

        for (const proxy of proxylist) {
            const trimmedProxy = proxy.trim();
            if (!trimmedProxy) continue;

            if (trimmedProxy.startsWith('http://') || trimmedProxy.startsWith('https://')) {
                try {
                    const response = await fetch(trimmedProxy, { method: 'GET', headers });
                    const fetchedUserinfo = response.headers.get('subscription-userinfo');
                    if (fetchedUserinfo && subscriptionUserinfo === undefined) {
                        subscriptionUserinfo = fetchedUserinfo;
                    }
                    const text = await response.text();
                    let processed = tryDecodeSubscriptionLines(text, { decodeUriComponent: true });
                    if (!Array.isArray(processed)) processed = [processed];
                    finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
                } catch (e) {
                    runtime.logger.warn('Failed to fetch the proxy', e);
                }
            } else {
                let processed = tryDecodeSubscriptionLines(trimmedProxy);
                if (!Array.isArray(processed)) processed = [processed];
                finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
            }
        }

        const finalString = finalProxyList.join('\n');
        if (!finalString) {
            return c.text('Missing config parameter', 400);
        }

        const responseHeaders = {};
        if (subscriptionUserinfo) {
            responseHeaders['subscription-userinfo'] = subscriptionUserinfo;
        }

        return c.text(encodeBase64(finalString), 200, responseHeaders);
    });

    app.get('/shorten-v2', async (c) => {
        try {
            const url = c.req.query('url');
            if (!url) {
                return c.text('Missing URL parameter', 400);
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return c.text('Invalid URL parameter', 400);
            }
            const queryString = parsedUrl.search;

            const shortLinks = requireShortLinkService(services.shortLinks);
            const code = await shortLinks.createShortLink(queryString, c.req.query('shortCode'));
            return c.text(code);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    const redirectHandler = (prefix) => async (c) => {
        try {
            const code = c.req.param('code');
            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(code);
            if (!originalParam) return c.text('Short URL not found', 404);

            const url = new URL(c.req.url);
            return c.redirect(`${url.origin}/${prefix}${originalParam}`);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    };

    app.get('/s/:code', redirectHandler('surge'));
    app.get('/b/:code', redirectHandler('singbox'));
    app.get('/c/:code', redirectHandler('clash'));
    app.get('/x/:code', redirectHandler('xray'));

    app.post('/config', async (c) => {
        try {
            const { type, content } = await c.req.json();
            const storage = requireConfigStorage(services.configStorage);
            const configId = await storage.saveConfig(type, content);
            return c.text(configId);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/api/auth/me', (c) => {
        const user = c.get('user');
        return c.json({ user });
    });

    app.post('/api/auth/register', async (c) => {
        try {
            const { username, password } = await c.req.json();
            const result = await requireAuthService(services.auth).register(username, password);
            setSessionCookie(c, result.token);
            return c.json({ user: result.user }, 201);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/auth/login', async (c) => {
        try {
            const { username, password } = await c.req.json();
            const result = await requireAuthService(services.auth).login(username, password);
            setSessionCookie(c, result.token);
            return c.json({ user: result.user });
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/auth/logout', async (c) => {
        try {
            await requireAuthService(services.auth).logout(c.get('sessionToken'));
            clearSessionCookie(c);
            return c.json({ success: true });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/api/subscriptions', async (c) => {
        try {
            const user = requireCurrentUser(c);
            const subscriptions = await requireSubscriptionStorage(services.subscriptions).listSubscriptions(user.id);
            return c.json({ subscriptions });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/subscriptions', async (c) => {
        try {
            const payload = await c.req.json();
            const user = requireCurrentUser(c);
            const subscription = await requireSubscriptionStorage(services.subscriptions).createSubscription({
                ...payload,
                ownerToken: user.id
            });
            return c.json({ subscription }, 201);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/api/parse-source', async (c) => {
        try {
            const { content, ua } = await c.req.json();
            const userAgent = ua || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const nodes = await parseSourceNodes(content, userAgent);
            if (nodes.length === 0) {
                return c.text('No valid nodes found', 400);
            }
            return c.json({ nodes, count: nodes.length });
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/api/subscriptions/:id', async (c) => {
        try {
            const user = requireCurrentUser(c);
            const subscription = await requireSubscriptionStorage(services.subscriptions).getSubscription(c.req.param('id'), user.id);
            if (!subscription) return c.text('Subscription not found', 404);
            return c.json({ subscription });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.put('/api/subscriptions/:id', async (c) => {
        try {
            const payload = await c.req.json();
            const user = requireCurrentUser(c);
            const subscription = await requireSubscriptionStorage(services.subscriptions).updateSubscription(c.req.param('id'), {
                ...payload,
                ownerToken: user.id
            });
            if (!subscription) return c.text('Subscription not found', 404);
            return c.json({ subscription });
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.delete('/api/subscriptions/:id', async (c) => {
        try {
            const user = requireCurrentUser(c);
            const deleted = await requireSubscriptionStorage(services.subscriptions).deleteSubscription(c.req.param('id'), user.id);
            if (!deleted) return c.text('Subscription not found', 404);
            return c.json({ success: true });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/sub/:token/:target', async (c) => {
        try {
            const target = c.req.param('target');
            const subscription = await requireSubscriptionStorage(services.subscriptions).getSubscriptionByToken(c.req.param('token'));
            if (!subscription) return c.text('Subscription not found', 404);
            return buildSavedSubscriptionResponse(c, target, subscription, runtime.logger);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/resolve', async (c) => {
        try {
            const shortUrl = c.req.query('url');
            const t = c.get('t');
            if (!shortUrl) return c.text(t('missingUrl'), 400);

            let urlObj;
            try {
                urlObj = new URL(shortUrl);
            } catch {
                return c.text(t('invalidShortUrl'), 400);
            }
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length < 3) return c.text(t('invalidShortUrl'), 400);

            const prefix = pathParts[1];
            const shortCode = pathParts[2];
            if (!['b', 'c', 'x', 's'].includes(prefix)) return c.text(t('invalidShortUrl'), 400);

            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(shortCode);
            if (!originalParam) return c.text(t('shortUrlNotFound'), 404);

            const mapping = { b: 'singbox', c: 'clash', x: 'xray', s: 'surge' };
            const originalUrl = `${urlObj.origin}/${mapping[prefix]}${originalParam}`;
            return c.json({ originalUrl });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/favicon.ico', async (c) => {
        return c.text(getAppIconSvg(), 200, {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400'
        });
    });

    return app;
}

export function parseSelectedRules(raw) {
    if (!raw) return [];

    // 首先检查是否是预设名称 (minimal, balanced, comprehensive)
    // 这确保向后兼容主分支的 API 行为
    if (typeof raw === 'string' && PREDEFINED_RULE_SETS[raw]) {
        return PREDEFINED_RULE_SETS[raw];
    }

    // 尝试解析为 JSON 数组
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // 解析失败，回退到 minimal 预设
        console.warn(`Failed to parse selectedRules: ${raw}, falling back to minimal`);
        return PREDEFINED_RULE_SETS.minimal;
    }
}

function parseJsonArray(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseBooleanFlag(value) {
    return value === 'true' || value === true;
}

function parseSemverLike(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const match = trimmed.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: match[3] ? Number(match[3]) : 0
    };
}

function isSingboxLegacyConfig(version) {
    if (!version || Number.isNaN(version.major) || Number.isNaN(version.minor)) {
        return false;
    }
    if (version.major !== 1) {
        return version.major < 1;
    }
    return version.minor < 12;
}

function resolveSingboxConfigVersion(requestedVersion, userAgent) {
    const normalizedRequested = typeof requestedVersion === 'string' ? requestedVersion.trim().toLowerCase() : '';
    if (normalizedRequested && normalizedRequested !== 'auto') {
        if (normalizedRequested === 'legacy') return '1.11';
        if (normalizedRequested === 'latest') return '1.12';
        const parsed = parseSemverLike(normalizedRequested);
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    if (typeof userAgent === 'string' && userAgent) {
        const uaMatch = userAgent.match(/sing-box\/(\d+\.\d+(?:\.\d+)?)/i) || userAgent.match(/sing-box\s+(\d+\.\d+(?:\.\d+)?)/i);
        const versionString = uaMatch?.[1];
        const parsed = versionString ? parseSemverLike(versionString) : null;
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    return '1.12';
}

function getRequestHeader(request, name) {
    if (!request || !name) {
        return undefined;
    }

    try {
        const value = request.header(name);
        if (value !== undefined) {
            return value;
        }
    } catch {
        // Fallback if HonoRequest.header cannot read from the raw request.
    }

    const headers = request.raw?.headers;
    if (!headers) {
        return undefined;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }

    if (typeof headers === 'object') {
        const lowerName = name.toLowerCase();
        const headerValue = headers[lowerName] ?? headers[name];
        if (Array.isArray(headerValue)) {
            return headerValue[0];
        }
        return headerValue;
    }

    return undefined;
}

function parseCookies(cookieHeader = '') {
    return cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const eqIndex = part.indexOf('=');
            if (eqIndex === -1) return cookies;
            const key = part.slice(0, eqIndex).trim();
            const value = part.slice(eqIndex + 1).trim();
            if (key) cookies[key] = decodeURIComponent(value);
            return cookies;
        }, {});
}

function getSessionCookie(request) {
    const cookieHeader = getRequestHeader(request, 'Cookie') || '';
    return parseCookies(cookieHeader).nodelink_session || '';
}

function getAppIconSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="g" x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
<stop stop-color="#0ea5e9"/>
<stop offset="1" stop-color="#10b981"/>
</linearGradient>
</defs>
<rect width="64" height="64" rx="16" fill="#06111f"/>
<path d="M32 9 50 17v13c0 11.4-7.5 20.8-18 25-10.5-4.2-18-13.6-18-25V17l18-8Z" fill="url(#g)" opacity=".18" stroke="url(#g)" stroke-width="3"/>
<circle cx="22" cy="26" r="5" fill="#38bdf8"/>
<circle cx="42" cy="26" r="5" fill="#34d399"/>
<circle cx="32" cy="42" r="5" fill="#f8fafc"/>
<path d="M26.5 28.5 32 38m5.5-9.5L32 38" stroke="#e0f2fe" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

function setSessionCookie(c, token) {
    c.header('Set-Cookie', `nodelink_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`);
}

function clearSessionCookie(c) {
    c.header('Set-Cookie', 'nodelink_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function requireCurrentUser(c) {
    const user = c.get('user');
    if (!user?.id) {
        throw new ServiceError('请先登录', 401);
    }
    return user;
}

async function parseSourceNodes(content, userAgent) {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const collected = [];
    const pushProxy = (proxy) => {
        if (!proxy || typeof proxy !== 'object' || !proxy.tag || !proxy.type) return;
        collected.push({
            id: `node_${generateWebPath(10)}`,
            name: proxy.tag,
            type: proxy.type,
            enabled: true,
            proxy
        });
    };

    const consumeResult = async (result) => {
        if (!result) return;
        if (result && typeof result === 'object' && (result.type === 'yamlConfig' || result.type === 'singboxConfig' || result.type === 'surgeConfig')) {
            if (Array.isArray(result.proxies)) {
                result.proxies.forEach(pushProxy);
            }
            return;
        }
        if (Array.isArray(result)) {
            for (const item of result) {
                if (item && typeof item === 'object') {
                    pushProxy(item);
                } else if (typeof item === 'string') {
                    await consumeResult(await ProxyParser.parse(item.trim(), userAgent));
                }
            }
            return;
        }
        if (result && typeof result === 'object') {
            pushProxy(result);
        }
    };

    const directResult = parseSubscriptionContent(content);
    await consumeResult(directResult);
    if (collected.length > 0) {
        return collected;
    }

    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        let processed = tryDecodeSubscriptionLines(line);
        if (!Array.isArray(processed)) processed = [processed];
        for (const item of processed) {
            if (typeof item === 'string') {
                await consumeResult(await ProxyParser.parse(item.trim(), userAgent));
            }
        }
    }

    return collected;
}

async function buildSavedSubscriptionResponse(c, target, subscription, logger) {
    const normalizedTarget = typeof target === 'string' ? target.toLowerCase() : '';
    const config = getEnabledSubscriptionInput(subscription);
    if (!config) {
        return c.text('Subscription has no enabled sources', 400);
    }
    const subscriptionHeaders = getSubscriptionDownloadHeaders(subscription, normalizedTarget);

    const options = subscription.options || {};
    const selectedRules = Array.isArray(options.selectedRules) ? options.selectedRules : [];
    const customRules = Array.isArray(options.customRules) ? options.customRules : [];
    const ua = options.ua || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
    const groupByCountry = options.groupByCountry === true;
    const includeAutoSelect = options.includeAutoSelect !== false;
    const enableClashUI = options.enableClashUI === true;
    const externalController = options.externalController || undefined;
    const externalUiDownloadUrl = options.externalUiDownloadUrl || undefined;
    const baseConfig = options.baseConfig || undefined;
    const lang = c.get('lang');

    if (normalizedTarget === 'singbox') {
        const requestedSingboxVersion = c.req.query('singbox_version') || c.req.query('sb_version') || c.req.query('sb_ver');
        const requestUserAgent = getRequestHeader(c.req, 'User-Agent');
        const singboxConfigVersion = resolveSingboxConfigVersion(requestedSingboxVersion, requestUserAgent);
        const defaultConfig = singboxConfigVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG;
        const builder = new SingboxConfigBuilder(
            config,
            selectedRules,
            customRules,
            baseConfig || defaultConfig,
            lang,
            ua,
            groupByCountry,
            enableClashUI,
            externalController,
            externalUiDownloadUrl,
            singboxConfigVersion,
            includeAutoSelect
        );
        await builder.build();
        const userinfo = builder.getSubscriptionUserinfo();
        const headers = { ...subscriptionHeaders };
        if (userinfo) headers['subscription-userinfo'] = userinfo;
        return c.json(builder.config, 200, headers);
    }

    if (normalizedTarget === 'clash') {
        const builder = new ClashConfigBuilder(
            config,
            selectedRules,
            customRules,
            baseConfig,
            lang,
            ua,
            groupByCountry,
            enableClashUI,
            externalController,
            externalUiDownloadUrl,
            includeAutoSelect
        );
        await builder.build();
        const headers = { ...subscriptionHeaders, 'Content-Type': 'text/yaml; charset=utf-8' };
        const userinfo = builder.getSubscriptionUserinfo();
        if (userinfo) headers['subscription-userinfo'] = userinfo;
        return c.text(builder.formatConfig(), 200, headers);
    }

    if (normalizedTarget === 'surge') {
        const builder = new SurgeConfigBuilder(
            config,
            selectedRules,
            customRules,
            baseConfig,
            lang,
            ua,
            groupByCountry,
            includeAutoSelect
        );
        builder.setSubscriptionUrl(c.req.url);
        await builder.build();
        const userinfo = builder.getSubscriptionUserinfo();
        const headers = { ...subscriptionHeaders };
        if (userinfo) headers['subscription-userinfo'] = userinfo;
        return c.text(builder.formatConfig(), 200, headers);
    }

    if (normalizedTarget === 'xray') {
        return buildSavedXrayResponse(c, config, ua, logger, subscriptionHeaders);
    }

    return c.text('Unsupported subscription target', 400);
}

async function buildSavedXrayResponse(c, inputString, userAgent, logger, subscriptionHeaders = {}) {
    const proxylist = inputString.split('\n');
    const finalProxyList = [];
    let subscriptionUserinfo;
    const headers = { 'User-Agent': userAgent };

    for (const proxy of proxylist) {
        const trimmedProxy = proxy.trim();
        if (!trimmedProxy) continue;

        if (trimmedProxy.startsWith('http://') || trimmedProxy.startsWith('https://')) {
            try {
                const response = await fetch(trimmedProxy, { method: 'GET', headers });
                const fetchedUserinfo = response.headers.get('subscription-userinfo');
                if (fetchedUserinfo && subscriptionUserinfo === undefined) {
                    subscriptionUserinfo = fetchedUserinfo;
                }
                const text = await response.text();
                let processed = tryDecodeSubscriptionLines(text, { decodeUriComponent: true });
                if (!Array.isArray(processed)) processed = [processed];
                finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
            } catch (e) {
                logger.warn('Failed to fetch the proxy', e);
            }
        } else {
            let processed = tryDecodeSubscriptionLines(trimmedProxy);
            if (!Array.isArray(processed)) processed = [processed];
            finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
        }
    }

    const finalString = finalProxyList.join('\n');
    if (!finalString) {
        return c.text('Missing config parameter', 400);
    }

    const responseHeaders = { ...subscriptionHeaders };
    if (subscriptionUserinfo) {
        responseHeaders['subscription-userinfo'] = subscriptionUserinfo;
    }

    return c.text(encodeBase64(finalString), 200, responseHeaders);
}

function getSubscriptionDownloadHeaders(subscription, target) {
    const name = normalizeHeaderText(subscription?.name) || 'subscription';
    const filename = ensureSubscriptionExtension(name, target);
    const fallback = toAsciiFilename(filename);
    return {
        'profile-title': `base64:${encodeBase64(name)}`,
        'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987Value(filename)}`
    };
}

function normalizeHeaderText(value) {
    return typeof value === 'string'
        ? value.replace(/[\r\n]/g, ' ').trim()
        : '';
}

function ensureSubscriptionExtension(name, target) {
    const extensionByTarget = {
        clash: '.yaml',
        singbox: '.json',
        surge: '.conf',
        xray: '.txt'
    };
    const extension = extensionByTarget[target] || '.txt';
    return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

function toAsciiFilename(value) {
    const sanitized = normalizeHeaderText(value)
        .replace(/[\\/:"*?<>|]+/g, '-')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
    return sanitized || 'subscription';
}

function encodeRFC5987Value(value) {
    return encodeURIComponent(value)
        .replace(/['()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, '%2A');
}

function requireShortLinkService(service) {
    if (!service) {
        throw new MissingDependencyError('Short link functionality is unavailable');
    }
    return service;
}

function requireConfigStorage(service) {
    if (!service) {
        throw new MissingDependencyError('Config storage functionality is unavailable');
    }
    return service;
}

function requireSubscriptionStorage(service) {
    if (!service) {
        throw new MissingDependencyError('Subscription storage functionality is unavailable');
    }
    return service;
}

function requireAuthService(service) {
    if (!service) {
        throw new MissingDependencyError('Auth functionality is unavailable');
    }
    return service;
}

function handleError(c, error, logger) {
    if (error instanceof ServiceError) {
        return c.text(error.message, error.status);
    }
    logger.error?.('Unhandled error', error);
    return c.text(`Error: ${error.message}`, 500);
}
