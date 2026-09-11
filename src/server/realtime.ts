import { heartbeat, countViewers } from './live';

type AnyWs = any;

interface RoomState {
  clients: Set<AnyWs>;
  /** 内存在线人数(WS 连接数,已按 session 去重) */
  viewers: Map<string, number>; // sid -> lastSeen(ms)
  lastPersist: number;
}

export interface RtBus {
  rooms: Map<string, RoomState>;
  wsRoom: Map<AnyWs, string>;
  wsSid: Map<AnyWs, string>;
  attach: (ws: AnyWs, room: string, sid: string) => void;
  detach: (ws: AnyWs) => void;
  onHeartbeat: (ws: AnyWs) => void;
  onlineCount: (room: string) => number;
}

declare global {
  // eslint-disable-next-line no-var
  var __rt: RtBus | undefined;
}

const PERSIST_INTERVAL_MS = 10_000; // 在线人数落库最小间隔(节流)
const VIEWER_TTL_MS = 45_000; // session 过期时间

/**
 * 进程内实时总线。server.js(自定义 Node 服务器)与 Next 运行在同一进程,
 * 通过 globalThis 共享同一份单例:server.js 只负责原始 WS 连接生命周期,
 * 业务逻辑(在线人数、广播)都在 TS 侧实现。
 *
 * 性能要点:
 * - 在线人数在内存中计算,WS 心跳不直接打库;仅按 PERSIST_INTERVAL_MS 节流落库。
 * - 大批量涌入时,每房间每秒最多 1 次 DB 写,而不是每人每次心跳 1 次。
 * - 若进程未通过 server.js 启动(直接 next start/dev),globalThis.__rt 不存在,
 *   broadcastChat 为空操作,前端自动回退 REST 轮询,安全降级。
 */
export function ensureBus(): RtBus {
  if (globalThis.__rt) return globalThis.__rt;

  const bus: RtBus = {
    rooms: new Map(),
    wsRoom: new Map(),
    wsSid: new Map(),

    onlineCount(room) {
      const st = this.rooms.get(room);
      if (!st) return 0;
      const now = Date.now();
      for (const [sid, ts] of st.viewers) {
        if (now - ts > VIEWER_TTL_MS) st.viewers.delete(sid);
      }
      return st.viewers.size;
    },

    attach(ws, room, sid) {
      if (!this.rooms.has(room)) {
        this.rooms.set(room, { clients: new Set(), viewers: new Map(), lastPersist: 0 });
      }
      const st = this.rooms.get(room)!;
      st.clients.add(ws);
      st.viewers.set(sid, Date.now());
      this.wsRoom.set(ws, room);
      this.wsSid.set(ws, sid);

      // 新连接立即获得当前在线人数(内存计算,零 DB 开销)
      try {
        ws.send(JSON.stringify({ type: 'viewer_count', count: st.viewers.size }));
      } catch {}
      this.onHeartbeat(ws);
    },

    detach(ws) {
      const room = this.wsRoom.get(ws);
      const sid = this.wsSid.get(ws);
      if (!room) return;
      const st = this.rooms.get(room);
      if (st) {
        st.clients.delete(ws);
        // 同一 session 可能有多个标签页,仅在无其它连接时移除
        if (sid && ![...st.clients].some((c) => this.wsSid.get(c) === sid)) {
          st.viewers.delete(sid);
        }
        if (st.clients.size === 0) {
          this.rooms.delete(room);
        } else {
          this.broadcastViewers(room);
        }
      }
      this.wsRoom.delete(ws);
      this.wsSid.delete(ws);
    },

    onHeartbeat(ws) {
      const room = this.wsRoom.get(ws);
      if (!room) return;
      const st = this.rooms.get(room);
      if (!st) return;
      const sid = this.wsSid.get(ws) || Math.random().toString(36).slice(2);
      st.viewers.set(sid, Date.now());

      this.broadcastViewers(room);

      // 节流落库:每房间最多每 10s 一次
      const now = Date.now();
      if (now - st.lastPersist >= PERSIST_INTERVAL_MS) {
        st.lastPersist = now;
        heartbeat(room, sid).catch(() => {});
      }
    },
  } as RtBus & { broadcastViewers(room: string): void };

  // 在线人数广播(内存计算后推送给房间内所有客户端)
  (bus as any).broadcastViewers = (room: string) => {
    const st = bus.rooms.get(room);
    if (!st) return;
    const count = bus.onlineCount(room);
    const data = JSON.stringify({ type: 'viewer_count', count });
    for (const ws of st.clients) {
      try { ws.send(data); } catch {}
    }
  };

  // 定期清理过期 session(避免 viewers Map 无限增长)
  const gc = setInterval(() => {
    for (const [room, st] of bus.rooms) {
      if (bus.onlineCount(room) === 0 && st.clients.size === 0) bus.rooms.delete(room);
    }
  }, 60_000);
  if (typeof (gc as any).unref === 'function') (gc as any).unref();

  globalThis.__rt = bus;
  return bus;
}

/** 供 REST 兜底:拿在线人数(优先内存,否则回退 DB) */
export async function onlineCount(roomId: string): Promise<number> {
  const bus = ensureBus();
  const st = bus.rooms.get(roomId);
  if (st && st.clients.size > 0) return bus.onlineCount(roomId);
  return countViewers(roomId);
}

/** REST 发消息后调用:向房间内所有 WS 客户端广播新消息 */
export function broadcastChat(roomId: string, message: any) {
  if (!globalThis.__rt) return; // 未走 server.js -> 静默降级
  const b = ensureBus();
  const st = b.rooms.get(roomId);
  if (!st || st.clients.size === 0) return;
  const data = JSON.stringify({ type: 'chat', message });
  for (const ws of st.clients) {
    try { ws.send(data); } catch {}
  }
}
