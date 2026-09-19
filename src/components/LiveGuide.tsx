'use client';

import { useState } from 'react';

/**
 * 开播指南 —— 面向主播/同工的使用说明。
 * 内容提炼自 docs/直播一页纸.md 与 docs/直播操作手册.md。
 * 说明「怎么开直播、流程、用什么软件、怎么开」，不含服务器运维细节。
 */
export function LiveGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [step, setStep] = useState<number | null>(null);

  const steps = [
    {
      title: '创建直播间',
      icon: '📡',
      desc: '进入「直播」页，点右上角「＋ 创建直播」，填好标题和简介后点「创建」。',
      note: '只有管理员 / 版主角色能看到创建按钮。',
    },
    {
      title: '点「开播」⭐ 最容易忘',
      icon: '▶️',
      desc: '进入刚建的房间详情页，点「开始直播」。这一步会为你的房间开通专属通道。',
      note: '不点这个，OBS 推流会被拒绝。',
    },
    {
      title: '配置推流软件',
      icon: '🛠️',
      desc: '打开推流软件（推荐 OBS，免费），进入「设置 → 推流」，服务选「自定义」。',
      note: '服务器和串流密钥在房间详情页都有，点复制按钮粘贴，别手打。',
    },
    {
      title: '开始推流',
      icon: '🔴',
      desc: '点推流软件的「开始推流」，等 5~10 秒，回到网页刷新，画面就出来了。',
      note: '建议输出设置：比特率 1500~2500 Kbps，关键帧间隔 2 秒，分辨率 1280×720。',
    },
    {
      title: '结束直播',
      icon: '⏹️',
      desc: '讲完后回网页点「结束直播」。下次再播，要重新点一次「开播」。',
      note: '结束前把房间链接发给会友即可，观众不用登录就能看。',
    },
  ];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-4 text-left hover:bg-ink-50/60 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-xl" aria-hidden="true">🎓</span>
          <span>
            <span className="font-display font-bold text-ink-900">开播指南</span>
            <span className="block text-xs text-ink-400 mt-0.5">怎么开直播、用什么软件、完整流程</span>
          </span>
        </span>
        <span className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 space-y-4">
          {/* 软件推荐 */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-ui-border bg-ui-rail p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ui-text">
                <span aria-hidden="true">💻</span> 电脑推流
              </div>
              <p className="text-sm text-ui-muted mt-1">推荐 <b>OBS Studio</b>（免费开源）。下载：obsproject.com</p>
              <p className="text-xs text-ui-muted mt-1">功能全，适合主日崇拜、特会等正式场景。</p>
            </div>
            <div className="rounded-xl border border-ui-border bg-ui-rail p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ui-text">
                <span aria-hidden="true">📱</span> 手机推流
              </div>
              <p className="text-sm text-ui-muted mt-1">App 搜 <b>Larix Broadcaster</b>（免费，iOS / Android）</p>
              <p className="text-xs text-ui-muted mt-1">适合手机架在讲台后拍讲员、户外洗礼等场景。</p>
            </div>
          </div>

          {/* 五步流程 */}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(step === i ? null : i)}
                className="w-full text-left rounded-xl border border-ui-border p-3 hover:bg-ui-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-base" aria-hidden="true">{s.icon}</span>
                  <span className="font-semibold text-ink-800 text-sm flex-1">{s.title}</span>
                  <span className={`text-ink-400 text-xs transition-transform ${step === i ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                </div>
                {step === i && (
                  <div className="mt-2.5 pl-9 text-sm space-y-1.5">
                    <p className="text-ink-600">{s.desc}</p>
                    <p className="text-xs text-amber-600">⚠️ {s.note}</p>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* 安全提醒 */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-800">
            <p className="font-semibold mb-1">🔒 安全提醒</p>
            <p>房间详情页上有推流密钥，<b>不要把详情页截图发给会友</b>——拿到密钥的人能顶掉你的直播。观众用房间链接即可，不用登录。</p>
          </div>
        </div>
      )}
    </div>
  );
}