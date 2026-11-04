// Tarayıcıya yalnızca herkese açık Supabase ayarlarını verir (anon key RLS ile korunur).
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    res.status(500).json({ error: "SUPABASE_URL ve SUPABASE_ANON_KEY Vercel ortam değişkenlerinde tanımlı değil." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ url, anonKey });
}
