'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ReadingAngelProps {
  /** 朗读状态：playing 时才指读，其余（idle/paused）趴着休息 */
  state: 'idle' | 'playing' | 'paused';
  /** 当前朗读到的节号（非 1.0x 指整行用） */
  speakingKey: number | null;
  /** 当前朗读到的全局字符索引（1.0x 指单个字用） */
  speakCharRef?: React.MutableRefObject<number | null>;
  /** 是否逐字模式（语速 1.0x） */
  wordSync: boolean;
}

type AngelMode = 'rest' | 'pointChar' | 'pointLine';

const CHEER_WORDS = ['加油～', '读得真好', '慢慢来', '以马内利', '再读一节？', '神与你同在'];
const SIZE = 56;

export default function ReadingAngel({
  state,
  speakingKey,
  speakCharRef,
  wordSync,
}: ReadingAngelProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [follow, setFollow] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<AngelMode>('rest');
  const [angle, setAngle] = useState(20);
  const [cheer, setCheer] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const draggingRef = useRef(false);
  const modeRef = useRef<AngelMode>('rest');
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const HAND_X = 58;
  const HAND_Y = 40;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const place = (x: number, y: number) => {
      posRef.current = { x, y };
      setPos({ x, y });
    };
    try {
      const raw = localStorage.getItem('bible:angelPos');
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') {
          place(p.x, p.y);
          return;
        }
      }
    } catch { /* ignore */ }
    place(
      Math.max(8, window.innerWidth - SIZE - 16),
      Math.max(8, window.innerHeight - SIZE - 96)
    );
  }, [mounted]);

  const setModeIfChanged = useCallback((m: AngelMode) => {
    if (modeRef.current === m) return;
    modeRef.current = m;
    setMode(m);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (state !== 'playing' || !follow || draggingRef.current) {
        setModeIfChanged('rest');
        return;
      }
      let target: { x: number; y: number } | null = null;
      if (wordSync && speakCharRef?.current != null) {
        const el = document.querySelector(`[data-raw="${speakCharRef.current}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width || r.height) {
            target = { x: r.left + r.width / 2, y: r.bottom - 1 };
            setModeIfChanged('pointChar');
          }
        }
      }
      if (!target && speakingKey != null) {
        const el = document.getElementById(`v${speakingKey}`);
        if (el) {
          const r = el.getBoundingClientRect();
          target = { x: r.right - 24, y: r.top + Math.min(r.height / 2, 28) };
          setModeIfChanged('pointLine');
        }
      }
      if (!target) return;

      const nx = Math.max(4, Math.min(window.innerWidth - SIZE - 4, target.x - SIZE * 0.66));
      const ny = Math.max(4, Math.min(window.innerHeight - SIZE - 4, target.y - SIZE * 0.12));
      setPos((prev) => {
        const p = prev ?? posRef.current;
        if (Math.abs(p.x - nx) < 0.6 && Math.abs(p.y - ny) < 0.6) return p;
        posRef.current = { x: nx, y: ny };
        return { x: nx, y: ny };
      });
      const dx = target.x - (nx + (HAND_X / 72) * SIZE);
      const dy = target.y - (ny + (HAND_Y / 72) * SIZE);
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      setAngle((prev) => (Math.abs(prev - deg) < 1.5 ? prev : deg));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mounted, state, speakingKey, wordSync, follow, speakCharRef, setModeIfChanged]);

  useEffect(() => {
    if (mode === 'rest' && !cheer) setBubble(null);
  }, [mode, cheer]);

  const clamp = (v: number, max: number) => Math.max(4, Math.min(max, v));

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    draggingRef.current = true;
    setDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = clamp(d.ox + (e.clientX - d.sx), window.innerWidth - SIZE - 4);
    const ny = clamp(d.oy + (e.clientY - d.sy), window.innerHeight - SIZE - 4);
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    posRef.current = { x: nx, y: ny };
    setPos({ x: nx, y: ny });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    if (!d) return;
    if (d.moved) {
      setFollow(false);
      try { localStorage.setItem('bible:angelPos', JSON.stringify(posRef.current)); } catch { /* ignore */ }
    } else {
      const word = CHEER_WORDS[Math.floor(Math.random() * CHEER_WORDS.length)];
      setBubble(word);
      setCheer(true);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => {
        setCheer(false);
        setBubble(null);
      }, 1600);
    }
  };

  const onDoubleClick = () => {
    setFollow(true);
    try { localStorage.removeItem('bible:angelPos'); } catch { /* ignore */ }
    setBubble('跟着你读～');
    setCheer(true);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => { setCheer(false); setBubble(null); }, 1600);
  };

  useEffect(() => () => { if (bubbleTimer.current) clearTimeout(bubbleTimer.current); }, []);

  if (!mounted || !pos) return null;

  const resting = mode === 'rest';
  const pointing = !resting;

  return (
    <div
      ref={wrapRef}
      className={`angel ${dragging ? 'dragging' : ''}`}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, width: SIZE, height: SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      title={follow ? '拖动我可以换位置；双击回到跟随模式' : '已固定位置；双击恢复跟随朗读'}
    >
      <div className={`inner ${cheer ? 'pop' : 'float'}`}>
        <svg viewBox="0 0 72 72" width={SIZE} height={SIZE}>
          <defs>
            <radialGradient id="halo" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#fff8db" />
              <stop offset="60%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </radialGradient>
            <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#eef4ff" />
            </linearGradient>
            <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#dfe9ff" />
            </linearGradient>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 光环 + 星星 */}
          <g filter="url(#glow)">
            <ellipse cx="36" cy="10" rx="13" ry="4" fill="url(#halo)" />
            <ellipse cx="36" cy="10" rx="8" ry="2.4" fill="#fffbeb" />
          </g>
          <g fill="#fbbf24" className="sparkle">
            <circle cx="25" cy="7" r="1.2" />
            <circle cx="47" cy="6.5" r="1.4" />
            <circle cx="49" cy="13" r="1" />
          </g>

          {/* 翅膀 */}
          <path
            className={resting ? 'wing wing-rest' : 'wing wing-open'}
            d="M31 37c-10-4-16 2-17 9 0 3 2 6 6 7-1-3 1-7 4-10 1 3 1 7 4 9 0-4 1-9-1-12z"
            fill="url(#wing)"
            stroke="#cbdaf7"
            strokeWidth="1"
          />
          <path
            className={resting ? 'wing wing-rest' : 'wing wing-open'}
            d="M41 37c10-4 16 2 17 9 0 3-2 6-6 7 1-3-1-7-4-10-1 3-1 7-4 9 0-4-1-9 1-12z"
            fill="url(#wing)"
            stroke="#cbdaf7"
            strokeWidth="1"
          />

          <g className={resting ? 'body-rest' : 'body-up'}>
            {/* 袍子 */}
            <path d="M28 40h16l5.5 19H22.5z" fill="url(#robe)" stroke="#dbe6ff" strokeWidth="1.1" />
            <path d="M29 56h14v3H29z" fill="#e7f0ff" opacity="0.8" />
            <path d="M28.5 46.5h15v3h-15z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.6" />
            <path d="M31.5 40q4.5 3.5 9 0" fill="none" stroke="#e7eefc" strokeWidth="1.4" />

            {/* 头 */}
            <circle cx="36" cy="29" r="11.5" fill="#ffedd5" />

            {/* 金发 */}
            <path
              d="M24 28c-1-9 4-15 12-15s13 6 12 15c-1-4-2-6-5-6-2.5 0-5 2-7 4-2-2-4.5-4-7-4-3 0-4 2-5 6z"
              fill="#fbbf24"
            />
            <path d="M26 25c2-5 6-7 10-7 4 0 8 2 10 7-3-2-6-2-10-2s-7 0-10 2z" fill="#fcd34d" opacity="0.9" />
            <circle cx="23.5" cy="32" r="3.5" fill="#fbbf24" />
            <circle cx="48.5" cy="32" r="3.5" fill="#fbbf24" />

            {/* 腮红 */}
            <circle cx="30" cy="34" r="2.2" fill="#fda4af" opacity="0.6" />
            <circle cx="42" cy="34" r="2.2" fill="#fda4af" opacity="0.6" />

            {/* 眼睛 / 嘴 */}
            {resting ? (
              <>
                <path d="M30.5 30q2.4 2.4 4.8 0" stroke="#7a5c3e" strokeWidth="1.7" fill="none" strokeLinecap="round" />
                <path d="M37.2 30q2.4 2.4 4.8 0" stroke="#7a5c3e" strokeWidth="1.7" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <ellipse cx="31.5" cy="30" rx="2.7" ry="3.3" fill="#5c4632" />
                <ellipse cx="40.5" cy="30" rx="2.7" ry="3.3" fill="#5c4632" />
                <circle cx="32.6" cy="28.6" r="1.1" fill="#ffffff" />
                <circle cx="41.6" cy="28.6" r="1.1" fill="#ffffff" />
              </>
            )}
            <path
              d={cheer ? 'M32 35q4 3.4 8 0' : 'M32.5 34.8q3.5 2 7 0'}
              stroke="#d98a6a"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />

            {/* 左手 */}
            <g className={resting ? 'hand-rest' : ''}>
              <path d="M26 44c-3 1-4 4-2 6.5" stroke="#ffedd5" strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
          </g>

          {/* 右手：朗读时伸出指向目标 */}
          {pointing && (
            <g transform={`rotate(${angle} ${HAND_X} ${HAND_Y})`} filter="url(#glow)">
              <g className="hand-point">
                <path
                  d={`M${HAND_X - 9} ${HAND_Y} L${HAND_X + 13} ${HAND_Y}`}
                  stroke="#ffedd5"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx={HAND_X + 16} cy={HAND_Y} r="3" fill="#fff3c4" stroke="#fbbf24" strokeWidth="1.1" />
              </g>
            </g>
          )}

          {/* 休息云朵 */}
          {resting && (
            <g className="cloud">
              <ellipse cx="36" cy="63" rx="19" ry="5.5" fill="#eef3fb" />
              <ellipse cx="27" cy="61" rx="9" ry="5" fill="#f8fbff" />
              <ellipse cx="45" cy="61.5" rx="10" ry="5.5" fill="#f8fbff" />
            </g>
          )}
        </svg>

        {/* 气泡 */}
        {bubble && <div className="bubble">{bubble}</div>}
        {resting && !bubble && (
          <div className="bubble zzz">
            <span>z</span>
            <span>z</span>
            <span>Z</span>
          </div>
        )}
        {cheer && (
          <div className="sparks">
            <span>✨</span>
            <span>💛</span>
            <span>✨</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .angel {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 60;
          touch-action: none;
          user-select: none;
          cursor: grab;
          transition: transform 0.28s cubic-bezier(0.22, 0.9, 0.3, 1);
          filter: drop-shadow(0 5px 12px rgba(120, 90, 40, 0.18));
        }
        .angel.dragging {
          cursor: grabbing;
          transition: none;
        }
        .inner {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .float {
          animation: floaty 3.2s ease-in-out infinite;
        }
        .pop {
          animation: pop 0.6s ease;
        }
        .body-rest {
          transform-origin: 36px 60px;
          transform: rotate(-8deg) translateY(3px);
          transition: transform 0.4s ease;
        }
        .body-up {
          transform-origin: 36px 60px;
          transform: rotate(0deg);
          transition: transform 0.4s ease;
        }
        .wing {
          transform-origin: 36px 39px;
          transition: transform 0.4s ease;
        }
        .wing-rest {
          transform: scaleX(0.5) translateY(2px);
        }
        .wing-open {
          animation: flap 1.5s ease-in-out infinite;
        }
        .hand-point {
          animation: point 1.1s ease-in-out infinite;
        }
        .cloud {
          animation: cloud 4s ease-in-out infinite;
        }
        .sparkle circle {
          animation: twinkle 2.4s ease-in-out infinite;
        }
        .sparkle circle:nth-child(2) { animation-delay: 0.8s; }
        .sparkle circle:nth-child(3) { animation-delay: 1.6s; }
        .bubble {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #fde68a;
          color: #92400e;
          font-size: 10px;
          line-height: 1;
          padding: 4px 8px;
          border-radius: 999px;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(180, 140, 60, 0.18);
        }
        .bubble.zzz span {
          display: inline-block;
          margin: 0 1px;
          animation: zzz 1.8s ease-in-out infinite;
        }
        .bubble.zzz span:nth-child(2) { animation-delay: 0.3s; }
        .bubble.zzz span:nth-child(3) { animation-delay: 0.6s; }
        .sparks {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .sparks span {
          position: absolute;
          left: 50%;
          top: 8px;
          font-size: 11px;
          animation: spark 1.1s ease-out forwards;
        }
        .sparks span:nth-child(1) { animation-delay: 0s; margin-left: -20px; }
        .sparks span:nth-child(2) { animation-delay: 0.12s; margin-left: -4px; font-size: 13px; }
        .sparks span:nth-child(3) { animation-delay: 0.24s; margin-left: 12px; }
        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pop {
          0% { transform: scale(1); }
          30% { transform: scale(1.16) rotate(-6deg); }
          60% { transform: scale(0.94) rotate(4deg); }
          100% { transform: scale(1); }
        }
        @keyframes flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes flap {
          0%, 100% { transform: scaleX(1) translateY(0); }
          50% { transform: scaleX(0.82) translateY(-1.5px); }
        }
        @keyframes point {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(2px, -1px); }
        }
        @keyframes cloud {
          0%, 100% { transform: translateX(0); opacity: 0.95; }
          50% { transform: translateX(-2px); opacity: 1; }
        }
        @keyframes zzz {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        @keyframes spark {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(-20px) scale(1.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
