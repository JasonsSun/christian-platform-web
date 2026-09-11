'use client';

/**
 * 跳转式确认 / 输入
 *
 * 设计约束：本系统不使用 confirm() / prompt() 弹框。
 * 所有需要二次确认或少量文字输入的操作，统一跳转到独立页面 /confirm 完成，
 * 完成后再跳回来源页（来源页会重新挂载并自动刷新数据）。
 *
 * 实现：回调保存在内存 Map（同一次 SPA 会话内有效），
 * 元数据同步写入 sessionStorage，便于刷新后仍可展示上下文（刷新后操作作废，引导返回重试）。
 */

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface ConfirmInputSpec {
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  initial?: string;
}

export interface ConfirmRequest {
  /** 标题 */
  title: string;
  /** 说明文字（支持 \n 换行） */
  desc?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（红色按钮） */
  danger?: boolean;
  /** 需要用户输入时提供，等价于 prompt() */
  input?: ConfirmInputSpec;
  /** 确认后执行；返回 false 表示不自动返回。与 action 二选一 */
  onConfirm?: (value: string) => void | Promise<void | boolean>;
  /**
   * 声明式动作名（配合 lib/confirmActions 执行）。
   * 提供后即使页面刷新、内存回调丢失，确认页仍能凭它重新执行该操作。
   */
  action?: string;
  /** 传给 action 的参数（须可 JSON 序列化） */
  params?: Record<string, unknown>;
  /** 取消或完成后的回跳地址，默认来源页 */
  back?: string;
}

export interface ConfirmMeta {
  title: string;
  desc?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  input?: ConfirmInputSpec;
  back: string;
  action?: string;
  params?: Record<string, unknown>;
}

const META_KEY = 'platform_confirm_meta';
/** 内存回调有效期：超时即作废，避免误执行陈旧操作 */
const PENDING_TTL_MS = 30 * 60 * 1000;

interface PendingEntry { req: ConfirmRequest; at: number }

/**
 * 挂到 globalThis 上：模块可能被分别打进「来源页」和「/confirm 页」两个 chunk，
 * 若各自持有一份模块实例，回调 Map 就会读不到（表现为确认页提示「操作链接已失效」）。
 * 用全局单例保证跨 chunk 共享同一份 pending。
 */
const globalRef = globalThis as unknown as { __platformConfirmPending?: Map<string, PendingEntry> };
const pending: Map<string, PendingEntry> =
  globalRef.__platformConfirmPending || (globalRef.__platformConfirmPending = new Map<string, PendingEntry>());

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getConfirmMeta(id: string): ConfirmMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${META_KEY}:${id}`);
    return raw ? (JSON.parse(raw) as ConfirmMeta) : null;
  } catch {
    return null;
  }
}

export function getConfirmRequest(id: string): ConfirmRequest | null {
  const e = pending.get(id);
  if (!e) return null;
  if (Date.now() - e.at > PENDING_TTL_MS) {
    pending.delete(id);
    return null;
  }
  return e.req;
}

/**
 * 清理超期的内存回调。
 * 注意：不再随路由切换清空——那样会把正在进行的确认操作一并抹掉。
 */
export function pruneStaleConfirms(): void {
  const now = Date.now();
  Array.from(pending.keys()).forEach((k) => {
    const e = pending.get(k);
    if (!e || now - e.at > PENDING_TTL_MS) {
      pending.delete(k);
      if (typeof window !== 'undefined') {
        try { window.sessionStorage.removeItem(`${META_KEY}:${k}`); } catch { /* ignore */ }
      }
    }
  });
}

export function dropConfirm(id: string): void {
  pending.delete(id);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(`${META_KEY}:${id}`);
    } catch {
      /* ignore */
    }
  }
}

export function clearAllConfirms(): void {
  pending.clear();
  if (typeof window !== 'undefined') {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(`${META_KEY}:`)) keys.push(k);
      }
      keys.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
}

/** 在页面里调用：跳转到 /confirm 完成确认（或输入） */
export function useConfirmNav() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (req: ConfirmRequest) => {
      const id = newId();
      const back = req.back || pathname || '/';
      pending.set(id, { req, at: Date.now() });
      if (typeof window !== 'undefined') {
        try {
          const meta: ConfirmMeta = {
            title: req.title,
            desc: req.desc,
            confirmText: req.confirmText,
            cancelText: req.cancelText,
            danger: req.danger,
            input: req.input,
            back,
            action: req.action,
            params: req.params,
          };
          window.sessionStorage.setItem(`${META_KEY}:${id}`, JSON.stringify(meta));
        } catch {
          /* ignore */
        }
      }
      router.push(`/confirm?id=${id}`);
    },
    [router, pathname]
  );
}
