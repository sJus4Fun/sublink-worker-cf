<div align="center">
  <img src="public/logo.png" alt="SubLink Quin" width="120" height="120"/>

  <h1><b>SubLink Quin</b></h1>
  <h5><i>One Worker, All Subscriptions (一个 Worker，搞定所有订阅)</i></h5>

  <p><b>一款轻量级的代理协议订阅转换与管理工具，支持部署在 Cloudflare Workers、Vercel 或 Node.js。</b></p>

  <p>
    <a href="README.md"><b>English</b></a> | <b>简体中文</b>
  </p>

  <a href="https://trendshift.io/repositories/12291" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/12291" alt="quin95%2Fsublink-worker | Trendshift" width="250" height="55"/>
  </a>

  <br>

<p style="display: flex; align-items: center; gap: 10px;">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/quin95/sublink-worker">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" style="height: 32px;"/>
  </a>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/quin95/sublink-worker&env=KV_REST_API_URL,KV_REST_API_TOKEN&envDescription=Vercel%20KV%20credentials%20for%20data%20storage&envLink=https://vercel.com/docs/storage/vercel-kv">
    <img src="https://vercel.com/button" alt="Deploy to Vercel" style="height: 32px;"/>
  </a>
</p>
</div>

## 🖥️ 界面预览

![首页](public/images/sublink-1.png)
![订阅管理](public/images/sublink-2.png)

## 🚀 快速开始

### 一键部署
- 点击上方任意“部署 (deploy)”按钮
- 搞定！更多信息请参阅 [文档](https://sublink.works/guide/quick-start/)。

### 其他运行环境
- **Node.js**: `npm run build:node && node dist/node-server.cjs`
- **Vercel**: `vercel deploy`（在项目设置中配置 KV）

## ✨ 特性

### 支持的协议
ShadowSocks • VMess • VLESS • Hysteria2 • Trojan • TUIC

### 支持的客户端
Sing-Box • Clash • Xray/V2Ray • Surge

### 支持的输入源
- Base64 订阅链接
- HTTP/HTTPS 订阅链接
- 完整配置文件（Sing-Box JSON、Clash YAML、Surge INI）

### 核心功能
- 从多个数据源导入订阅
- 生成固定或随机的短链接（基于 KV 存储）
- 支持浅色/深色主题切换
- 适用于脚本自动化的灵活 API
- 多语言支持（中文、英文、波斯语、俄语）
- 带有预定义规则集和可自定义策略组的 Web 界面

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request 来帮助改进该项目。

## 🔗 友情链接

- [LINUX DO 社区](https://linux.do/)

## 🙏 致谢与声明

本项目基于优秀的开源项目 [7Sageer/sublink-worker](https://github.com/7Sageer/sublink-worker) 进行二次开发与改造。在此对原作者及所有贡献者的杰出工作表示最诚挚的感谢！

## 📄 开源协议

本项目采用 MIT 许可协议 - 详情请参阅 [LICENSE](LICENSE) 文件。

## ⚠️ 免责声明

本项目仅供学习与交流使用。请勿用于非法用途。使用本项目产生的所有后果由用户自行承担，与开发者无关。

## ⭐ Star 历史

感谢所有给本项目点亮星星的小伙伴！🌟

<a href="https://star-history.com/#quin95/sublink-worker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=quin95/sublink-worker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=quin95/sublink-worker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=quin95/sublink-worker&type=Date" />
 </picture>
</a>
