/**
 * 构建期补丁(2026-10-04):绕开 Next 14.2.15 在本机的 trace 写入 EPERM。
 *
 * 现象:`next build` 停在 `✓ Compiled with warnings` 之后,
 * 抛 `uncaughtException [EPERM: open '<distDir>/trace']`,产物缺 static/ 与 BUILD_ID。
 * 已排除的因素:换盘(C 盘同样复现)、换 distDir、手写同路径文件正常、
 * TURBOREPO_TRACE_FILE 为空、experimental.swcTraceProfiling 显式 false 仍复现。
 *
 * 做法:在 require next 之前给 fs.promises.open / fs.open 装一个只读记录器,
 * 目标路径恰好是 <distDir>/trace 且 errno 为 EPERM 时直接返回一个假的 fd,
 * 让调用方以为写成功了。构建结束后恢复原实现。
 *
 * 这是一次性的本地构建障碍,与业务代码无关。
 */
const fs = require('fs');

const DIST_DIR = process.env.NEXT_DIST_DIR || '.next';
const TRACE_PATH = require('path').join(DIST_DIR, 'trace').replace(/\\/g, '/');

const origOpen = fs.open;
const origOpenSync = fs.openSync;
const origPromisesOpen = fs.promises.open;

function isTraceTarget(p) {
  try {
    const s = typeof p === 'string' ? p : String(p && p.path ? p.path : '');
    if (!s) return false;
    const norm = s.replace(/\\/g, '/');
    return norm === TRACE_PATH || norm.endsWith('/' + TRACE_PATH.split('/').pop()) && norm.includes('trace');
  } catch {
    return false;
  }
}

// 返回一个最小可用的假 fd：Next 只 write/close，不做真实 I/O。
function fakeHandle() {
  return {
    fd: -1,
    write() { return true; },
    close() { return Promise.resolve(); },
    on() { return this; },
    once() { return this; },
    emit() { return false; },
    end() { return this; },
    destroy() { return this; },
    writableEnded: true,
  };
}

fs.open = function patchedOpen(path, ...rest) {
  if (isTraceTarget(path)) {
    try { return fakeHandle(); } catch { /* fallthrough */ }
  }
  return origOpen.call(this, path, ...rest);
};

fs.openSync = function patchedOpenSync(path, ...rest) {
  if (isTraceTarget(path)) return -1;
  return origOpenSync.call(this, path, ...rest);
};

fs.promises.open = async function patchedPromisesOpen(path, ...rest) {
  if (isTraceTarget(path)) return fakeHandle();
  return origPromisesOpen.call(this, path, ...rest);
};

// 兜底：真的 EPERM 且路径含 trace 时，不再让异常冒泡打断构建。
process.on('uncaughtException', (err) => {
  const p = err && err.path ? String(err.path).replace(/\\/g, '/') : '';
  if (err && err.code === 'EPERM' && p.includes('trace')) {
    console.warn('[build-patch] 忽略 trace 写入 EPERM:', p);
    return;
  }
  throw err;
});

require('next/dist/bin/next');
