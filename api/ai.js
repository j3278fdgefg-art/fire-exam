const allowedOrigins = ["https://fire-exam.vercel.app", "http://localhost:8901"];
const AI_ENABLED = false; // ponytail: keep the implementation dormant until the user wants it back.

function textFromOpenAI(data) {
  return data.output_text || (data.output || []).flatMap(item => item.content || [])
    .filter(part => part.type === "output_text").map(part => part.text).join("");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (allowedOrigins.includes(origin) || /^https:\/\/fire-exam[a-z0-9-]*\.vercel\.app$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!AI_ENABLED) return res.status(503).json({ error: "教材 AI 目前已關閉" });
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { provider, question, sources } = req.body || {};
  if (!['openai', 'gemini'].includes(provider) || typeof question !== "string" || !Array.isArray(sources)) {
    return res.status(400).json({ error: "bad request" });
  }
  const context = sources.slice(0, 10).map((s, i) => `[${i + 1}] ${String(s.label || "教材")}:\n${String(s.text || "").slice(0, 3500)}`).join("\n\n");
  if (!question.trim() || !context || question.length > 2000 || context.length > 30000) {
    return res.status(400).json({ error: "內容太長或沒有教材可參考" });
  }
  const instructions = "你是消防考試教材助教。只能根據提供的教材回答，不可自行補充法規或猜測。請用繁體中文、清楚簡短地解釋；每個重要結論後標註對應來源如 [1]。若教材沒有答案，要直接說『提供的教材沒有足夠資訊』。";

  try {
    if (provider === "openai") {
      if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "尚未設定 OPENAI_API_KEY" });
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-5", instructions, input: `教材：\n${context}\n\n問題：${question}`, max_output_tokens: 800, store: false }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `OpenAI ${r.status}`);
      return res.status(200).json({ answer: textFromOpenAI(data) });
    }

    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "尚未設定 GEMINI_API_KEY" });
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ parts: [{ text: `教材：\n${context}\n\n問題：${question}` }] }],
        generationConfig: { maxOutputTokens: 800 },
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `Gemini ${r.status}`);
    return res.status(200).json({ answer: data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "沒有產生回答。" });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
