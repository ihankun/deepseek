# Agent Note: macOS update asset dot naming

Status: implemented

[English](2026-08-22-mac-update-asset-dot-naming.md) | 中文

## Problem

桌面壳的 macOS 自动更新按 productName 的字面拼写 `DeepSeek Harness-<version>-<arch>.zip`（带空格）匹配发布资产。electron-builder 发布到 GitHub release 时会规范化名称——空格变成点号（`DeepSeek.Harness-0.1.2-arm64.zip`，见 v0.1.2 release）——于是每次检查都匹配不到任何资产，报 `Update package for arm64 not found`。macOS 上自动更新从未发现过新版本，而仓库中没有任何记录说明 GitHub 会在上传时改写产物名。

## Decision

资产匹配移入 `apps/electron/src/mac-update-asset.ts` 的 `macAssetNamePattern(arch)`：productName 中的空格在模式里编译为 `[ .]`，因此 GitHub 发布的点号拼写和本地构建的空格拼写都能匹配，而同一 release 中的 `.dmg`、`.zip.blockmap`、其他架构 zip 和 `latest-mac.yml` 仍不匹配。更新器消费该模式；共享模块同时导出 `MAC_PRODUCT_NAME` 供下载缓存文件名使用。纯函数匹配器以 v0.1.2 的真实资产清单做单元测试。

## Alternatives considered

- **改名产物以消除歧义**（`artifactName: "harness-..."`）。丢失 release 资产中的 productName 品牌，且仍依赖一条未声明的规范化规则；同时匹配两种拼写让已发布的名称继续可用。
- **改为读取 `latest-mac.yml` 而非 releases API。** YAML 携带精确文件名和哈希，但它是为 electron-updater 自身的流程写的；手写安装器已经从一次 API 响应解析出架构、摘要和说明，再引入第二种元数据格式只会增加解析器而不删减任何代码。
- **比较前先规范化资产名**（两侧把点号替换为空格）。行为等价但有损转换；锚定的字符类直接声明了接受的拼写，并对其他任何形式失败关闭。

## Consequences

- macOS 自动更新能在资产为点号拼写的 release 上找到更新包；若本地构建的空格拼写被原样上传，也仍然可用。
- `[ .]` 容错是承重的：把它简化回字面空格会无声地重新引入故障（错误信息只提到架构名）。
- Windows 不受影响——electron-updater 跟随 `latest.yml`，其中记录的是实际上传的名称。

## Related

- [Electron desktop shell](../feature/2026-08-14-electron-desktop-shell.md) — 该更新器所属的打包应用。
