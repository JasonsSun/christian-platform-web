'use client';

import { useEffect, useRef, useState } from 'react';

/** 生成分享卡片图所需数据（经文/诗歌/金句） */
export type ShareCard = {
  /** 顶部小字，如「每日经文」「约翰福音 3:16」 */
  eyebrow?: string;
  /** 正文（经文/歌词/金句） */
  text: string;
  /** 出处，如「约翰福音 3:16 · 和合本」 */
  reference?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** 要分享的链接,默认取当前页面地址 */
  url?: string;
  /** 分享标题,默认「圣约社区」 */
  title?: string;
  /** 分享文案,默认一段推荐语 */
  text?: string;
  /** 传入后会生成一张可保存/长按转发的分享卡片图 */
  card?: ShareCard;
};

/* ---------------- canvas 绘制帮助函数 ---------------- */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const SERIF = '"Songti SC","SimSun",serif';
const SANS = '"PingFang SC","Microsoft YaHei",sans-serif';

/**
 * canvas 导出的结果。
 * 注意：必须用 Blob + objectURL,不能直接用 toDataURL 的 dataURL——
 * 1080×1440 的 PNG dataURL 有 2MB 以上,iOS / 微信内置浏览器会直接**不渲染**
 * (表现为卡片区域一片空白),且 dataURL 过长时 <img> 根本不会触发 load。
 */
type CardImage = { url: string; ext: 'jpg' | 'png'; revoke: () => void };

/** 生成一张 1080×1440 的分享卡片图（返回可显示/下载的 URL） */
async function buildCardImage(card: ShareCard, qr?: string): Promise<CardImage> {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_ctx');

  // 背景：深蓝渐变 + 金色光晕
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#141b3d');
  g.addColorStop(0.55, '#1e2664');
  g.addColorStop(1, '#2a2f6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rg = ctx.createRadialGradient(W * 0.5, H * 0.26, 40, W * 0.5, H * 0.26, W * 0.85);
  rg.addColorStop(0, 'rgba(212,164,0,0.20)');
  rg.addColorStop(1, 'rgba(212,164,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // 金色内框
  ctx.strokeStyle = 'rgba(212,164,0,0.55)';
  ctx.lineWidth = 3;
  roundRect(ctx, 46, 46, W - 92, H - 92, 40);
  ctx.stroke();

  const padX = 120;
  const maxW = W - padX * 2;

  // 顶部小字
  let y = 200;
  if (card.eyebrow) {
    ctx.fillStyle = '#e9c66a';
    ctx.font = `600 40px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(card.eyebrow, padX, y);
    y += 30;
  }

  // 大引号装饰
  ctx.fillStyle = 'rgba(212,164,0,0.22)';
  ctx.font = `200px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText('\u201C', padX - 8, y + 170);

  // 正文：按长度自适应字号+行高
  const text = (card.text || '').trim();
  const len = Array.from(text).length;
  let fontSize = 46;
  if (len > 120) fontSize = 40;
  if (len > 200) fontSize = 34;
  if (len > 320) fontSize = 30;
  if (len > 480) fontSize = 26;
  const lineH = Math.round(fontSize * 1.7);
  ctx.font = `${fontSize}px ${SERIF}`;
  const lines = wrapText(ctx, text, maxW);
  const maxLines = 20;
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    shown[maxLines - 1] = shown[maxLines - 1].slice(0, -1) + '…';
  }
  ctx.fillStyle = '#f5f2e8';
  ctx.textAlign = 'left';
  // 正文垂直起点：留出顶部区域后开始
  let ty = y + 210;
  for (const ln of shown) {
    ctx.fillText(ln, padX, ty);
    ty += lineH;
  }

  // 出处（右下）
  if (card.reference) {
    ctx.fillStyle = '#e9c66a';
    ctx.font = `600 40px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(`—— ${card.reference}`, W - padX, ty + 30);
  }

  // 底部品牌区
  const fy = H - 210;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 48px ${SANS}`;
  ctx.fillText('圣约社区', padX, fy);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `30px ${SANS}`;
  ctx.fillText('读经 · 圣诗 · 见证 · 团契', padX, fy + 54);
  ctx.fillText('扫一扫，一起灵修', padX, fy + 102);

  // 二维码（右下角，白色圆角底）
  if (qr) {
    try {
      const img = await loadImage(qr);
      const qs = 180;
      const qx = W - padX - qs;
      const qy = fy - qs + 42;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, qx - 18, qy - 18, qs + 36, qs + 36, 22);
      ctx.fill();
      ctx.drawImage(img, qx, qy, qs, qs);
    } catch {
      /* 二维码加载失败则跳过 */
    }
  }

  // 优先 Blob + objectURL：体积小、不受 dataURL 长度限制（iOS/微信能正常渲染）
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      if (typeof canvas.toBlob !== 'function') return resolve(null);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    } catch {
      resolve(null);
    }
  });
  if (blob && blob.size > 0) {
    const url = URL.createObjectURL(blob);
    return { url, ext: 'jpg', revoke: () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } };
  }
  // 兜底：极老浏览器没有 toBlob → 用 JPEG dataURL（比 PNG 小一个数量级）
  return { url: canvas.toDataURL('image/jpeg', 0.92), ext: 'jpg', revoke: () => {} };
}

export default function ShareModal({ open, onClose, url, title, text, card }: Props) {
  // 分享链接只在挂载时解析一次,避免渲染期反复读取 window.location 造成依赖抖动
  const [shareUrl, setShareUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [cardImg, setCardImg] = useState<CardImage | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardFailed, setCardFailed] = useState(false);
  // 上一张卡片的 objectURL,换新图/卸载时要释放,否则大图会一直占内存
  const prevCardRef = useRef<CardImage | null>(null);

  const shareTitle = title || '圣约社区 - 基督教内容传播与社交社区';
  const shareText = text || '推荐给你一个基督徒的灵修与团契社区：读经、圣诗、见证、活动、直播，欢迎来一起建造。';

  // 解析分享链接:显式传入优先,否则取当前页面地址(仅在客户端执行一次)
  useEffect(() => {
    if (url) { setShareUrl(url); return; }
    if (typeof window !== 'undefined') setShareUrl(window.location.href);
  }, [url, open]);

  // 打开时生成二维码
  useEffect(() => {
    if (!open || !shareUrl) return;
    let alive = true;
    import('qrcode')
      .then((mod) => mod.default.toDataURL(shareUrl, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e2664', light: '#ffffff' },
      }))
      .then((u) => { if (alive) setQr(u); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [open, shareUrl]);

  // 生成分享卡片图（需等二维码就绪，把站点二维码嵌进卡片）
  // 注意 card 是父组件内联对象，用 JSON 做依赖，避免每次父组件重渲染都重建图片
  const cardKey = card ? `${card.eyebrow || ''}|${card.text}|${card.reference || ''}` : '';
  useEffect(() => {
    if (!open || !card || !card.text) { setCardImg(null); return; }
    let alive = true;
    setCardBusy(true);
    setCardFailed(false);
    buildCardImage(card, qr || undefined)
      .then((img) => {
        if (!alive) { img.revoke(); return; }
        prevCardRef.current?.revoke();
        prevCardRef.current = img;
        setCardImg(img);
      })
      .catch(() => { if (alive) setCardFailed(true); })
      .finally(() => { if (alive) setCardBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardKey, qr]);

  // 关闭 / 卸载时释放上一张卡片的 objectURL
  useEffect(() => {
    if (open) return;
    prevCardRef.current?.revoke();
    prevCardRef.current = null;
    setCardImg(null);
  }, [open]);
  useEffect(() => () => { prevCardRef.current?.revoke(); }, []);

  // 关闭时复位复制状态
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  const nativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch {
        /* 用户取消分享 */
      }
    } else {
      await copy();
    }
  };

  const saveCard = () => {
    if (!cardImg) return;
    const a = document.createElement('a');
    a.href = cardImg.url;
    a.download = `圣约社区-${(card?.reference || '分享卡片').replace(/[\\/:*?"<>|]/g, '')}.${cardImg.ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      data-guard="share-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* 遮罩:仅在点击遮罩自身时关闭 */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* 面板 */}
      <div className="relative glass rounded-3xl p-6 sm:p-8 shadow-card-hover max-w-sm w-full max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg" aria-hidden="true">📤</span>
          <h2 className="font-display text-lg font-bold text-ink-900">推荐给朋友</h2>
        </div>
        <p className="text-sm text-ink-500 mb-5">保存卡片图或扫码，把圣约社区分享给主内肢体</p>

        {/* 分享卡片图（仅传入 card 时显示） */}
        {card && (
          <div className="mb-5">
            <div className="rounded-2xl overflow-hidden border border-ink-100 bg-ink-900/5 flex items-center justify-center min-h-[160px]">
              {cardImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardImg.url}
                  alt="分享卡片"
                  className="w-full h-auto"
                  decoding="async"
                  onError={() => setCardFailed(true)}
                />
              ) : (
                <div className="text-ink-400 text-sm py-10">
                  {cardBusy ? '卡片生成中…' : cardFailed ? '卡片生成失败，可改用下方二维码分享' : '暂无卡片'}
                </div>
              )}
            </div>
            {cardImg && (
              <>
                <button
                  type="button"
                  onClick={saveCard}
                  className="mt-3 w-full btn-gold flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-5l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  保存卡片图
                </button>
                <p className="text-xs text-ink-400 mt-2 text-center">手机端也可长按上图保存或转发到微信</p>
              </>
            )}
          </div>
        )}

        {/* 二维码 */}
        <div className="flex flex-col items-center mb-5">
          <div className="bg-white rounded-2xl p-3 shadow-soft border border-ink-100">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="分享二维码" className="w-40 h-40" width={160} height={160} decoding="async" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-ink-300 text-sm">生成中…</div>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-2 break-all text-center max-w-[16rem]">{shareUrl}</p>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={copy}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied ? '已复制 ✓' : '复制链接'}
          </button>
          <button
            type="button"
            onClick={nativeShare}
            className="w-full py-2.5 rounded-xl border border-ink-200 bg-white/70 text-ink-700 font-medium text-sm hover:bg-ink-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            系统分享
          </button>
        </div>
      </div>
    </div>
  );
}
