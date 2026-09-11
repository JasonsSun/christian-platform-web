'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** 单条弹幕消息(兼容前后端字段命名差异:后端为 user_id,前端类型多为 userId) */
export interface DanmakuMessage {
  id: string;
  content: string;
  userId?: string | null;
  user_id?: string | null; // 后端原始字段(user_id)
}

interface Props {
  /** 聊天消息流(随轮询更新)。组件内部按 id 去重,仅把"新消息"送上屏 */
  messages: DanmakuMessage[];
  /** 当前登录用户 id,用于把"自己发的"弹幕高亮为金色 */
  selfId?: string | null;
  /** 是否开启弹幕 */
  active: boolean;
  /** 同屏最多显示条数(超出则丢弃最旧的),防止卡顿 */
  maxOnScreen?: number;
  /** 轨道数量,用于错开弹幕避免重叠 */
  trackCount?: number;
  /** 滚动速度(px/秒) */
  speed?: number;
  /** 整体透明度 0~1 */
  opacity?: number;
  /** 是否暂停滚动(如鼠标悬停) */
  paused?: boolean;
}

interface Item {
  key: number;       // 自增唯一键(同一条消息可能因反复开关被多次上屏,用 key 区分)
  text: string;
  self: boolean;     // 是否为自己发送的
  track: number;     // 所在轨道(从 0 开始)
}

/** 估算弹幕宽度(px),用于轨道分配时判断上一条是否已完全进入屏幕 */
function estWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\x00-\xff]/.test(ch) ? 9 : 16; // 半角约 9px,全角约 16px
  return w + 16; // 加上左右内边距
}

export function Danmaku({
  messages, selfId, active,
  maxOnScreen = 60, trackCount = 5, speed = 120, opacity = 1, paused = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);       // 容器宽度(用于计算滚动时长)
  const [items, setItems] = useState<Item[]>([]);

  const shownIds = useRef<Set<string>>(new Set());              // 已上屏/已忽略的消息 id
  const keySeq = useRef(0);
  const lastSpawn = useRef<{ t: number; w: number }[]>([]);     // 每条轨道上次发车时间与估算宽度

  // 监听容器宽度变化(视频尺寸随窗口变化)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 关闭时清屏,并记录已见 id,避免再次开启时把历史消息全部刷出来
  useEffect(() => {
    if (!active) {
      for (const m of messages) shownIds.current.add(m.id);
      setItems([]);
    }
  }, [active, messages]);

  // 侦测新消息 -> 分配轨道 -> 送上屏
  useEffect(() => {
    if (!active) return;
    const fresh = messages.filter((m) => !shownIds.current.has(m.id));
    if (!fresh.length) return;

    const now = Date.now() / 1000;
    const added: Item[] = [];
    for (const m of fresh) {
      shownIds.current.add(m.id);
      // 选最空闲的轨道:上一条已完全进入屏幕(右边缘越过容器左界)才复用,避免重叠
      let track = -1;
      for (let i = 0; i < trackCount; i++) {
        const ls = lastSpawn.current[i];
        if (!ls || now - ls.t >= ls.w / speed + 0.3) { track = i; break; }
      }
      if (track === -1) {
        // 所有轨道都在忙:选间隔最久的一条,尽量错开
        let bestT = -1;
        for (let i = 0; i < trackCount; i++) {
          const age = lastSpawn.current[i] ? now - lastSpawn.current[i]!.t : Infinity;
          if (age > bestT) { bestT = age; track = i; }
        }
      }
      const w = estWidth(m.content);
      lastSpawn.current[track] = { t: now, w };
      added.push({
        key: keySeq.current++,
        text: m.content,
        self: !!selfId && (m.userId ?? m.user_id) === selfId,
        track,
      });
    }
    if (!added.length) return;
    setItems((prev) => {
      const next = [...prev, ...added];
      // 限制同屏条数,超出则丢弃最旧
      return next.length > maxOnScreen ? next.slice(next.length - maxOnScreen) : next;
    });
  }, [messages, active, selfId, trackCount, speed, maxOnScreen]);

  const removeItem = (key: number) => setItems((prev) => prev.filter((it) => it.key !== key));

  const trackHeight = 30; // 每条轨道高度(px)

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity, containerType: 'inline-size' } as CSSProperties}
      aria-hidden
    >
      {/* 弹幕滚动动画:从右侧 100% 处平移到完全离开左侧(100% 自身宽 + 100cqw 容器宽) */}
      <style>{`@keyframes danmaku-scroll{from{transform:translateX(0)}to{transform:translateX(calc(-100% - 100cqw))}}`}</style>
      {items.map((it) => {
        // 时长按"恒定速度"估算:距离(容器宽 + 弹幕宽)/ 速度
        const dur = Math.max(4, (width + estWidth(it.text)) / speed);
        const base = 'absolute whitespace-nowrap will-change-transform text-sm sm:text-base font-medium';
        // 自己发的弹幕:金色 + 浅色边框;其它:白字 + 黑色描边/阴影保证可读
        const cls = it.self
          ? `${base} text-amber-300 border border-amber-200/60 rounded px-1`
          : `${base} text-white`;
        const style: CSSProperties = {
          top: 6 + it.track * trackHeight,
          left: '100%',
          animation: `danmaku-scroll ${dur}s linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
          textShadow: it.self
            ? '0 1px 2px rgba(0,0,0,0.6)'
            : '0 1px 2px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.7)',
        };
        return (
          <span key={it.key} className={cls} style={style} onAnimationEnd={() => removeItem(it.key)}>
            {it.text}
          </span>
        );
      })}
    </div>
  );
}
