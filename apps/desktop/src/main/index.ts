import { app, BrowserWindow, dialog } from 'electron';
import { createMainWindow } from './window/create';
import { registerIpc } from './ipc/register';
import { getDb, createSettingsStore } from './store';
import { setWorkspaceRoot } from './tools/paths';

app.whenReady().then(async () => {
  getDb(); // 建表 + 连接（懒加载单例）
  registerIpc(); // 注册 Main 侧 IPC handlers（内部已把已存 workspace 灌进 paths 模块）
  // P2.7：首次启动 workspace 未设时弹目录选择器（registerIpc 已读 settings，此处只补"首次为空则弹窗"）
  const settings = createSettingsStore(getDb());
  if (!settings.get('workspace')) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) {
      const p = result.filePaths[0];
      settings.set('workspace', p);
      setWorkspaceRoot(p);
    }
  }
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
