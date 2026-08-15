# `@deepseek-ai/dsh-electron-app`

English | [中文](README.zh.md)

The desktop bundle: an Electron shell hosting the dsh web surface. `dsh electron` boots the `electron` profile — the `web` profile composition (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`) plus this bundle — so the browser UI runs in a window with a tray icon instead of a browser tab.

## How it works

The bundle's patch layer inserts one row, `electron-app`, which injects the `webServer` service. Once the web server binds, the plugin ([`src/index.ts`](src/index.ts)) launches the Electron main process ([`src/main.ts`](src/main.ts)) with the bound URL in `DSH_WEB_URL`, and couples the two lifetimes:

- The shell's exit requests tree shutdown through `ctx.appExit`; the dsh process then disposes and exits.
- Tree teardown kills the shell.
- The piped stdin's EOF exits the shell when the dsh process dies without a signal.

The main process probes the URL until the server answers, opens the window (web-app-manifest-512 icon), sets the macOS dock icon from the same asset, and shows the `deepseek-tray` tray icon with show/exit actions. Closing the window quits the app on every platform.

## Window chrome

The system title bar is hidden for an immersive look: macOS keeps the traffic lights over the content (`titleBarStyle: 'hidden'`), while win/linux run frameless and the main process injects a title bar into the page (drag region plus minimize/maximize/close buttons, themed by the system light/dark mode). The buttons talk to the main process through the `dshWindow` preload bridge; the injected bar pushes `#root` down by its 40px height.

## Icon assets

`assets/` carries the icon resources. The tray uses `deepseek-tray.png` — a black shape on transparency, resized to the 24pt menu-bar size (48px @2x) and marked as a macOS template image, so the menu bar renders it in the current light/dark color automatically. The window and dock icon is the single `icon.png`, matched to the DeepSeek desktop client icon: a dark-gray rounded rect inset 9% per side (the Apple icon-template proportion, so the tile matches the visual weight of neighboring apps) with the macOS standard corner radius (22.5%, which the system would otherwise overlay on installed apps) and the logo rendered white from the blue logo's alpha shape. It is generated from the shipped `web-app-manifest-512x512.png` logo by `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` (script at `scripts/gen-electron-icons.ts`, needs the `sharp` devDependency). Swap the source files in place and re-run the generator to rebrand.

## Build and run

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (host plugin + main process)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

The web app's own flags apply, so `pnpm run electron:dev -- --port 8080` works like `dsh web --port 8080`.

## Packaging

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek Harness-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek Harness Setup-<ver>.exe
```

Packaging needs the built `lib/` entries (`pnpm run build` first), the `electron-builder` devDependency (`pnpm install`), and network access to download the Electron dist. The Windows build runs on any host that can run electron-builder; on macOS it additionally needs Wine. The macOS icon (`.icns`) and the Windows icon (`.ico`) are generated from `assets/web-app-manifest-512x512.png` by electron-builder, so no per-platform icon files are checked in.

A packaged app is self-contained: it runs the dsh web server inside itself as an `ELECTRON_RUN_AS_NODE` child (`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`) with an OS-assigned port, and loads the URL from the readiness line. When the shell is launched by the harness (`pnpm run electron:dev`, which boots `dsh electron`), it loads the harness's server URL from `DSH_WEB_URL` instead. The embedded server reads the machine's normal dsh environment (`DEEPSEEK_API_KEY`, `.env`, `$DSH_HOME`), so set those on the machine where the packaged app runs.
