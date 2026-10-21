[English](README.md)

# Tiltview

> 在任意网站的视频上旋转、缩放、平移、镜像。

一款 Chrome/Edge（MV3）浏览器扩展，让你完全控制 HTML5 视频的几何变换 ——
横屏播放竖屏视频、舞蹈教学镜像、体育分析放大局部、拍歪了的讲座录像。

## 功能

- **旋转** —— 90° 步进、0/90/180/270 预设，或 0°–359° 任意角度
- **缩放** —— 0.5x–8x，带预设；滚轮缩放以光标为锚点
- **平移** —— 直接拖动画面，或用面板上的方向键
- **镜像** —— 水平、垂直独立翻转
- **自动适配** —— 按视频真实宽高比计算，旋转后**铺满**播放器
- **手势** —— 拖拽平移、`Ctrl`/`Alt` + 滚轮以光标为中心缩放、双击复位
- **浮动面板** —— 可拖动、记忆位置，运行在封闭 Shadow DOM 里，站点 CSS 干扰不了
- **播放器内按钮** —— YouTube、Twitch、Bilibili 上会在播放器控件旁注入一个按钮，
  也能打开面板；其他站点用浮动标签，或按 `Alt+Shift+T`
- **按站点记忆** —— 刷新、切集、广告插播后视图不丢
- **全屏可用** —— 面板和变换会跟着视频进入全屏
- **任意站点** —— YouTube、Twitch、Bilibili，以及任何带 `<video>` 的页面（含 shadow DOM）

## 快捷键

Chrome 最多允许 **4 个**命令带默认快捷键，所以只给没有其他单手操作路径的动作分配：

| 快捷键 | 功能 |
|---|---|
| `Alt+Shift+T` | 打开 / 关闭浮动面板 |
| `Alt+R` | 顺时针旋转 90° |
| `Alt+Shift+R` | 逆时针旋转 90° |
| `Alt+0` | 全部重置 |

缩放已有 `Ctrl`/`Alt` + 滚轮（以光标为锚），自动适配在面板里有按钮，因此这两个
命令**不带**默认键。全部 7 个命令都可以在 `chrome://extensions/shortcuts` 里自行绑定。

## 安装

### 从源码

```bash
git clone https://github.com/MLGBJDLW/Tiltview.git
cd Tiltview
pnpm install
pnpm build
```

打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→
选择 `.output/chrome-mv3`。

### 开发

```bash
pnpm dev            # 开发模式（热重载）
pnpm build          # 生产构建（Chrome MV3）
pnpm build:firefox  # Firefox 构建
pnpm compile        # TypeScript 类型检查
pnpm test           # 单元测试（vitest）
pnpm test:coverage  # 单元测试 + 覆盖率
pnpm test:e2e       # 构建后在真实 Chrome 里跑构建产物
pnpm check          # 编译 + 单元 + E2E
```

## 实现说明

变换被合成为**单个相似矩阵**（`T · R · S`）并以 `matrix3d` 输出，因此：

- **平移在屏幕坐标系里** —— 无论旋转多少度，向右拖画面就向右走。
  v0.1.0 把 `translate()` 写在 `rotate()` 之前，导致拖动方向跟着视频一起转；
- **镜像与旋转可叠加且不漂移** —— 不再堆叠多个 CSS 函数；
- **自动适配由几何计算** —— 用视频真实宽高比旋转后的包围盒，而不是写死的比例。

视图按 `源站 + 路径首段` 持久化：`youtube.com/watch?v=a` 与 `.../watch?v=b`
共用一份记忆，`.../shorts` 各自独立。

内容脚本注入到 `<all_urls>`，但检测不到 `<video>` 时保持静默；DOM 变动通过
单次 180ms 去抖合并处理，不再对每次页面变动都做全量 shadow DOM 扫描。

## 权限说明

| 权限 | 用途 |
|---|---|
| `storage` | 按站点记住旋转/缩放/平移 |
| `scripting` | 在安装/更新前已打开的标签页补注入内容脚本 |
| `activeTab` | 点击工具栏图标时读取当前标签页 |
| `<all_urls>`（主机） | 在任意站点检测视频 ——「任意站点」必须依赖它 |

内容脚本不读取页面内容、网络流量或表单数据，只定位 `<video>` 元素并施加 CSS 变换。

## 测试

- `tests/*.test.ts` —— 54 个单元测试，覆盖矩阵运算、自动适配几何、动作归约、
  存储键、消息校验和 DOM 应用器（含 v0.1.0 overflow 泄漏与旋转后平移的回归用例）。
- `tests/e2e/smoke.mjs` —— 18 项端到端断言，在真实 Chrome 里驱动**构建产物**：
  面板挂载、Shadow DOM 隔离、旋转、90° 下的屏幕系平移、overflow 复原、
  刷新后持久化、拖拽平移、双击复位。

## 许可证

MIT
