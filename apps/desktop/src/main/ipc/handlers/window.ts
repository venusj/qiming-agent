import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@qiming/shared';

/**
 * 窗口控制 IPC handlers。
 *
 * 通过 `BrowserWindow.fromWebContents(e.sender)` 解析调用方所属窗口，
 * 因此天然支持多窗口：每个 renderer 只能操控自己挂载的那个 BrowserWindow。
 * 若解析不到窗口（理论上不会发生），静默 no-op。
 */
export function registerWindowHandlers() {
  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (w.isMaximized()) {
      w.unmaximize();
    } else {
      w.maximize();
    }
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
}
