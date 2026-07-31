// 雲端同步 API：以同步碼雜湊為鍵，存取整份學習資料 JSON（Vercel Blob）
import { put, head } from "@vercel/blob";

const ALLOWED_ORIGINS = [
  "https://j3278fdgefg-art.github.io",
  "http://localhost:8901",
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
      // downloadUrl 每次呼叫都重新簽名（網址不同），可繞過覆寫後殘留的 CDN 快取
      const auth = { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };
      let r = await fetch(meta.downloadUrl, { cache: "no-store", headers: auth });
      if (!r.ok) r = await fetch(`${meta.url}?v=${Date.now()}`, { cache: "no-store", headers: auth });
      if (!r.ok) throw new Error(`blob fetch ${r.status}`);
      return res.status(200).json(await r.json());
    } catch (e) {
      return res.status(404).json({ error: "not found", detail: String(e && e.message || e) });
    }
  }

  if (req.method === "PUT") {
    const body = req.body;
    if (!body || typeof body !== "object" || !body.settings) return res.status(400).json({ error: "bad body" });
    const text = JSON.stringify(body);
    if (text.length > 512 * 1024) return res.status(413).json({ error: "too large" });
    await put(pathname, text, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
