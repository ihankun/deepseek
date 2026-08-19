/** `electron` namespace dictionaries for the update UI. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'update.title': '软件更新',
  'update.checking': '正在检查更新…',
  'update.upToDate': '已是最新版本',
  'update.available': '发现新版本',
  'update.version': '版本 v{version}',
  'update.download': '下载更新',
  'update.downloading': '正在下载 {percent}%',
  'update.downloaded': '下载完成，重启安装',
  'update.restartAndInstall': '重启并安装',
  'update.retry': '重试',
  'update.error': '更新失败：{error}',
  'update.unsupported': '当前环境不支持自动更新',
  'update.releaseNotes': '更新日志',
  'update.openReleasePage': '查看发布页',
} satisfies Record<string, string>

/** The electron namespace key union. */
export type ElectronKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'update.title': 'Software Update',
  'update.checking': 'Checking for updates…',
  'update.upToDate': 'You are up to date',
  'update.available': 'New version available',
  'update.version': 'Version v{version}',
  'update.download': 'Download update',
  'update.downloading': 'Downloading {percent}%',
  'update.downloaded': 'Downloaded, restart to install',
  'update.restartAndInstall': 'Restart & Install',
  'update.retry': 'Retry',
  'update.error': 'Update failed: {error}',
  'update.unsupported': 'Auto-update is not supported in this environment',
  'update.releaseNotes': 'Release Notes',
  'update.openReleasePage': 'Open Release Page',
} satisfies Record<ElectronKey, string>
