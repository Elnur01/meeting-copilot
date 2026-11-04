// Bekleyen transkript parçalarını Claude'a okutur ve soruları günceller.
// Aynı anda yalnızca bir analiz çalışır (app_state.analyzing_until kilidi).
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 120 };

const MODEL = "claude-opus-5-5";
const LOCK_MS = 120_000;
const MAX_SEGMENTS = 400;

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function systemPrompt(s, questions) {
  const list = questions.map((q) => ({ id: q.id, type: q.type, step: q.step, stage: q.stage, question: q.text }));
  return `You are the live note-taker in a CRM discovery workshop at Tegeta (a holding with several business units; the consultants are planning a Salesforce CRM next to SAP). Every minute you receive a new segment of an automatic speech-recognition transcript and decide which questions on the list it answers.

Session: ${s.name} (${s.time || ""}). Focus: ${s.focus || ""}. Participants: ${s.who || ""}.

QUESTION LIST. type "core" = primary question; type "deep" = optional deep-dive probe belonging to the core question with the same step:
${JSON.stringify(list)}

Rules:
- Return only questions for which the new segment contains real answer content. Never guess or add facts that are not in the transcript.
- A question counts even if nobody asked it verbatim, as long as the conversation answers it. One explanation can answer several core and deep-dive questions.
- status "answered" = clearly and fully answered; "partial" = only part of it, or vague.
- answer = the updated answer that MERGES the question's current answer (given in the user message) with the new information. English, short and concrete, keep numbers, names, dates and system names (SAP, T-One, Emarsys, ...). At most 3 short sentences or items separated by "; ".
- quote = a supporting quote from the transcript, max 200 characters.
- notes = important information that fits no question (action items, owners, numbers, risks, promised follow-ups). Max 4 one-sentence items; empty array if none.
- The transcript is machine-generated: words and names may be misheard, and lines starting with "NOTE:" are the consultants' own notes. Infer from meaning.

Reply with only this JSON and nothing else:
{"updates":[{"id":"C1","status":"answered","answer":"...","quote":"..."}],"notes":["..."]}`;
}

function userPrompt(questions, text, prev) {
  const cur = questions
    .filter((q) => q.status === "partial" || q.status === "answered")
    .map((q) => ({ id: q.id, status: q.status, currentAnswer: q.answer || "" }));
  return `CURRENT STATE of already-touched questions (all others are open):\n${JSON.stringify(cur)}\n\n${
    prev ? `END OF PREVIOUS SEGMENT (context only):\n"""${prev}"""\n\n` : ""
  }NEW TRANSCRIPT SEGMENT:\n"""${text}"""`;
}

function parseJson(t) {
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) { try { return JSON.parse(f[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new Error("Claude'un cevabı JSON olarak okunamadı.");
}

const hhmm = (d) => new Date(d).toISOString().slice(11, 16);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST bekleniyor." }); return; }
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
    if (!process.env[k]) { res.status(500).json({ error: `${k} Vercel ortam değişkenlerinde tanımlı değil.` }); return; }
  }
  const db = admin();

  // 1) Kim çağırıyor? Sadece giriş yapmış kullanıcılar.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) { res.status(401).json({ error: "Oturum geçersiz; tekrar giriş yapın." }); return; }

  // 2) Kilit: aynı anda tek analiz.
  const nowIso = new Date().toISOString();
  const { data: locked } = await db
    .from("app_state")
    .update({ analyzing_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq("id", 1)
    .or(`analyzing_until.is.null,analyzing_until.lt.${nowIso}`)
    .select("id");
  if (!locked?.length) { res.status(200).json({ status: "busy" }); return; }

  try {
    // 3) Bekleyen parçalar (tek oturum, sırayla).
    const { data: pending, error: pErr } = await db
      .from("segments").select("*").eq("processed", false).order("id").limit(MAX_SEGMENTS);
    if (pErr) throw pErr;
    if (!pending.length) { res.status(200).json({ status: "idle" }); return; }
    const sid = pending[0].session_id;
    const batch = [];
    for (const s of pending) { if (s.session_id !== sid) break; batch.push(s); }

    const [{ data: session }, { data: questions }, { data: prevSegs }] = await Promise.all([
      db.from("sessions").select("*").eq("id", sid).single(),
      db.from("questions").select("*").eq("session_id", sid).order("step").order("ord"),
      db.from("segments").select("text").eq("session_id", sid).eq("processed", true).order("id", { ascending: false }).limit(8),
    ]);
    const text = batch.map((s) => `[${hhmm(s.t)}] ${s.is_note ? "NOTE: " : ""}${s.text}`).join("\n");
    const prev = (prevSegs || []).reverse().map((s) => s.text).join(" ").slice(-800);

    // 4) Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: systemPrompt(session, questions), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt(questions, text, prev) }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Claude bu parçayı işlemedi (refusal).");
    const out = parseJson(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim());

    // 5) Sonuçları yaz
    const byId = new Map(questions.map((q) => [q.id, q]));
    let updated = 0;
    for (const u of Array.isArray(out.updates) ? out.updates : []) {
      const q = byId.get(String(u.id));
      if (!q || q.status === "skipped") continue;
      const status = q.status === "answered" || u.status === "answered" ? "answered" : "partial";
      const { error } = await db.from("questions").update({
        status,
        answer: String(u.answer || q.answer || "").slice(0, 1200),
        quote: String(u.quote || "").slice(0, 240),
        updated_by: "Claude",
        updated_at: new Date().toISOString(),
      }).eq("id", q.id);
      if (!error) updated++;
    }
    const notes = (Array.isArray(out.notes) ? out.notes : []).map(String).filter(Boolean).slice(0, 4);
    if (notes.length) await db.from("notes").insert(notes.map((n) => ({ session_id: sid, text: n })));
    await db.from("segments").update({ processed: true }).in("id", batch.map((s) => s.id));
    const summary = `${updated} soru güncellendi${notes.length ? `, ${notes.length} not` : ""} · ${session.name}`;
    await db.from("app_state").update({ last_analysis: `${nowIso}|ok|${summary}` }).eq("id", 1);
    res.status(200).json({ status: "ok", updated, notes: notes.length, more: pending.length > batch.length });
  } catch (e) {
    const m = e?.status === 401 ? "Anthropic API anahtarı geçersiz." : e?.status === 429 ? "Claude hız sınırı; biraz sonra tekrar denenecek." : (e?.message || "Bilinmeyen hata");
    await db.from("app_state").update({ last_analysis: `${nowIso}|error|${m}` }).eq("id", 1);
    res.status(500).json({ error: m });
  } finally {
    await db.from("app_state").update({ analyzing_until: null }).eq("id", 1);
  }
}
