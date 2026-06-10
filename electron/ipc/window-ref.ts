import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindowRef(win: BrowserWindow) {
  mainWindow = win;
}

export function clearMainWindowRef() {
  mainWindow = null;
}

export function getMainWindowRef(): BrowserWindow | null {
  return mainWindow?.isDestroyed() ? null : mainWindow;
}
