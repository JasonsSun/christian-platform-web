// 进程内「通知实时推送」发布/订阅总线。
// 与直播实时总线 realtime.ts 完全独立:这里只服务于「站内通知 SSE」,
// 通过 globalThis 在同一进程(server.js 与 Next 同进程)内共享单例。
//
// 设计要点:
// - SSE 连接把各自的 ReadableStreamDefaultController 注册到 __ntfSubs[userId]
// - 新通知产生时 notifyPublish 把消息推送给该用户的所有在线连接(多标签页)
// - 若用户无在线连接,静默跳过 —— 通知本身已经落库,只是不实时弹窗
// - serverless / 多实例环境下该总线不跨进程,属已知限制(本平台单进程部署可接受)

type Sub = any; // ReadableStreamDefaultController<Uint8Array>

declare global {
  // eslint-disable-next-line no-var
  var __ntfSubs: Map<string, Set<Sub>> | undefined;
}

export function notifySubscribe(userId: string, ctrl: Sub): void {
  if (!globalThis.__ntfSubs) globalThis.__ntfSubs = new Map();
  let set = globalThis.__ntfSubs.get(userId);
  if (!set) {
    set = new Set<Sub>();
    globalThis.__ntfSubs.set(userId, set);
  }
  set.add(ctrl);
}

export function notifyUnsubscribe(userId: string, ctrl: Sub): void {
  const set = globalThis.__ntfSubs?.get(userId);
  if (!set) return;
  set.delete(ctrl);
  if (set.size === 0) globalThis.__ntfSubs!.delete(userId);
}

const enc = new TextEncoder();

export function notifyPublish(userId: string, payload: unknown): void {
  const set = globalThis.__ntfSubs?.get(userId);
  if (!set || set.size === 0) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  const bytes = enc.encode(frame);
  for (const ctrl of set) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      // 连接已关闭,移除无效订阅
      try {
        set.delete(ctrl);
      } catch {
        /* ignore */
      }
    }
  }
  if (set.size === 0) globalThis.__ntfSubs?.delete(userId);
}
