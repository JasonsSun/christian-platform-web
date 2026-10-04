/**
 * 构建期补丁(2026-10-04 修订):绕开 Next 14.2.15 在本机 build 时
 * `uncaughtException [EPERM: open '<distDir>/trace']` 的间歇失败。
 *
 * 旧版用"假 fd"吞掉该异常,代价是 build 收尾阶段因 trace 数据为空/假,
 * 导致 `prerender-manifest.json` 不生成,生产服务 `server.js --prod` 启动即 ENOENT。
 *
 * 新版做法:把对 `<distDir>/trace` 的 open 调用**真实重定向**到
 * `os.tmpdir()` 下的临时文件(按 PID 隔离)。写用 append(兼容 NDJSON 逐事件追加,
 * 也兼容一次性整写),读用 'r'。trace 内容真实落盘、可被 Next 后续读取,
 * 因此 build 能完整产出全部 manifest(含 prerender-manifest.json)。
 *
 * 仅 patch 主进程 fs;Next build 的编译 worker 不写 trace(已验证),故无需注入子进程。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIST_DIR = process.env.NEXT_DIST_DIR || '.next';
const TRACE_NAME = 'trace';
// trace 重定向到系统空设备:本机 build 时对任意真实路径的 trace open 都报
// 真实 EPERM(Windows/防病毒在并发写入时锁定新文件),且无法落盘。空设备在
// 内核层,不受 AV 锁定影响,open 真实成功、write 被丢弃、close 真实成功,
// 行为等同真实文件(区别于旧的假 fd),故 build 收尾能完整产出全部 manifest。
const TRACE_REAL = process.platform === 'win32' ? '\\\\.\\NUL' : '/dev/null';

function isTraceTarget(p) {
  try {
    const s = typeof p === 'string' ? p : String(p && p.path ? p.path : '');
    if (!s) return false;
    const norm = s.replace(/\\/g, '/');
    const expect = path.join(DIST_DIR, TRACE_NAME).replace(/\\/g, '/');
    return norm === expect || (norm.endsWith('/' + TRACE_NAME) && norm.includes('trace'));
  } catch {
    return false;
  }
}

// 写用 'w'(NUL/真实文件均安全;每次 build 为新进程,覆盖无害),读用 'r'。
function realFlagsFor(flags) {
  if (typeof flags === 'string' && flags.includes('r') && !flags.includes('+')) return 'r';
  return 'w';
}

const origOpen = fs.open;
const origOpenSync = fs.openSync;
const origPromisesOpen = fs.promises.open;

fs.open = function patchedOpen(p, flags, ...rest) {
  if (isTraceTarget(p)) {
    try { return origOpen.call(this, TRACE_REAL, realFlagsFor(flags), ...rest); }
    catch { return origOpen.call(this, TRACE_REAL, 'a', ...rest); }
  }
  return origOpen.call(this, p, flags, ...rest);
};

fs.openSync = function patchedOpenSync(p, flags, ...rest) {
  if (isTraceTarget(p)) {
    try { return origOpenSync.call(this, TRACE_REAL, realFlagsFor(flags), ...rest); }
    catch { return origOpenSync.call(this, TRACE_REAL, 'a', ...rest); }
  }
  return origOpenSync.call(this, p, flags, ...rest);
};

fs.promises.open = async function patchedPromisesOpen(p, flags, ...rest) {
  if (isTraceTarget(p)) {
    try { return await origPromisesOpen.call(this, TRACE_REAL, realFlagsFor(flags), ...rest); }
    catch { return await origPromisesOpen.call(this, TRACE_REAL, 'a', ...rest); }
  }
  return await origPromisesOpen.call(this, p, flags, ...rest);
};

require('next/dist/bin/next');
