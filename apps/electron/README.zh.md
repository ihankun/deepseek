# `@deepseek-ai/dsh-electron-app`

[English](README.md) | 中文

桌面 bundle:承载 dsh web 表面的 Electron 壳。`dsh electron` 启动 `electron` profile——即 `web` profile 组合(`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`)叠加本 bundle——让浏览器 UI 以带托盘图标的窗口运行,而非浏览器标签页。

## 工作原理

bundle 的补丁层只插入一行 `electron-app`,注入 `webServer` 服务。web server 绑定后,插件([`src/index.ts`](src/index.ts))以绑定 URL(经 `DSH_WEB_URL`)启动 Electron 主进程([`src/main.ts`](src/main.ts)),并耦合两个生命周期:

- 壳退出时通过 `ctx.appExit` 请求整棵树关闭;dsh 进程随后销毁并退出。
- 树拆除时杀掉壳。
- 当 dsh 进程未发信号而死亡时,通过管道 stdin 的 EOF 退出壳。

主进程轮询 URL 直到服务器响应,打开窗口(web-app-manifest-512 图标),用同一资源设置 macOS dock 图标,并显示带「显示/退出」操作的 `deepseek-tray` 托盘图标。关闭窗口会在所有平台退出应用。

## 窗口装饰

系统标题栏被隐藏以获得沉浸式观感:macOS 在内容上方保留红绿灯(`titleBarStyle: 'hidden'`),win/linux 使用无边框窗口,由主进程向页面注入标题栏(拖拽区加最小化/最大化/关闭按钮,按系统浅色/深色模式配色)。按钮通过 `dshWindow` preload 桥与主进程通信;注入的标题栏会把 `#root` 往下推 40px。

## 图标资源

`assets/` 存放图标资源。托盘使用 `deepseek-tray.png`——透明底的黑色形状,缩放到菜单栏规范的 24pt(2x 为 48px)并标记为 macOS template image,菜单栏会自动按当前浅色/深色渲染。窗口与 dock 图标为单一的 `icon.png`,对齐 DeepSeek 桌面客户端图标:深灰圆角矩形、四周内缩 9%(Apple 图标模板比例,使 dock 上的视觉重量与其他应用一致),圆角为系统标准 22.5%(即系统对已安装应用叠加的遮罩角度),logo 由蓝色 logo 的 alpha 形状渲染为白色。由 `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` 从内置的 `web-app-manifest-512x512.png` logo 生成(脚本在 `scripts/gen-electron-icons.ts`,需要 `sharp` devDependency)。原位替换源文件并重新运行生成器即可换肤。

## 构建与运行

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (host plugin + main process)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

web 应用自身的 flag 同样适用,因此 `pnpm run electron:dev -- --port 8080` 与 `dsh web --port 8080` 行为一致。

## 打包

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek Harness-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek Harness Setup-<ver>.exe
```

打包需要已构建的 `lib/` 产物(先 `pnpm run build`)、`electron-builder` devDependency(`pnpm install`),以及下载 Electron dist 的网络。Windows 构建可在任意能运行 electron-builder 的主机执行;在 macOS 上还需要 Wine。macOS 图标(`.icns`)与 Windows 图标(`.ico`)由 electron-builder 从 `assets/web-app-manifest-512x512.png` 自动生成,因此仓库不收录各平台图标文件。

打包后的应用是自包含的:它以内嵌 `ELECTRON_RUN_AS_NODE` 子进程的方式运行 dsh web server(`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`,OS 分配端口),并从就绪行解析 URL 加载。当壳由 harness 启动(`pnpm run electron:dev`,即 boot `dsh electron`)时,改为从 `DSH_WEB_URL` 加载 harness 的服务器 URL。内嵌 server 读取机器上常规的 dsh 环境(`DEEPSEEK_API_KEY`、`.env`、`$DSH_HOME`),请在运行打包应用的机器上配置这些。
