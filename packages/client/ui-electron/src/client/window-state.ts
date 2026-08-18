/**
 * Window-bounds persistence for the desktop shell.
 *
 * The main process owns persistence: it writes the window bounds to a state
 * file on move/resize (debounced) and on quit, and serves them back to the
 * renderer. This module restores them at boot, so every launch reopens the
 * window where it was left.
 * @module @deepseek-ai/dsh-client-ui-electron/window-state
 */

/**
 * Restore the shell window to its persisted geometry, if any.
 * @param dshWindow - The preload bridge of the desktop shell.
 */
export async function restoreWindowState(dshWindow: NonNullable<Window['dshWindow']>): Promise<void> {
  const saved = await dshWindow.getSavedBounds()
  if (saved === null) return
  await dshWindow.setBounds(saved)
}
