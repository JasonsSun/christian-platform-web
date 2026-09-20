'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { useAction } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { useNotice } from '@/lib/notice';
import Portal from '@/components/Portal';
import { useEscape, useDialogFocus } from '@/lib/a11y';
import { IconFlag } from '@/components/icons';

const REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'harmful', label: '有害信息' },
  { value: 'heresy', label: '异端偏差' },
  { value: 'copyright', label: '侵权' },
  { value: 'offensive', label: '冒犯性内容' },
  { value: 'other', label: '其他' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  contentId: string;
  /** 提交成功回调（父组件用来显示「举报已提交」态） */
  onSubmitted: () => void;
};

/**
 * 内容举报浮层。
 *
 * 早期实现是详情页 hero 内的 `absolute` 下拉面板，而 hero 的 `<section>` 带
 * `overflow-hidden`，面板向下溢出会被直接裁掉 —— 表现为只看到「补充说明」和按钮，
 * 「举报原因」看不见。现统一走 Portal + fixed 居中，彻底摆脱祖先裁剪。
 */
export default function ReportModal({ open, onClose, contentId, onSubmitted }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const notice = useNotice();
  const action = useAction();
  const [reason, setReason] = useState('spam');
  const [detail, setDetail] = useState('');

  useEscape(open, onClose);
  const dlgRef = useDialogFocus(open);
  const titleId = useId();

  if (!open) return null;

  async function submit() {
    if (!user) {
      notice.info('请先登录后再举报');
      return;
    }
    if (!reason) return;
    const res = await action.run(() =>
      apiPost<{ ok: boolean }>(`/contents/${contentId}/report`, {
        reason,
        detail: detail.trim() || undefined,
      })
    );
    if (res) {
      setDetail('');
      onSubmitted();
    }
  }

  return (
    <Portal>
      <div
        ref={dlgRef}
        data-guard="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      >
        <div
          className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) onClose();
          }}
        />

        <div className="relative glass rounded-3xl p-6 shadow-card-hover w-full max-w-sm">
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
            <IconFlag className="w-5 h-5 text-primary-600" strokeWidth={1.7} />
            <h2 id={titleId} className="font-display text-lg font-bold text-ink-900">举报内容</h2>
          </div>
          <p className="text-sm text-ink-500 mb-5">我们会尽快核实处理，感谢你维护社区秩序</p>

          {!user ? (
            <div className="text-sm text-ink-600">
              请先
              <button
                type="button"
                onClick={() => { onClose(); router.push('/login'); }}
                className="text-primary-600 font-medium mx-1"
              >
                登录
              </button>
              后再举报
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="report-reason" className="block text-xs font-semibold text-ink-500 mb-1">举报原因</label>
                <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="input-styled">
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="report-detail" className="block text-xs font-semibold text-ink-500 mb-1">补充说明（选填）</label>
                <textarea
                  id="report-detail"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  className="input-styled min-h-[80px]"
                  placeholder="请描述具体问题…"
                />
              </div>
              {action.error && <p className="text-xs text-rose-600">{action.error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary btn-sm flex-1 text-sm">取消</button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={action.pending}
                  className="btn-primary btn-sm flex-1 text-sm disabled:opacity-70"
                >
                  {action.pending ? '提交中…' : '提交'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
