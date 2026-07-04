import { useEffect, useState } from 'react';
import { detectPlatform } from './lib/platform';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { TitleBar, Button } from '@qiming/ui';
import styles from './App.module.css';

/**
 * 应用根容器。
 * T12 起挂载聊天页（替换 T5 的占位标题屏）；T13 加入「对话 / 设置」页面切换。
 * Windows 平台渲染自绘木纹标题栏；macOS/Linux 走系统标题栏。
 *
 * ── TitleBar 窗口控制 ──
 * T14：最小化/最大化/关闭通过 IPC 调 window.qiming.window.*，
 * 经 preload → main 的 window handler 操控所属 BrowserWindow。
 */
type Page = 'chat' | 'settings';

export function App() {
  const isWin = detectPlatform() === 'win32';
  const [page, setPage] = useState<Page>('chat');
  useEffect(() => {
    document.documentElement.dataset.platform = detectPlatform();
  }, []);

  return (
    <div className={styles.app}>
      {isWin && (
        <TitleBar
          onClose={() => window.qiming.window.close()}
          onMinimize={() => window.qiming.window.minimize()}
          onToggleMaximize={() => window.qiming.window.toggleMaximize()}
        />
      )}
      <nav className={styles.nav}>
        <Button
          variant={page === 'chat' ? 'primary' : 'ghost'}
          onClick={() => setPage('chat')}
        >
          对话
        </Button>
        <Button
          variant={page === 'settings' ? 'primary' : 'ghost'}
          onClick={() => setPage('settings')}
        >
          设置
        </Button>
      </nav>
      {page === 'chat' ? <ChatPage /> : <SettingsPage />}
    </div>
  );
}
