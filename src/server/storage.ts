import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

/**
 * 存储抽象层。
 *
 * - 默认 `local`：直接落盘到 `public/uploads/...`（与历史行为完全一致）。
 * - `s3`：S3 兼容对象存储（阿里云 OSS / 腾讯云 COS / AWS S3 / MinIO 等）。
 *   全程用 `fetch` + AWS Signature V4 签名，零三方依赖，镜像体积不会膨胀。
 *
 * 切换方式（服务端环境变量）：
 *   STORAGE_PROVIDER=s3
 *   S3_BUCKET=my-bucket
 *   S3_REGION=oss-cn-hangzhou
 *   S3_ENDPOINT=oss-cn-hangzhou.aliyuncs.com   # 不含协议与 bucket 前缀
 *   S3_ACCESS_KEY=...
 *   S3_SECRET_KEY=...
 *   S3_PUBLIC_URL=https://cdn.example.com      # 可选，缺省推导为 https://{bucket}.{endpoint}
 *   S3_PATH_STYLE=1                             # 可选，用 /{bucket}/{key} 而非虚拟主机风格
 */

export type StorageProvider = 'local' | 's3';

export interface StorageObject {
  storageKey: string; // 形如 uploads/202609/uuid.mp4（相对键，与 provider 无关）
  url: string; // 公网可访问 URL
}

interface StorageBackend {
  readonly kind: StorageProvider;
  save(buf: Buffer, ext: string, contentType: string): Promise<StorageObject>;
  /** 以指定 key 写入（commitToStorage 用，key 格式与 save 一致）。 */
  putObject(key: string, buf: Buffer, contentType: string): Promise<void>;
  publicUrl(storageKey: string): string;
  readBuffer(storageKey: string): Promise<Buffer>;
  deleteObject(storageKey: string): Promise<void>;
}

/* ---------------------------------- 本地 ---------------------------------- */

class LocalBackend implements StorageBackend {
  readonly kind = 'local' as const;

  private objectKey(ext: string): string {
    const now = new Date();
    const dir = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${dir}/${crypto.randomUUID()}.${ext}`;
  }

  async save(buf: Buffer, ext: string, contentType: string): Promise<StorageObject> {
    const key = this.objectKey(ext);
    await this.putObject(key, buf, contentType);
    return { storageKey: key, url: '/' + key.replace(/\\/g, '/') };
  }

  async putObject(key: string, buf: Buffer, contentType: string): Promise<void> {
    const absDir = path.join(process.cwd(), 'public', path.dirname(key));
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(process.cwd(), 'public', key), buf);
  }

  publicUrl(storageKey: string): string {
    return '/' + storageKey.replace(/\\/g, '/');
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    return fs.readFile(path.join(process.cwd(), 'public', storageKey));
  }

  async deleteObject(storageKey: string): Promise<void> {
    await fs.unlink(path.join(process.cwd(), 'public', storageKey)).catch(() => {});
  }
}

/* ---------------------------------- S3 ----------------------------------- */

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string; // 不含协议，例如 oss-cn-hangzhou.aliyuncs.com
  accessKey: string;
  secretKey: string;
  publicBase: string;
  pathStyle: boolean;
}

function loadS3Config(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!bucket || !endpoint || !accessKey || !secretKey) {
    throw new Error(
      '[storage] STORAGE_PROVIDER=s3 但 S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY 未配置完整'
    );
  }
  const publicBase =
    process.env.S3_PUBLIC_URL?.replace(/\/$/, '') || `https://${bucket}.${endpoint}`;
  return {
    bucket,
    region,
    endpoint,
    accessKey,
    secretKey,
    publicBase,
    pathStyle: process.env.S3_PATH_STYLE === '1',
  };
}

function s3Host(cfg: S3Config): string {
  return cfg.pathStyle ? cfg.endpoint : `${cfg.bucket}.${cfg.endpoint}`;
}

function s3ObjectUrl(cfg: S3Config, key: string): string {
  const safeKey = key.replace(/^\/+/, '');
  return cfg.pathStyle
    ? `https://${cfg.endpoint}/${cfg.bucket}/${safeKey}`
    : `https://${cfg.bucket}.${cfg.endpoint}/${safeKey}`;
}

/** AWS Signature V4（仅覆盖本项目用到的 PUT / GET / DELETE，body 全缓冲）。 */
function awsSigV4(
  cfg: S3Config,
  method: string,
  url: string,
  payload: Buffer,
  amzDate: string,
  contentType: string
): string {
  const u = new URL(url);
  const host = u.host;
  const uri = u.pathname || '/';
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    method,
    uri,
    '', // 无查询串
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto.createHmac('sha256', `AWS4${cfg.secretKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(cfg.region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return (
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope},` +
    `SignedHeaders=${signedHeaders},Signature=${signature}`
  );
}

class S3Backend implements StorageBackend {
  readonly kind = 's3' as const;
  private cfg: S3Config;

  constructor() {
    this.cfg = loadS3Config();
  }

  private objectKey(ext: string): string {
    const now = new Date();
    const dir = `uploads/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${dir}/${crypto.randomUUID()}.${ext}`;
  }

  async save(buf: Buffer, ext: string, contentType: string): Promise<StorageObject> {
    const key = this.objectKey(ext);
    await this.putObject(key, buf, contentType);
    return { storageKey: key, url: `${this.cfg.publicBase}/${key}` };
  }

  async putObject(key: string, buf: Buffer, contentType: string): Promise<void> {
    const url = s3ObjectUrl(this.cfg, key);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 17);
    const auth = awsSigV4(this.cfg, 'PUT', url, buf, amzDate, contentType);
    const res = await fetch(url, {
      method: 'PUT',
      body: buf,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.length),
        'x-amz-date': amzDate,
        'x-amz-content-sha256': crypto.createHash('sha256').update(buf).digest('hex'),
        Authorization: auth,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[storage] S3 PUT 失败 ${res.status}: ${body.slice(0, 300)}`);
    }
  }

  publicUrl(storageKey: string): string {
    return `${this.cfg.publicBase}/${storageKey.replace(/^\/+/, '')}`;
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    const url = s3ObjectUrl(this.cfg, storageKey);
    const payload = Buffer.alloc(0);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 17);
    const auth = awsSigV4(this.cfg, 'GET', url, payload, amzDate, '');
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-amz-date': amzDate,
        'x-amz-content-sha256': crypto.createHash('sha256').update(payload).digest('hex'),
        Authorization: auth,
      },
    });
    if (!res.ok) throw new Error(`[storage] S3 GET 失败 ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const url = s3ObjectUrl(this.cfg, storageKey);
    const payload = Buffer.alloc(0);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 17);
    const auth = awsSigV4(this.cfg, 'DELETE', url, payload, amzDate, '');
    await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-amz-date': amzDate,
        'x-amz-content-sha256': crypto.createHash('sha256').update(payload).digest('hex'),
        Authorization: auth,
      },
    }).catch(() => {});
  }
}

/* ------------------------------- 后端选择 -------------------------------- */

let cached: StorageBackend | null = null;

export function getStorageBackend(): StorageBackend {
  if (cached) return cached;
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  cached = provider === 's3' ? new S3Backend() : new LocalBackend();
  return cached;
}

/** 容器内或服务端首次启动时可选自检（CI / 启动探针用）。 */
export function storageProviderKind(): StorageProvider {
  return getStorageBackend().kind;
}

/**
 * 取一个本地可读的文件路径：
 * - 本地后端直接返回磁盘路径；
 * - S3 后端先把对象下载到临时目录再返回（供转码/缩略图等本地处理使用）。
 */
export async function readToLocalPath(storageKey: string): Promise<string> {
  const backend = getStorageBackend();
  if (backend.kind === 'local') {
    return path.join(process.cwd(), 'public', storageKey);
  }
  const tmp = path.join(os.tmpdir(), 'cp-media', storageKey.replace(/[\\/]/g, '__'));
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  const buf = await backend.readBuffer(storageKey);
  await fs.writeFile(tmp, buf);
  return tmp;
}

/**
 * 把一个本地暂存文件提交到当前存储后端，返回最终的 storageKey（相对键，与 provider 无关）。
 * - 本地：移动到 `public/<rel>`（与历史行为一致）。
 * - S3：上传到 key=<rel> 的对象，删除本地暂存。
 */
export async function commitToStorage(tmpAbs: string, rel: string, contentType: string): Promise<string> {
  const backend = getStorageBackend();
  const buf = await fs.readFile(tmpAbs);
  await backend.putObject(rel, buf, contentType);
  await fs.unlink(tmpAbs).catch(() => {});
  return rel;
}

/** 删除一个存储对象（两种后端通用）。 */
export async function deleteStorageObject(storageKey: string): Promise<void> {
  await getStorageBackend().deleteObject(storageKey);
}
