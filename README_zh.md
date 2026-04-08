[English](README.md)

# Tiltview

> 在 YouTube、Bilibili、Twitch 等视频网站上旋转、缩放、平移、镜像视频。

一款 Chrome/Edge MV3 浏览器扩展，让你完全控制 HTML5 视频的变换效果。

## 功能特性

- 🔄 **旋转**视频：0°、90°、180°、270° 或自定义角度
- 🔍 **缩放**：0.5x – 5x，提供预设按钮（1x、1.5x、2x、3x）
- ↔️ **平移**：拖拽视频到任意方向
- 🪞 **镜像**：水平翻转和垂直翻转
- 📐 **自适应**：旋转后自动缩放视频以适应容器
- 🎮 **内嵌控件**：控制面板直接集成到播放器控制栏中
- 🌐 **多站点支持**：YouTube、Bilibili、Twitch + 通用适配器支持任意 HTML5 视频

## 支持的网站

| 网站 | 状态 | 备注 |
|------|------|------|
| YouTube | ✅ | 兼容 Shadow DOM |
| Bilibili | ✅ | 支持新旧版播放器 |
| Twitch | ✅ | 直播 + 点播 |
| 其他网站 | ✅ | 通用适配器，支持任意 HTML5 视频 |

## 安装方法

### 从源码安装

1. 克隆本仓库
2. `pnpm install`
3. `pnpm build`
4. 打开 Chrome → `chrome://extensions` → 开启「开发者模式」
5. 点击「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3` 文件夹

### 开发

```bash
pnpm dev           # 启动开发模式（热重载）
pnpm build         # 构建生产版本
pnpm build:firefox # 构建 Firefox 版本
pnpm compile       # TypeScript 类型检查
```

## 使用方法

1. 打开支持的视频网站
2. 点击工具栏中的 Tiltview 图标，或使用播放器控制栏中的内嵌控制按钮
3. 使用控件旋转、缩放、平移或镜像视频
4. 点击「重置」恢复原始状态

## 技术栈

- TypeScript
- WXT（Web Extension Tools）
- React
- Tailwind CSS v4
- Chrome Extension Manifest V3

## 权限说明

- `activeTab` — 仅在你与扩展交互时访问当前标签页

## 许可证

MIT
