/** 每个 session 一个 AbortController，支持中断 */
const controllers = new Map<string, AbortController>();

export function getController(sessionId: string): AbortController {
  let c = controllers.get(sessionId);
  if (!c) {
    c = new AbortController();
    controllers.set(sessionId, c);
  }
  return c;
}

export function abortController(sessionId: string): void {
  controllers.get(sessionId)?.abort();
  controllers.delete(sessionId);
}
