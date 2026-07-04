import { useEffect } from 'react';
import { detectPlatform } from './lib/platform';
import { ChatPage } from './pages/ChatPage';
import { TitleBar } from '@qiming/ui';
import styles from './App.module.css';

/**
 * 应用根容器。
 * T12 起挂载聊天页（替换 T5 的占位标题屏）。
 * Windows 平台渲染自绘木纹标题栏；macOS/Linux 走系统标题栏。
 *
 * ── TitleBar 窗口控制占位 ──
 * 真正的最小化/最大化/关闭通过 IPC 实现，属于 T14（窗口控制）范畴。
 * T11 暴露的 window.qiming 当前不含 window 命名空间，
 * 故此处三个回调暂为空函数占位，调用 window.qiming.window.* 会报运行时错误。
 * T14 将在此接线真实窗口控制。
 */
const noop = () => {};

export function App() {
  const isWin = detectPlatform() === 'win32';
  useEffect(() => {
    document.documentElement.dataset.platform = detectPlatform();
  }, []);

  return (
    <div className={styles.app}>
      {isWin && (
        <TitleBar onClose={noop} onMinimize={noop} onToggleMaximize={noop} />
      )}
      <ChatPage />
    </div>
  );
}
