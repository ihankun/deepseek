# Agent Note: Electron desktop shell

Status: implemented

English | [中文](2026-08-14-electron-desktop-shell.zh.md)

## Problem

The browser UI runs only as `dsh web`: a local server the user opens in a browser tab. A desktop surface is missing — a windowed shell with a tray icon that hosts the same web app without a browser, started with one command from the checkout, and packageable into macOS/Windows apps.

## Decision

**A self-contained Electron app owns its whole runtime.** `apps/electron` (`@deepseek-ai/dsh-electron-app`) is the only package the desktop surface touches. The main process starts its own dsh web server as an `ELECTRON_RUN_AS_NODE` child — the checkout's built CLI (`apps/cli/lib/bin.js web --port 0`) in dev, the bundled CLI in a packaged app — parses the `dsh web: http://127.0.0.1:<port>` readiness line for the OS-assigned URL, and couples the two lifetimes: quitting kills the server child, the server's own exit quits the app. An optional `DSH_WEB_URL` skips the embedded server for an external-harness launch. No profile, bundle, or dsh CLI change is required — `dsh web` and its web profile already exist.

**A packaged server runs from a disk materialization, not the asar.** dsh's `healProfilesModuleFallback` creates symlinks from `$DSH_HOME/profiles/node_modules` to the installation's packages; inside an asar those targets are virtual paths the real filesystem cannot follow, so boot fails with MODULE_NOT_FOUND. The main process therefore copies the bundled `node_modules` out of the asar once per app version into `userData/runtime/<version>/` (temp dir + atomic rename) and starts the server from there. electron-builder's dependency collection also misses pnpm-workspace peerDependencies (`@deepseek-ai/dsh-invariants` alone is required by 166 packages), so every package the runtime needs is declared explicitly in `apps/electron`'s dependencies.

**The window hides the system title bar.** macOS keeps its traffic lights over the content (`titleBarStyle: 'hidden'`, `trafficLightPosition`), while win/linux run frameless and the main process injects a title bar into the page (drag region; minimize/maximize/close buttons themed by system mode). The buttons route to the main process over the `dshWindow` preload bridge (`src/preload.mts`, shipped as an ESM `.mjs`; the path is derived from the main entry's own location because `app.getAppPath()` returns the entry directory in dev, not the package root). The web layout (ui-layout's `AppFrame`) reserves the macOS traffic-light band when the bridge reports `darwin`.

**The icons follow the DeepSeek desktop client.** The tray is the black-shape `deepseek-tray` asset resized to the 24pt menu-bar size (48px @2x) and marked as a template image, so macOS renders it in the menu bar's color. The window/dock icon is `icon.png` — the logo rendered white from the blue logo's alpha shape over a dark-gray rounded rect inset 9% per side, with the macOS standard corner radius (22.5%) baked in (the system overlays that mask on installed apps but not on a runtime-set dock icon). `gen:icons` regenerates it via sharp from the white release icon (`icon-white.png`).

**Packaging** is electron-builder: `electron:build:mac` / `electron:build:win` root scripts, `productName: DeepSeek`, version `0.0.1`, icons generated from `assets/icon.png`, `npmRebuild: false` (N-API modules stay Node-built), and the `@deepseek-ai/dsh` dependency tree collected into the asar so the embedded server is complete.

## Alternatives considered

**A `dsh electron` profile booting the web profile plus a bundle that spawns the shell.** Rejected: it required touching `apps/cli` (subcommand alias), `packages/boot/app-boot` (profile template), and tsconfig paths — three packages for a surface that can own its server. The self-contained main process achieves the same with one package and reuses `dsh web`'s existing composition untouched.

**A separate `dsh web` child with port handshake.** Rejected: the `ELECTRON_RUN_AS_NODE` child prints the readiness line, so no handshake protocol is needed; the URL parse is a single regex over the documented line.

**Loading the built `dist/index.html` as a file URL.** Rejected because the web app requires the host tree (window.__DSH_BOOT__ injection, `/api` gateway), so the server is not optional.

## Consequences

`pnpm run electron:dev` rebuilds the dsh server libs and launches the shell; the packaged app is fully self-contained. The tray icon is the existing `deepseek-tray` asset; the window and dock use `icon.png`. Electron is a devDependency of the desktop package. The shell has no dev-tools shortcut and no auto-hide behavior beyond the OS; those remain follow-ups. The packaged app reads the machine's dsh environment (key, `.env`, home) rather than bundling credentials. The dsh CLI (`apps/cli`) and profile templates are untouched, so the desktop surface merges cleanly into an upstream fork.
