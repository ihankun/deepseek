# `@deepseek-ai/dsh-electron-app`

[English](README.md) | 中文

桌面应用:以带托盘图标的窗口承载 dsh web 表面,而非浏览器标签页。完全自包含——主进程([`src/main.ts`](src/main.ts))自行启动 dsh web server(`dsh web` 语义,OS 分配端口)并从就绪行解析 URL,除自身目录与 dsh 环境外不依赖任何东西。

## 工作原理

主进程以 `ELECTRON_RUN_AS_NODE` 子进程启动服务器:

- **打包应用**:内置 CLI(`app.asar` 内 `node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`)。
- **开发启动**(`pnpm run electron:dev`):检出目录的已构建 CLI(`apps/cli/lib/bin.js web --port 0`)。

服务器 stderr 转发到应用;URL 来自 `dsh web: http://127.0.0.1:<port>` 就绪行。主进程轮询 URL 直到有响应,然后打开窗口、设置 dock 图标,并显示带「显示/退出」菜单的 `deepseek-tray` 托盘图标。关闭窗口会在所有平台退出应用;退出会杀掉服务器子进程,服务器自身退出也会结束应用。可选的环境变量 `DSH_WEB_URL` 可跳过内嵌服务器(外部 harness 启动)。

## 窗口装饰

系统标题栏被隐藏以获得沉浸式观感:macOS 在内容上方保留红绿灯(`titleBarStyle: 'hidden'`),win/linux 使用无边框窗口,由主进程向页面注入标题栏(拖拽区加最小化/最大化/关闭按钮,按系统浅色/深色模式配色)。按钮通过 `dshWindow` preload 桥(`src/preload.mts`)与主进程通信;注入的标题栏会把 `#root` 往下推 40px。当 preload 桥报告 `darwin` 时,web 布局会预留红绿灯区域。

## 图标资源

`assets/` 存放图标资源。托盘使用 `deepseek-tray.png`——透明底的黑色形状,缩放到菜单栏规范的 24pt(2x 为 48px)并标记为 macOS template image,菜单栏会自动按当前浅色/深色渲染。窗口与 dock 图标为单一的 `icon.png`,对齐 DeepSeek 桌面客户端图标:深灰圆角矩形、四周内缩 9%(Apple 图标模板比例,使 dock 上的视觉重量与其他应用一致),圆角为系统标准 22.5%(即系统对已安装应用叠加的遮罩角度),logo 由蓝色 logo 的 alpha 形状渲染为白色。由 `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` 从内置的 `web-app-manifest-512x512.png` logo 生成(脚本在 `scripts/gen-electron-icons.ts`,需要 `sharp` devDependency)。原位替换源文件并重新运行生成器即可换肤。

## 构建与运行

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (dsh server + shell)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

`electron:dev` 会先重建 dsh 服务器库,再启动壳。服务器读取机器上常规的 dsh 环境(`DEEPSEEK_API_KEY`、`.env`、`$DSH_HOME`),请在启动前配置。

## 打包

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek-Setup-<ver>.exe
```

打包需要已构建的 `lib/` 产物(先 `pnpm run build`)、`electron-builder` devDependency(`pnpm install`),以及下载 Electron dist 的网络。Windows 构建可在任意能运行 electron-builder 的主机执行;在 macOS 上还需要 Wine。macOS 图标(`.icns`)与 Windows 图标(`.ico`)由 electron-builder 从 `assets/icon.png` 自动生成,因此仓库不收录各平台图标文件。打包应用携带 `@deepseek-ai/dsh` 依赖树(electron-builder 从声明的 dependencies 收集),asar 内即包含内嵌服务器所需的全部内容。
