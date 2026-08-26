# Agent Note: macOS update asset dot naming

Status: implemented

[English](2026-08-22-mac-update-asset-dot-naming.md) | 中文

## Problem

桌面壳的 macOS 自动更新按 productName 的字面拼写 `DeepSeek Harness-<version>-<arch>.zip`（带空格）匹配发布资产。electron-builder 发布到 GitHub release 时会规范化名称——空格变成点号（`DeepSeek.Harness-0.1.2-arm64.zip`，见 v0.1.2 release）——于是每次检查都匹配不到任何资产，报 `Update package for arm64 not found`。macOS 上自动更新从未发现过新版本，而仓库中没有任何记录说明发布器会在上传时改写产物名。

## Decision

**点号拼写是唯一的产物名，处处如此。** electron-builder 的 `artifactName` 显式声明它（mac 为 `DeepSeek.Harness-${version}-${arch}.${ext}`，win 为 `DeepSeek.Harness-Setup-${version}.${ext}`），因此本地构建产物与发布的 GitHub 资产逐字同名，上传时的隐式规范化不再参与。资产匹配位于 `apps/electron/src/mac-update-asset.ts` 的 `macAssetNamePattern(arch)`：以 `MAC_ARTIFACT_PREFIX = 'DeepSeek.Harness'` 构造锚定模式，只接受声明过的点号名称，拒绝同一 release 中的其他一切（`.dmg`、`.zip.blockmap`、其他架构 zip、`latest-mac.yml`）。同一前缀也用于更新器的下载缓存文件名。纯函数匹配器以真实 release 资产清单做单元测试。

## Alternatives considered

- **同时匹配两种拼写（把空格编译为 `[ .]`）。** 保留了修复前本地构建名的可用性，但为同一个产物编码了两种可接受拼写，并维持对未声明的上传规范化的依赖；在 `artifactName` 里一次性命名点号形式，是删除歧义而不是容忍歧义。
- **改为读取 `latest-mac.yml` 而非 releases API。** YAML 携带精确文件名和哈希，但它是为 electron-updater 自身的流程写的；手写安装器已经从一次 API 响应解析出架构、摘要和说明，再引入第二种元数据格式只会增加解析器而不删减任何代码。
- **比较前先规范化资产名**（两侧把点号替换为空格）。行为等价但有损转换；锚定的字面前缀直接声明了接受的名称，并对其他任何形式失败关闭。

## Consequences

- 从 v0.1.3 起，构建产物、GitHub 资产与更新检测模式全部使用点号名称；三者之间出现不一致时，是一次显式的配置改动而非无声行为。
- 已安装的 pre-0.1.3 客户端（仅空格的旧匹配器）看不到点号 release，需要手动升级一次；这是被接受的取舍，不是遗漏。
- Windows 不受影响——electron-updater 跟随 `latest.yml`，其中记录的是实际上传的名称。

## Related

- [Electron desktop shell](../feature/2026-08-14-electron-desktop-shell.zh.md) — 该更新器所属的打包应用。
