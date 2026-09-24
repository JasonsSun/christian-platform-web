// 媒体安全扫描(无第三方依赖;可选对接 ClamAV)
//
// 之前这里是一行「安全扫描(占位,始终通过)」,等于任何文件都直接放行,
// 存在伪装文件 / 恶意载荷入库的风险。现改为:
//   1) 文件头 magic-byte 与扩展名一致性校验 —— 防扩展名欺骗(如把 .exe 改 .jpg)
//   2) 可执行 / 脚本木马特征检测 —— 拦截 MZ/ELF、PHP、HTML 脚本等危险载体
//   3) 若系统中存在 clamscan / clamdscan,则优先用 ClamAV 做病毒扫描,
//      否则降级到上面的签名校验(同样能拦住绝大多数伪装与恶意文件)
//
// 设计为纯 Node 内置能力,零外部依赖即可拦截大部分风险;ClamAV 是「锦上添花」,
// 不存在也不会让扫描失效。

import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export interface ScanResult {
  /** 是否通过(无威胁) */
  clean: boolean;
  /** 使用的扫描引擎: signature | clamav | read */
  engine: string;
  /** 未通过原因(clean=false 时有值) */
  reasons: string[];
}

/** 各扩展名对应的合法文件头(magic bytes),任一匹配即视为类型自洽 */
const SIGNATURES: Record<string, number[][]> = {
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  gif: [[0x47, 0x49, 0x46, 0x38]], // GIF8
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
  mp3: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]], // ID3 / MPEG 帧
  wav: [[0x52, 0x49, 0x46, 0x46]], // RIFF
  m4a: [[0x66, 0x74, 0x79, 0x70]], // ftyp(任意偏移)
  aac: [[0xff, 0xf1], [0xff, 0xf9]],
  ogg: [[0x4f, 0x67, 0x67, 0x53]],
  flac: [[0x66, 0x4c, 0x61, 0x43]],
  mp4: [[0x66, 0x74, 0x79, 0x70]], // ftyp
  mov: [[0x66, 0x74, 0x79, 0x70]], // ftyp
  webm: [[0x1a, 0x45, 0xdf, 0xa3]], // EBML
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

/** 危险载体:无论扩展名如何都直接拒绝 */
function isExecutable(head: Buffer): boolean {
  // PE / MZ
  if (head[0] === 0x4d && head[1] === 0x5a) return true;
  // ELF
  if (
    head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46
  )
    return true;
  // Mach-O
  if (
    (head[0] === 0xcf && head[1] === 0xfa) ||
    (head[0] === 0xfe && head[1] === 0xed)
  )
    return true;
  return false;
}

/** 脚本 / 网页木马特征(仅对「非文档类」扩展名敏感,避免误伤正常 docx) */
function looksLikeScript(head: Buffer, ext: string): boolean {
  const docLike = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'pdf'];
  if (docLike.includes(ext)) return false;
  // shebang
  if (head[0] === 0x23 && head[1] === 0x21) return true; // #!
  // 明文 PHP 标签
  const headStr = head.slice(0, 64).toString('latin1');
  if (/^<\?php/i.test(headStr) || /^<script/i.test(headStr)) return true;
  return false;
}

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  return true;
}

function containsAt(head: Buffer, sig: number[], maxOffset: number): boolean {
  for (let off = 0; off <= Math.min(maxOffset, head.length - sig.length); off++) {
    let ok = true;
    for (let i = 0; i < sig.length; i++) if (head[off + i] !== sig[i]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/** 可选:调用 ClamAV 扫描(无二进制则跳过) */
async function clamavScan(abs: string): Promise<ScanResult | null> {
  for (const bin of ['clamscan', 'clamdscan']) {
    try {
      const { stdout } = await execFileP(bin, ['--no-summary', '-r', abs], {
        timeout: 30_000,
        windowsHide: true,
      });
      const infected = /Infected files:\s*([0-9]+)/i.exec(stdout);
      const count = infected ? Number(infected[1]) : /FOUND/.test(stdout) ? 1 : 0;
      if (count > 0) {
        const names = stdout
          .split('\n')
          .filter((l) => /: .+ FOUND/.test(l))
          .map((l) => l.split(':').slice(1).join(':').trim());
        return { clean: false, engine: 'clamav', reasons: names.length ? names : ['ClamAV 检测到威胁'] };
      }
      return { clean: true, engine: 'clamav', reasons: [] };
    } catch (e: any) {
      // ENOENT -> 该二进制不存在,试下一个
      if (e?.code === 'ENOENT') continue;
      // 其它错误(如超时)不阻断上传,降级到签名校验
      return null;
    }
  }
  return null;
}

/** 扫描一个已落盘的文件;返回是否通过 + 原因 */
export async function scanMediaFile(abs: string, ext: string): Promise<ScanResult> {
  let head: Buffer;
  try {
    const fh = await fs.open(abs, 'r');
    head = Buffer.alloc(512);
    await fh.read(head, 0, 512, 0);
    await fh.close();
  } catch (e: any) {
    return { clean: false, engine: 'read', reasons: [`无法读取文件：${e?.message || ''}`] };
  }

  const reasons: string[] = [];

  // 1) 危险载体(优先级最高)
  if (isExecutable(head)) reasons.push('检测到可执行文件头(MZ/ELF/Mach-O)');
  if (looksLikeScript(head, ext)) reasons.push('疑似脚本/网页木马');

  // 2) 文件头与扩展名一致性(防伪装)
  const sigs = SIGNATURES[ext];
  if (sigs) {
    const matched =
      ext === 'mp4' || ext === 'mov' || ext === 'm4a'
        ? containsAt(head, sigs[0], 64) // ftyp 可能不在文件头
        : sigs.some((s) => startsWith(head, s));
    if (!matched) reasons.push(`文件头与扩展名 .${ext} 不匹配(可能是伪装文件)`);
  }

  // 3) ClamAV(可选,优先)
  const clam = await clamavScan(abs);
  if (clam) {
    if (!clam.clean) reasons.push(...clam.reasons);
    return { clean: reasons.length === 0, engine: clam.engine, reasons };
  }

  return { clean: reasons.length === 0, engine: 'signature', reasons };
}
