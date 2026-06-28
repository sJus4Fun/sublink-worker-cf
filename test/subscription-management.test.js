import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { decodeBase64 } from '../src/utils.js';

const VMESS = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';

const createTestApp = () => createApp({
    kv: new MemoryKVAdapter(),
    assetFetcher: null,
    logger: console,
    config: {
        configTtlSeconds: 60,
        shortLinkTtlSeconds: null
    }
});

const createSubscriptionPayload = (overrides = {}) => ({
    name: 'Main Subscription',
    sources: [
        {
            id: 'source-1',
            name: 'Airport A',
            content: VMESS,
            enabled: true
        }
    ],
    options: {
        selectedRules: ['Google'],
        customRules: [],
        groupByCountry: false,
        includeAutoSelect: true,
        enableClashUI: false,
        externalController: '',
        externalUiDownloadUrl: '',
        ua: '',
        configType: 'singbox',
        baseConfig: null
    },
    ...overrides
});

async function registerAndGetCookie(app, username = 'alice') {
    const res = await app.request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'password123' })
    });
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('nodelink_session=');
    return setCookie.split(';')[0];
}

describe('Subscription management API', () => {
    it('parses a source into manageable nodes', async () => {
        const app = createTestApp();

        const res = await app.request('http://localhost/api/parse-source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: VMESS })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.count).toBe(1);
        expect(data.nodes[0]).toMatchObject({
            name: 'test',
            type: 'vmess'
        });
        expect(data.nodes[0].proxy).toHaveProperty('tag', 'test');
    });

    it('requires login for subscription management', async () => {
        const app = createTestApp();

        const listRes = await app.request('http://localhost/api/subscriptions');
        expect(listRes.status).toBe(401);

        const createRes = await app.request('http://localhost/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createSubscriptionPayload())
        });
        expect(createRes.status).toBe(401);
    });

    it('creates, lists, loads, updates, and deletes subscriptions by logged-in user', async () => {
        const app = createTestApp();
        const cookie = await registerAndGetCookie(app);

        const createRes = await app.request('http://localhost/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify(createSubscriptionPayload())
        });
        expect(createRes.status).toBe(201);
        const created = (await createRes.json()).subscription;
        expect(created.id).toMatch(/^sub_/);
        expect(created.token).toBeTruthy();
        expect(created.name).toBe('Main Subscription');

        const listRes = await app.request('http://localhost/api/subscriptions', {
            headers: { Cookie: cookie }
        });
        expect(listRes.status).toBe(200);
        const list = await listRes.json();
        expect(list.subscriptions).toHaveLength(1);
        expect(list.subscriptions[0]).toMatchObject({
            id: created.id,
            name: 'Main Subscription',
            sourceCount: 1,
            enabledSourceCount: 1
        });

        const otherCookie = await registerAndGetCookie(app, 'bob');
        const forbiddenRes = await app.request(`http://localhost/api/subscriptions/${created.id}`, {
            headers: { Cookie: otherCookie }
        });
        expect(forbiddenRes.status).toBe(404);

        const missingOwnerRes = await app.request(`http://localhost/api/subscriptions/${created.id}`);
        expect(missingOwnerRes.status).toBe(401);

        const updateRes = await app.request(`http://localhost/api/subscriptions/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({
                ...createSubscriptionPayload({ name: 'Updated Subscription' }),
                sources: [
                    { id: 'source-1', name: 'Airport A', content: VMESS, enabled: false },
                    { id: 'source-2', name: 'Airport B', content: VMESS, enabled: true }
                ]
            })
        });
        expect(updateRes.status).toBe(200);
        const updated = (await updateRes.json()).subscription;
        expect(updated.name).toBe('Updated Subscription');
        expect(updated.sources).toHaveLength(2);

        const updatedListRes = await app.request('http://localhost/api/subscriptions', {
            headers: { Cookie: cookie }
        });
        const updatedList = await updatedListRes.json();
        expect(updatedList.subscriptions[0]).toMatchObject({
            name: 'Updated Subscription',
            sourceCount: 2,
            enabledSourceCount: 1
        });

        const deleteRes = await app.request(`http://localhost/api/subscriptions/${created.id}`, {
            method: 'DELETE',
            headers: { Cookie: cookie }
        });
        expect(deleteRes.status).toBe(200);

        const emptyListRes = await app.request('http://localhost/api/subscriptions', {
            headers: { Cookie: cookie }
        });
        const emptyList = await emptyListRes.json();
        expect(emptyList.subscriptions).toHaveLength(0);
    });

    it('serves a saved subscription through stable token links', async () => {
        const app = createTestApp();
        const cookie = await registerAndGetCookie(app);
        const parseRes = await app.request('http://localhost/api/parse-source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: VMESS })
        });
        const parsedNode = (await parseRes.json()).nodes[0];
        parsedNode.name = 'Renamed Node';
        parsedNode.proxy.tag = 'Renamed Node';

        const createRes = await app.request('http://localhost/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify(createSubscriptionPayload({
                name: '自用订阅.yaml',
                nodes: [parsedNode]
            }))
        });
        const created = (await createRes.json()).subscription;

        const clashRes = await app.request(`http://localhost/sub/${created.token}/clash`);
        expect(clashRes.status).toBe(200);
        expect(clashRes.headers.get('content-type')).toContain('text/yaml');
        expect(decodeBase64(clashRes.headers.get('profile-title').replace(/^base64:/, ''))).toBe('自用订阅.yaml');
        expect(clashRes.headers.get('content-disposition')).toContain("filename*=UTF-8''%E8%87%AA%E7%94%A8%E8%AE%A2%E9%98%85.yaml");
        const text = await clashRes.text();
        expect(text).toContain('proxies:');
        expect(text).toContain('Renamed Node');

        const missingRes = await app.request('http://localhost/sub/not-found/clash');
        expect(missingRes.status).toBe(404);
    });

    it('preserves sourceId for nodes in saved subscription', async () => {
        const app = createTestApp();
        const cookie = await registerAndGetCookie(app);

        const node = {
            id: 'node-1',
            sourceId: 'source-1',
            name: 'Test Node',
            type: 'ss',
            proxy: {
                tag: 'Test Node',
                type: 'ss',
                server: '1.1.1.1',
                port: 8388,
                method: 'aes-256-gcm',
                password: 'pwd'
            }
        };

        const createRes = await app.request('http://localhost/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify(createSubscriptionPayload({
                nodes: [node]
            }))
        });
        expect(createRes.status).toBe(201);
        const created = (await createRes.json()).subscription;
        expect(created.nodes).toHaveLength(1);
        expect(created.nodes[0].sourceId).toBe('source-1');

        // Also test fetching the subscription directly
        const getRes = await app.request(`http://localhost/api/subscriptions/${created.id}`, {
            headers: { Cookie: cookie }
        });
        expect(getRes.status).toBe(200);
        const fetched = (await getRes.json()).subscription;
        expect(fetched.nodes).toHaveLength(1);
        expect(fetched.nodes[0].sourceId).toBe('source-1');
    });
});
