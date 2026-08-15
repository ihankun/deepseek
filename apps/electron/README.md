# `@deepseek-ai/dsh-electron-app`

English | [中文](README.zh.md)

The desktop app: an Electron shell that runs the dsh web surface in a window with a tray icon instead of a browser tab. It is fully self-contained — the main process ([`src/main.ts`](src/main.ts)) starts its own dsh web server (`dsh web` semantics, OS-assigned port) and loads the URL from the readiness line, so the app depends on nothing but its own directory and the dsh environment.

## How it works

The main process starts the server as an `ELECTRON_RUN_AS_NODE` child:

- **Packaged app**: the bundled CLI (`node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0` inside the asar).
- **Dev launch** (`pnpm run electron:dev`): the checkout's built CLI (`apps/cli/lib/bin.js web --port 0`).

The server's stderr forwards to the app's, and the URL comes from the `dsh web: http://127.0.0.1:<port>` readiness line. The main process probes the URL until it answers, opens the window, sets the dock icon, and shows the `deepseek-tray` tray icon with show/exit actions. Closing the window quits the app on every platform; quitting kills the server child and the server's own exit quits the app. An optional `DSH_WEB_URL` environment value skips the embedded server (external-harness launch).

## Window chrome

The system title bar is hidden for an immersive look: macOS keeps the traffic lights over the content (`titleBarStyle: 'hidden'`), while win/linux run frameless and the main process injects a title bar into the page (drag region plus minimize/maximize/close buttons, themed by the system light/dark mode). The buttons talk to the main process through the `dshWindow` preload bridge (`src/preload.mts`); the injected bar pushes `#root` down by its 40px height. The web layout reserves the macOS traffic-light band when the preload bridge reports `darwin`.

## Icon assets

`assets/` carries the icon resources. The tray uses `deepseek-tray.png` — a black shape on transparency, resized to the 24pt menu-bar size (48px @2x) and marked as a macOS template image, so the menu bar renders it in the current light/dark color automatically. The window and dock icon is the single `icon.png`, matched to the DeepSeek desktop client icon: a dark-gray rounded rect inset 9% per side (the Apple icon-template proportion, so the tile matches the visual weight of neighboring apps) with the macOS standard corner radius (22.5%, which the system would otherwise overlay on installed apps) and the logo rendered white from the blue logo's alpha shape. It is generated from the shipped `web-app-manifest-512x512.png` logo by `pnpm --filter @deepseek-ai/dsh-electron-app run gen:icons` (script at `scripts/gen-electron-icons.ts`, needs the `sharp` devDependency). Swap the source files in place and re-run the generator to rebrand.

## Build and run

```sh
pnpm install                       # installs the electron runtime
pnpm run build                     # builds lib/ entries (dsh server + shell)
pnpm run electron:dev              # boot the desktop shell (web server + window)
```

`electron:dev` rebuilds the dsh server libs first, then launches the shell. The server reads the machine's dsh environment (`DEEPSEEK_API_KEY`, `.env`, `$DSH_HOME`), so set those before launching.

## Packaging

```sh
pnpm run electron:build:mac        # macOS: release/DeepSeek-<ver>-{arm64,x64}.{dmg,zip}
pnpm run electron:build:win        # Windows: release/DeepSeek-Setup-<ver>.exe
```

Packaging needs the built `lib/` entries (`pnpm run build` first), the `electron-builder` devDependency (`pnpm install`), and network access to download the Electron dist. The Windows build runs on any host that can run electron-builder; on macOS it additionally needs Wine. The macOS icon (`.icns`) and the Windows icon (`.ico`) are generated from `assets/icon.png` by electron-builder, so no per-platform icon files are checked in. The packaged app bundles the `@deepseek-ai/dsh` dependency tree (electron-builder collects it from the declared dependencies), so the asar contains everything the embedded server needs.
