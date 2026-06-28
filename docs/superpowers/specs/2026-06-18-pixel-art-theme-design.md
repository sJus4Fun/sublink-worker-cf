# Sublink Worker 像素风主题设计说明书

本项目页面布局与设计将被重构为 FC 红白机街机复古像素风格 (NES Retro Arcade)。

## 用户审核项

> [!IMPORTANT]
> 字体加载依赖 Google Fonts 网络资源。在国内网络环境下，若对 Google Fonts 访问受限，请考虑后续替换为本地像素字体包。

## 变更内容

### 1. Global Shell & Layout
#### [MODIFY] [Layout.jsx](file:///Users/quentin/Documents/me/code-open/sublink-worker/src/components/Layout.jsx)
- 引入 Google Fonts `Press Start 2P`, `Silkscreen`, `VT323`。
- 修改 Tailwind CSS 配置，定义 `fontFamily` 和主题颜色 `nes-red`, `nes-cream`, `nes-dark`。
- 新增全局通用像素风样式类（`.nes-card`, `.nes-btn`, `.nes-input` 等）至 `<style>` 块中。

### 2. Header & Navigation
#### [MODIFY] [Navbar.jsx](file:///Users/quentin/Documents/me/code-open/sublink-worker/src/components/Navbar.jsx)
- 导航栏主体改为像素风直角黑边框。
- 链接选项改为 NES 复古按钮，增加点击动效与像素边框。

### 3. Core Converter Form
#### [MODIFY] [Form.jsx](file:///Users/quentin/Documents/me/code-open/sublink-worker/src/components/Form.jsx)
- 重构页面所有的输入框、多行文本域及下拉菜单，赋予直角像素黑边。
- 将配置面板和预览卡片全部换成 `.nes-card`。
- 全面修改按钮样式为 `.nes-btn`，主按钮使用 `bg-red-600 text-white hover:bg-red-700`，辅助按钮使用灰白色调。
- 英文标题与数字标识改为像素字体，优化标签间距。

### 4. Footer & Bottom Sections
#### [MODIFY] [Footer.jsx](file:///Users/quentin/Documents/me/code-open/sublink-worker/src/components/Footer.jsx)
- 更改为复古文本布局，增加像素边框。

---

## 验证计划

### 自动化验证
- 运行 `npm test` 确认没有破坏现有的 Hono 渲染逻辑。

### 手动验证
- 运行 `npm run dev` 并在浏览器中访问，检查所有页面交互元素在像素风下的视觉展现和暗黑模式适配。
