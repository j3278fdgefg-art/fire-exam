// 雲端同步 API：以同步碼雜湊為鍵，存取整份學習資料 JSON（Vercel Blob）
import { put, head, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";

const ALLOWED_ORIGINS = [
  "https://j3278fdgefg-art.github.io",
  "http://localhost:8901",
  "http://127.0.0.1:8901",
];

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/fire-exam[a-z0-9-]*\.vercel\.app$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-sync-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = req.headers["x-sync-key"];
  if (!/^[0-9a-f]{64}$/.test(key || "")) return res.status(400).json({ error: "bad key" });
  const pathname = `sync/${key}.json`;

  if (req.method === "GET") {
    try {
      const meta = await head(pathname);
      // 帶唯一時間戳參數讀取，繞過覆寫後殘留的 CDN 快取（downloadUrl 會回舊版，勿用）
      const r = await fetch(`${meta.url}?v=${Date.now()}`, {
        cache: "no-store",
        headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (!r.ok) return res.status(502).json({ error: "cloud read failed" });
      return res.status(200).json(await r.json());
    } catch (e) {
      if (e instanceof BlobNotFoundError) return res.status(404).json({ error: "not found" });
      return res.status(502).json({ error: "cloud read failed" });
    }
  }

  if (req.method === "PUT") {
    const body = req.body;
    if (!body || typeof body !== "object" || !body.settings || !Number.isFinite(body._ts)) {
      return res.status(400).json({ error: "bad body" });
    }
    const text = JSON.stringify(body);
    if (text.length > 512 * 1024) return res.status(413).json({ error: "too large" });
    let meta = null;
    try {
      meta = await head(pathname);
    } catch (e) {
      if (!(e instanceof BlobNotFoundError)) return res.status(502).json({ error: "cloud read failed" });
    }
    if (meta) {
      try {
        const currentResponse = await fetch(`${meta.url}?v=${Date.now()}`, {
          cache: "no-store",
          headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        });
        if (!currentResponse.ok) return res.status(502).json({ error: "cloud read failed" });
        const currentText = await currentResponse.text();
        const current = JSON.parse(currentText);
        const currentTs = Number.isFinite(current?._ts) ? current._ts : 0;
        if (currentTs > body._ts || (currentTs === body._ts && currentText !== text)) {
          return res.status(409).json({ error: "cloud conflict" });
        }
        if (currentText === text) return res.status(200).json({ ok: true });
      } catch {
        return res.status(502).json({ error: "cloud read failed" });
      }
    }
    try {
      await put(pathname, text, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(meta),
        ...(meta ? { ifMatch: meta.etag } : {}),
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || !meta && (e?.code === "blob_already_exists" || e?.name === "BlobAlreadyExistsError")) {
        return res.status(409).json({ error: "cloud conflict" });
      }
      return res.status(502).json({ error: "cloud write failed" });
    }
  }

  return res.status(405).json({ error: "method not allowed" });
}
