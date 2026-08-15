# Agent Note: Electron 桌面壳

Status: implemented

[English](2026-08-14-electron-desktop-shell.md) | 中文

## 问题

浏览器 UI 只能以 `dsh web` 方式运行:本地服务器需要用户在浏览器标签页中打开。缺少桌面形态——一个带托盘图标的窗口化外壳,承载同一个 web 应用而无需浏览器,能从检出目录一条命令启动,并可打包为 macOS/Windows 应用。

## 决策

**自包含的 Electron 应用持有完整运行时。** `apps/electron`(`@deepseek-ai/dsh-electron-app`)是桌面表面触及的唯一包。主进程以 `ELECTRON_RUN_AS_NODE` 子进程启动自己的 dsh web server——开发时用检出目录的已构建 CLI(`apps/cli/lib/bin.js web --port 0`),打包时用内置 CLI——从 `dsh web: http://127.0.0.1:<port>` 就绪行解析 OS 分配的 URL,并耦合两个生命周期:退出时杀服务器子进程,服务器自身退出结束应用。可选 `DSH_WEB_URL` 跳过内嵌服务器以支持外部 harness 启动。无需改动任何 profile、bundle 或 dsh CLI——`dsh web` 及其 web profile 本就存在。

**打包的服务器从磁盘解包副本运行,而非 asar。** dsh 的 `healProfilesModuleFallback` 会创建从 `$DSH_HOME/profiles/node_modules` 到安装包的符号链接;在 asar 内部,这些目标是真实文件系统无法跟随的虚拟路径,因此启动会以 MODULE_NOT_FOUND 失败。主进程因此把内置 `node_modules` 按应用版本从 asar 复制到 `userData/runtime/<version>/`(临时目录加原子重命名),并从磁盘副本启动服务器。electron-builder 的依赖收集还会漏掉 pnpm workspace 的 peerDependencies(仅 `@deepseek-ai/dsh-invariants` 就被 166 个包依赖),因此运行时所需的每个包都显式声明在 `apps/electron` 的 dependencies 中。

**窗口隐藏系统标题栏。** macOS 在内容上方保留红绿灯(`titleBarStyle: 'hidden'`、`trafficLightPosition`),win/linux 使用无边框窗口,由主进程向页面注入标题栏(拖拽区;最小化/最大化/关闭按钮按系统模式配色)。按钮经 `dshWindow` preload 桥(`src/preload.mts`,以 ESM `.mjs` 形式发布;路径从主入口自身位置推导,因为 dev 模式下 `app.getAppPath()` 返回入口目录而非包根)路由到主进程。当桥报告 `darwin` 时,web 布局(ui-layout 的 `AppFrame`)预留红绿灯区域。

**图标对齐 DeepSeek 桌面客户端。** 托盘是黑色形状的 `deepseek-tray` 资源,缩放到菜单栏规范的 24pt(2x 为 48px)并标记为 template image,macOS 会按菜单栏颜色渲染。窗口与 dock 图标为 `icon.png`——logo 由蓝色 logo 的 alpha 形状渲染为白色,置于深灰圆角矩形上,四周内缩 9%,并内置系统标准圆角 22.5%(系统会对已安装应用叠加该遮罩,但不会作用于运行时设置的 dock 图标)。`gen:icons` 用 sharp 从白色发布图标(`icon-white.png`)重新生成。

**打包** 使用 electron-builder:`electron:build:mac` / `electron:build:win` 根脚本,`productName: DeepSeek`,版本 `0.0.1`,图标由 `assets/icon.png` 生成,`npmRebuild: false`(N-API 模块保持按 Node 构建),`@deepseek-ai/dsh` 依赖树被收集进 asar,内嵌服务器因此完整。

## 备选方案

**`dsh electron` profile:boot web profile 加一个 spawn 壳的 bundle。** 否决:需要改动 `apps/cli`(子命令别名)、`packages/boot/app-boot`(profile 模板)和 tsconfig paths——三个包只为让一个表面持有自己的服务器。自包含主进程用一个包达成同样目标,且原样复用 `dsh web` 的既有组合。

**独立的 `dsh web` 子进程加端口握手。** 否决:`ELECTRON_RUN_AS_NODE` 子进程会打印就绪行,无需握手协议;URL 解析是对该文档化行的单条正则。

**以 file URL 直接加载构建产物 `dist/index.html`。** 否决:web 应用依赖 host 树(`window.__DSH_BOOT__` 注入、`/api` 网关),服务器不可省略。

## 影响

`pnpm run electron:dev` 会重建 dsh 服务器库并启动壳;打包应用完全自包含。托盘图标复用既有 `deepseek-tray` 资源;窗口与 dock 使用 `icon.png`。Electron 是桌面包的 devDependency。壳目前没有开发者工具快捷键,也没有超出操作系统的自动隐藏行为;这些留作后续。打包应用读取机器的 dsh 环境(key、`.env`、home),而非内嵌凭据。dsh CLI(`apps/cli`)与 profile 模板零改动,因此桌面表面可以干净地合入上游 fork。
