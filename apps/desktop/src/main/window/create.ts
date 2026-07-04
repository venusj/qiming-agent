/**
 * 主窗口创建（含平台分支）。
 *
 * - macOS：titleBarStyle 'hiddenInset' + vibrancy 'under-window'，红黄绿内嵌；
 *   保留系统框架（frame: true）。
 * - Windows/Linux：frame: false，由 T6/T14 自绘标题栏补回拖拽区与控制按钮。
 *
 * dev 下加载 electron-vite 注入的 ELECTRON_RENDERER_URL；构建产物加载打包的
 * renderer/index.html。窗口默认隐藏，ready-to-show 后再显示，避免启动白闪。
 */
import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F4ECD8', // 宣纸白，避免启动白闪
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    frame: isMac, // macOS 保留系统框架；Windows 无边框自绘
    vibrancy: isMac ? 'under-window' : undefined,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // 外链一律用系统浏览器打开，禁止在 Electron 内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
