import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { generateClashRuleSets } from '../src/config/ruleGenerators.js';

const AI_RULE_PROVIDER_NAMES = ['openai', 'anthropic', 'category-ai-chat-!cn'];

const expectAiProvidersFormat = (providers, format) => {
  AI_RULE_PROVIDER_NAMES.forEach(name => {
    const provider = providers[name];
    expect(provider).toBeDefined();
    expect(provider.format).toBe(format);
    expect(provider.url).toContain(`.${format === 'mrs' ? 'mrs' : 'yaml'}`);
  });
};

/**
 * Issue #306: 梅林Clash不支持mrs格式
 * 
 * 问题：老版本Clash内核不支持mrs格式的rule-set，导致报错：
 * "Parse config error: rules[0] [RULE-SET,category-ai-chat-!cn,💬 AI 服务] error: rule set [category-ai-chat-!cn] not found"
 * 
 * 解决方案：根据User-Agent检测客户端类型，对老版本Clash使用yaml格式
 */

describe('Issue #306: MRS format compatibility for legacy Clash clients', () => {
  
  // 测试generateClashRuleSets函数默认行为（useMrs=true时用mrs）
  describe('generateClashRuleSets default behavior', () => {
    it('should generate rule-providers with mrs format when useMrs=true', () => {
      const { site_rule_providers } = generateClashRuleSets(['AI Services'], [], true);

      expectAiProvidersFormat(site_rule_providers, 'mrs');
    });

    it('should generate rule-providers with yaml format when useMrs=false', () => {
      const { site_rule_providers } = generateClashRuleSets(['AI Services'], [], false);

      expectAiProvidersFormat(site_rule_providers, 'yaml');
    });
  });

  // 测试期望行为：老版本Clash应该使用yaml格式
  describe('Expected behavior for legacy Clash clients', () => {
    
    // 这些UA应该使用yaml格式（明确的老版本Clash客户端）
    const legacyUserAgents = [
      'Clash/1.0',
      'clash/0.19.0',
      'ClashForAndroid/2.5.12',
      'ClashForWindows/0.20.0',
      'Merlin Clash',
    ];

    // 这些UA应该使用mrs格式（Meta客户端或未知客户端）
    const modernUserAgents = [
      'clash-verge/v1.5.0',
      'Clash.Meta/v1.18.0',
      'mihomo/1.18.0',
      'Stash/2.4.0',
      'ClashMetaForAndroid/2.10.0',
      'verge-rev/1.0.0',
      'unknown-client',  // 未知客户端默认用mrs
    ];

    legacyUserAgents.forEach(ua => {
      it(`should use yaml format for legacy client: ${ua}`, async () => {
        const input = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
`;
        const builder = new ClashConfigBuilder(
          input, 
          ['AI Services'],  // 选择AI规则以触发AI服务规则集
          [], 
          null, 
          'zh-CN', 
          ua  // 传入老版本UA
        );
        const yamlText = await builder.build();
        const config = yaml.load(yamlText);

        // 验证rule-providers存在
        expect(config['rule-providers']).toBeDefined();
        
        // 期望：老版本Clash应该使用yaml格式
        expectAiProvidersFormat(config['rule-providers'], 'yaml');
        AI_RULE_PROVIDER_NAMES.forEach(name => {
          expect(config['rule-providers'][name].url).not.toContain('.mrs');
        });
      });
    });

    modernUserAgents.forEach(ua => {
      it(`should use mrs format for modern client: ${ua}`, async () => {
        const input = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
`;
        const builder = new ClashConfigBuilder(
          input, 
          ['AI Services'],
          [], 
          null, 
          'zh-CN', 
          ua  // 传入现代UA
        );
        const yamlText = await builder.build();
        const config = yaml.load(yamlText);

        // 期望：现代客户端使用mrs格式
        expectAiProvidersFormat(config['rule-providers'], 'mrs');
      });
    });
  });

  // 测试所有rule-providers的格式一致性
  describe('Format consistency across all rule-providers', () => {
    it('should use consistent format for all rule-providers (legacy client)', async () => {
      const input = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
`;
      const builder = new ClashConfigBuilder(
        input, 
        ['AI Services', 'Google', 'YouTube', 'Telegram'],  // 多个规则
        [], 
        null, 
        'zh-CN', 
        'Clash/1.0'  // 老版本UA
      );
      const yamlText = await builder.build();
      const config = yaml.load(yamlText);

      const providers = config['rule-providers'];
      expect(providers).toBeDefined();

      // 所有provider都应该使用yaml格式
      Object.entries(providers).forEach(([name, provider]) => {
        expect(provider.format).toBe('yaml');
        expect(provider.url).toContain('.yaml');
      });
    });
  });
});
