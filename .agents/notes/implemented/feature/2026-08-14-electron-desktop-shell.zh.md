# Agent Note: 基于 web profile 的 Electron 桌面壳

Status: implemented

[English](2026-08-14-electron-desktop-shell.md) | 中文

## 问题

浏览器 UI 只能以 `dsh web` 方式运行：本地服务器需要用户在浏览器标签页中打开。缺少桌面形态——一个带托盘图标的窗口化外壳，承载同一个 web 应用而无需浏览器，并能从检出目录一条命令启动。

## 决策

**新增 profile：在 web 层之上叠加桌面 bundle。** 内置 `electron` profile 模板为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-electron-app`，`dsh electron` 是 `--profile electron` 的硬编码别名，与 `dsh web` 镜像。web 组合——webserver、web 运行时、`/api` 网关、浏览器插件名册——原样复用；`dsh-web-app` 或 web bundle 的补丁不为新表面做任何修改。

**桌面 bundle 是一个包含两个入口的包。** `apps/electron`(`@deepseek-ai/dsh-electron-app`)同时提供 host 插件(`lib/index.js`)与 Electron 主进程(`lib/main.js`,通过包的 `./main` 导出解析)。补丁层只插入一行 `electron-app`,注入 `webServer` 服务且不需要任何配置。

**host 插件针对已绑定的服务器启动 Electron。** 它从活动 web server 计算 `http://host:port`,以该 URL(经 `DSH_WEB_URL`)spawn Electron 二进制,并耦合两个生命周期:壳退出时通过 `ctx.appExit` 请求整棵树关闭;树拆除时杀掉壳;当启动方未发信号而死亡时,通过管道 stdin 的 EOF 退出壳。缺少 `appExit` 会在挂载时快速失败。

**主进程等待服务器就绪后持有窗口与托盘。** 它轮询该 URL 直到有响应(30 秒预算),然后创建窗口并显示托盘。窗口隐藏系统标题栏:macOS 在内容上方保留红绿灯,win/linux 使用无边框窗口,由主进程向页面注入标题栏(拖拽区,最小化/最大化/关闭按钮按系统模式配色,经 `dshWindow` preload 桥路由到主进程)。当 preload 桥报告 darwin 平台时,web 布局会预留红绿灯区域(ui-layout 读取 `window.dshWindow`;普通浏览器没有该桥,不预留任何空间)。托盘图标是黑色形状的 `deepseek-tray` 资源,缩放到菜单栏规范的 24pt(2x 为 48px)并标记为 template image,macOS 会按菜单栏的浅色/深色渲染;窗口与 dock 图标为单一的 `icon.png`,对齐 DeepSeek 桌面客户端图标(深灰圆角矩形加白色 logo、四周内缩 9%,配色取自下载页的 icon.icns;文件本身圆角 6.1%,因系统会对已安装应用叠加标准遮罩),由 `gen:icons` 用 sharp 生成。关闭窗口会在所有平台退出应用(单窗口壳),退出会向启动方回报退出码。第二个实例会聚焦既有窗口。

**打包后的应用运行自己的服务器。** `electron-builder` 将桌面 bundle 连同完整的 `@deepseek-ai/dsh` 依赖树打包;`electron:build:mac` / `electron:build:win` 是 mac/win 目标的根脚本。打包应用(无 `DSH_WEB_URL`)以 `ELECTRON_RUN_AS_NODE` 子进程运行打包的 CLI(`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`),从就绪行解析 OS 分配的 URL,并镜像子进程生命周期(退出时杀子进程,子进程退出时退出应用)。mac 的 `.icns` 与 win 的 `.ico` 由 electron-builder 从 512px manifest png 自动生成;`npmRebuild: false` 保持 N-API 模块按 Node 构建,`smartUnpack` 处理原生 `.node` 文件。窗口打开前的失败会显示错误对话框而非静默退出。

## 备选方案

**`dsh electron` 子命令单独 spawn 一个 `dsh web` 子进程。** 否决:profile 组合才是共享的表面契约——一棵树、一个服务器、一条关闭路径。两个进程需要端口发现、健康握手和第二条生命周期路径,却没有任何能力收益。

**以 file URL 直接加载构建产物 `dist/index.html`。** 否决:web 应用依赖 host 树(`window.__DSH_BOOT__` 注入、`/api` 网关),服务器不可省略。

## 影响

`pnpm run electron:dev`(根脚本,转发到 `pnpm dsh electron`)启动 web profile 加壳。托盘图标复用既有 `deepseek-tray` 资源;窗口与 dock 使用既有 web-app-manifest-512 图标。Electron 是桌面 bundle 的运行时依赖,因此 profile 安装会携带二进制。壳目前没有开发者工具快捷键,也没有超出操作系统的自动隐藏行为;这些留作后续。打包依赖 electron-builder 对 pnpm workspace 依赖树的收集,需通过实际构建每个目标来验证;打包应用读取机器的 dsh 环境(key、`.env`、home),而非内嵌凭据。
