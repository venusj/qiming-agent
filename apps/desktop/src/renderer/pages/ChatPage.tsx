import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useChatStore } from '../stores/chat';
import { MessageBubble } from '../components/MessageBubble';
import { ContextMeter } from '../components/ContextMeter';
import { ApprovalDialog } from '../components/ApprovalDialog';
import { Button, Textarea, Dropdown, InkLoading } from '@qiming/ui';
import styles from './ChatPage.module.css';

/**
 * 聊天主页面：左侧会话卷轴栏 + 右侧消息流 + 输入框 + provider/model 选择。
 */
export function ChatPage() {
  const s = useChatStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初始化：拉会话与 provider 列表；若无会话则新建，否则选中首个。
  // 注意：必须在 loadSessions 的 await 完成后再判断 sessions.length，
  // 否则读到的是初始空数组（brief 原始写法的隐性 bug）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await s.loadSessions();
      await s.loadProviders();
      if (cancelled) return;
      if (s.sessions.length === 0) {
        await s.newSession();
      } else if (!s.activeSessionId) {
        await s.selectSession(s.sessions[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 消息流或流式缓冲变化时自动滚到底。
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [s.messages, s.streamBuffer]);

  const activeSession = s.sessions.find((x) => x.id === s.activeSessionId);
  const activeProvider = s.providers.find(
    (p) => p.id === activeSession?.providerId,
  );
  const models = activeProvider?.enabledModels ?? [];

  const send = () => {
    if (!input.trim() || s.streaming) return;
    const text = input;
    setInput('');
    void s.send(text);
  };

  return (
    <div className={styles.layout}>
      {/* 会话侧栏 —— 卷轴 / 竹简意象 */}
      <aside className={styles.sidebar}>
        <Button
          variant="primary"
          className={styles.newBtn}
          onClick={() => s.newSession()}
        >
          新建 · 卷起一卷
        </Button>
        <ul className={styles.sessionList}>
          {s.sessions.map((sess) => (
            <li
              key={sess.id}
              className={`${styles.sessionItem} ${
                sess.id === s.activeSessionId ? styles.active : ''
              }`}
              onClick={() => s.selectSession(sess.id)}
            >
              {sess.title || '新对话'}
            </li>
          ))}
        </ul>
      </aside>

      {/* 主区 */}
      <main className={styles.main}>
        {/* 顶栏：provider/model 选择 */}
        <div className={styles.topbar}>
          <Dropdown
            value={activeSession?.providerId ?? ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const p = s.providers.find((x) => x.id === e.target.value);
              if (p) s.setBinding(p.id, p.defaultModel);
            }}
          >
            <option value="">选择厂商…</option>
            {s.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Dropdown>
          <Dropdown
            value={activeSession?.model ?? ''}
            disabled={!models.length}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              activeSession &&
              activeSession.providerId &&
              s.setBinding(activeSession.providerId, e.target.value)
            }
          >
            {models.length === 0 && <option value="">（未选厂商）</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Dropdown>
          {s.usage && (
            <ContextMeter
              used={s.usage.usedTokens}
              total={s.usage.contextWindow}
            />
          )}
        </div>

        {/* 消息流 */}
        <div className={styles.messages} ref={scrollRef}>
          {s.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {/* 流式进行中：实时渲染已累积的 buffer（文本逐字出现）+ 研墨 loading */}
          {s.streaming && (
            <>
              {s.streamBuffer && (
                <MessageBubble
                  message={{
                    id: 'stream',
                    sessionId: s.activeSessionId ?? '',
                    role: 'assistant',
                    content: s.streamBuffer,
                    tokens: null,
                    kind: 'message',
                    createdAt: 0,
                  }}
                />
              )}
              <div className={styles.loadingRow}>
                <InkLoading />
              </div>
            </>
          )}
          {/* 流已结束但 buffer 未被 onDone 清空（如错误尾注）的兜底显示 */}
          {!s.streaming && s.streamBuffer && (
            <MessageBubble
              message={{
                id: 'stream-tail',
                sessionId: s.activeSessionId ?? '',
                role: 'assistant',
                content: s.streamBuffer,
                tokens: null,
                kind: 'message',
                createdAt: 0,
              }}
            />
          )}
          {s.messages.length === 0 && !s.streaming && (
            <div className={styles.empty}>研墨待问 · 落字成章</div>
          )}
        </div>

        {/* 输入区 */}
        <div className={styles.composer}>
          <Textarea
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setInput(e.target.value)
            }
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="研墨提笔，落字成文…（Enter 发送，Shift+Enter 换行）"
            rows={3}
          />
          <div className={styles.composerActions}>
            {s.streaming ? (
              <Button onClick={() => s.stop()}>停笔</Button>
            ) : (
              <Button variant="primary" onClick={send}>
                落墨
              </Button>
            )}
          </div>
        </div>
      </main>
      <ApprovalDialog />
    </div>
  );
}
