'use client';

import { useEffect } from 'react';

/**
 * 浏览器端错误上报。
 *
 * 挂载后监听 window.onerror / unhandledrejection，把未捕获异常 POST 到
 * /api/v1/monitor（服务端再统一落日志 / 转发 Sentry）。
 *
 * 注意：只上报"未捕获"的异常。业务里已经 try/catch 的错误不会再打一遍，
 * 避免同一个问题重复告警。
 */

const ENDPOINT = '/api/v1/monitor';
/** 同一条错误在页面生命周期内只上报一次，避免死循环刷屏 */
const sent = new Set<string>();
let lastSentAt = 0;

function keyOf(msg: string, src: string) {
  return `${msg}|${src||''}`.slice(0, 300);
}

export default function ErrorReporter() {
  useEffect(() => {
    function send(payload: Record<string, unknown>) {
      try {
        const body = JSON.stringify({
          ...payload,
          path: location.pathname,
          ua: navigator.userAgent,
          at: new Date().toISOString(),
        });
        // 节流：同一时刻大量异常只放行一个
        if (Date.now() - lastSentAt < 1000) return;
        lastSentAt = Date.now();
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        } else {
          void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        }
      } catch {
        /* 上报失败静默 */
      }
    }

    function onError(e: ErrorEvent) {
      const msg = e.message || 'Unknown error';
      const k = keyOf(msg, e.filename || '');
      if (sent.has(k)) return;
      sent.add(k);
      send({
        kind: 'onerror',
        message: msg,
        source: e.filename || '',
        line: e.lineno || 0,
        col: e.colno || 0,
        stack: e.error?.stack ? String(e.error.stack).slice(0, 2000) : '',
      });
    }

    function onReject(e: PromiseRejectionEvent) {
      const r: any = e.reason;
      const msg = r?.message || String(r || 'Unhandled rejection');
      const k = keyOf(msg, 'promise');
      if (sent.has(k)) return;
      sent.add(k);
      send({ kind: 'unhandledrejection', message: msg, stack: r?.stack ? String(r.stack).slice(0, 2000) : '' });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);

  return null;
}
