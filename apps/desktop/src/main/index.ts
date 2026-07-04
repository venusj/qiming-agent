import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window/create';
import { registerIpc } from './ipc/register';
import { getDb } from './store';

app.whenReady().then(() => {
  getDb(); // 建表 + 连接（懒加载单例）
  registerIpc(); // 注册 Main 侧 IPC handlers
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
