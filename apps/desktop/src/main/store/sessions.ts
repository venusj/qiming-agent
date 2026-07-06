import type { Database } from 'better-sqlite3';
import type { Session, Message, MessageRole, MessageKind, SessionBinding } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface SessionRow {
  id: string;
  title: string | null;
  provider_id: string | null;
  model: string | null;
  created_at: number;
  updated_at: number;
}

interface MsgRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tokens: number | null;
  created_at: number;
  /** P1.1 新增列；老 P0 行可能无此列（迁移会加，但类型上标注可选） */
  kind?: string;
}

function sRow(r: SessionRow): Session {
  return {
    id: r.id,
    title: r.title,
    providerId: r.provider_id,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mRow(r: MsgRow): Message {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as MessageRole,
    content: r.content,
    tokens: r.tokens,
    // 老 P0 数据迁移后 kind 列已有 DEFAULT 'message'，但读取空值时兜底
    kind: (r.kind ?? 'message') as MessageKind,
    createdAt: r.created_at,
  };
}

/** Session + Message CRUD 工厂。删 session 时 messages 经 FK ON DELETE CASCADE 自动删。 */
export function createSessionStore(db: Database) {
  return {
    listSessions(): Session[] {
      return (
        db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as SessionRow[]
      ).map(sRow);
    },
    getSession(id: string): Session | null {
      const r = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as SessionRow | undefined;
      return r ? sRow(r) : null;
    },
    createSession(title: string | null): Session {
      const now = Date.now();
      const id = randomUUID();
      db.prepare(
        'INSERT INTO sessions (id,title,provider_id,model,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      ).run(id, title, null, null, now, now);
      return this.getSession(id)!;
    },
    rename(id: string, title: string): Session | null {
      db.prepare('UPDATE sessions SET title=?, updated_at=? WHERE id=?').run(title, Date.now(), id);
      return this.getSession(id);
    },
    setBinding(id: string, binding: SessionBinding): Session | null {
      db.prepare('UPDATE sessions SET provider_id=?, model=?, updated_at=? WHERE id=?').run(
        binding.providerId,
        binding.model,
        Date.now(),
        id,
      );
      return this.getSession(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM sessions WHERE id=?').run(id); // 级联删 messages
    },
    messages(sessionId: string): Message[] {
      return (
        db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY created_at').all(
          sessionId,
        ) as MsgRow[]
      ).map(mRow);
    },
    appendMessage(
      sessionId: string,
      role: MessageRole,
      content: string,
      tokens: number | null = null,
      kind: MessageKind = 'message',
    ): Message {
      const now = Date.now();
      const id = randomUUID();
      db.prepare(
        'INSERT INTO messages (id,session_id,role,content,tokens,created_at,kind) VALUES (?,?,?,?,?,?,?)',
      ).run(id, sessionId, role, content, tokens, now, kind);
      db.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(now, sessionId);
      return { id, sessionId, role, content, tokens, kind, createdAt: now };
    },
  };
}
