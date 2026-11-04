import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { storageConfig } from "@/lib/config";

export interface StorageAdapter {
  readonly kind: "s3" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL for published media (served via /media/<key> route when no CDN base URL). */
  publicUrl(key: string): string;
}

class LocalStorage implements StorageAdapter {
  readonly kind = "local" as const;
  constructor(private dir: string) {}
  private p(key: string) {
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.dir, safe);
  }
  async put(key: string, body: Buffer) {
    await mkdir(path.dirname(this.p(key)), { recursive: true });
    await writeFile(this.p(key), body);
  }
  async get(key: string) {
    try {
      const body = await readFile(this.p(key));
      const ext = path.extname(key).toLowerCase();
      const contentType = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : ext === ".pdf" ? "application/pdf" : "image/jpeg";
      return { body, contentType };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await unlink(this.p(key)).catch(() => undefined);
  }
  publicUrl(key: string) {
    return `/media/${key}`;
  }
}

class S3Storage implements StorageAdapter {
  readonly kind = "s3" as const;
  private client: S3Client;
  constructor(private cfg: Extract<ReturnType<typeof storageConfig>, { provider: "s3" }>) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      const body = Buffer.from(await r.Body!.transformToByteArray());
      return { body, contentType: r.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
  publicUrl(key: string) {
    return this.cfg.publicBaseUrl ? `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}` : `/media/${key}`;
  }
}

export function getStorage(): StorageAdapter | null {
  const cfg = storageConfig();
  if (cfg.provider === "s3") return new S3Storage(cfg);
  if (cfg.provider === "local") return new LocalStorage(cfg.dir);
  return null;
}
