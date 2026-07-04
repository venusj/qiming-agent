import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import styles from './MessageBubble.module.css';
import type { Message } from '@qiming/shared';

/**
 * 单条消息气泡。
 * 用户消息 = 绢布色偏右；助手消息 = 宣纸色偏左（带纸纹）。
 * 内容走 react-markdown 渲染，代码块用 Prism 高亮（古风暗背景适配）。
 */
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.assistant}`}>
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            // 提取 ```lang 中的语言标识。
            const match = /language-(\w+)/.exec(className || '');
            if (match) {
              return (
                <SyntaxHighlighter
                  language={match[1]}
                  // 使用 inline prop 区分行内/块级；新版 react-syntax-highlighter 仍透传。
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
}
