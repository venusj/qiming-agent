/**
 * 主窗口创建。
 *
 * T4 阶段为最小存根：仅创建一个最小可用 BrowserWindow 并加载 dev server / 打包产物。
 * T5 将在此实现完整的平台分支逻辑（macOS 无边框 / Windows / Linux 尺寸与样式）
 * 与窗口生命周期管理（多窗口、状态恢复等）。
 */
import { BrowserWindow } from 'electron';
import { join } from 'node:path';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '启明',
    autoHideMenuBar: true,
  });

  // electron-vite 在 dev 期间提供 MAIN_VITE_DEV_SERVER_URL；构建期间加载打包产物。
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
