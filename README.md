# Meeting Copilot · Tegeta Discovery

Toplantıyı canlı dinler, konuşmayı Claude'a okutur ve Tegeta soru bankasındaki **core** ve **deep-dive** soruların hangilerinin cevaplandığını ekipteki herkese aynı anda gösterir.

- **Bir kişi kayıtta:** Toplantı odasındaki laptopta "Kaydı başlat"a basılır. Mikrofon Chrome veya Edge ile dinlenir.
- **Herkes canlı izler:** Transkript, işaretlenen sorular ve notlar herkesin ekranına birkaç saniye içinde düşer.
- **Herkes düzeltebilir:** Durumu değiştirmek, cevap notu yazmak ve yeni soru (Core / Deep-dive) eklemek mümkün.
- **Claude sunucuda çalışır:** API anahtarı tarayıcıya hiç gitmez.

## Yapı

| Parça | Dosya |
|---|---|
| Arayüz (tek sayfa) | `public/index.html` |
| Supabase ayarlarını tarayıcıya verir | `api/config.js` |
| Claude analizi (Vercel fonksiyonu) | `api/analyze.js` |
| Veritabanı şeması | `supabase/schema.sql` |
| Tegeta soru bankası (66 core + 238 deep-dive) | `supabase/seed.sql` |

## Kurulum

### 1. Supabase
1. **SQL Editor → New query**: `supabase/schema.sql` dosyasının içeriğini yapıştırıp **Run**'a basın.
2. Yeni bir sorgu açın, `supabase/seed.sql` dosyasını yapıştırıp **Run**'a basın.
3. **Authentication → Sign In / Providers**: "Allow new users to sign up" seçeneğini **kapatın**. Böylece sadece sizin eklediğiniz kişiler girebilir.
4. **Authentication → Users → Add user → Create new user**: Her ekip arkadaşı için e-posta ve şifre girin, "Auto Confirm User" işaretli olsun.
5. **Project Settings → API Keys** sayfasından şu üç değeri not alın:
   - Project URL (`https://xxxx.supabase.co`)
   - Publishable / anon key
   - Secret / service_role key: **gizli tutun**, sadece Vercel'e girilir.

### 2. Vercel
1. **Add New → Project** ile bu GitHub reposunu import edin. Framework Preset: **Other**. Diğer ayarlara dokunmayın.
2. **Environment Variables** bölümüne şunları ekleyin:

| İsim | Değer |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service_role key |
| `ANTHROPIC_API_KEY` | Anthropic API anahtarı |

3. **Deploy**'a basın. Çıkan adresi ekiple paylaşın.

### 3. Test
1. Adresi açıp kendi kullanıcınızla giriş yapın.
2. Sağdaki "Canlı oturumu saate göre değiştir" işaretini kaldırın ve B2B Wholesale sekmesinde **Bunu canlı yap**'a basın.
3. **Kaydı başlat**'a basıp mikrofona izin verin. İngilizce birkaç cümle söyleyin, sonra **Şimdi analiz et**'e basın.
4. Başka bir bilgisayarda ya da telefonda aynı adrese girip ekranın canlı güncellendiğini görün.
5. Testten sonra Supabase SQL Editor'da aşağıdaki sıfırlama sorgusunu çalıştırın.

## Toplantı günü
- Kayıt laptopu: **Kaydı başlat**. Gün boyu açık ve fişte kalsın. Oturum, programdaki saate göre kendiliğinden değişir.
- Diğerleri: Sadece adrese girer. Herhangi bir sekmeye bakabilirler, canlı oturum **CANLI** etiketiyle gösterilir.
- Gün sonu: **Kapanış raporu → Markdown indir** ve **Transkripti indir**.

## Sıfırlama (test verilerini silmek)
```sql
update questions set status='open', answer='', quote='', updated_by=null, updated_at=null;
delete from segments; delete from notes;
update app_state set mic_holder=null, mic_heartbeat=null, analyzing_until=null, last_analysis=null;
```

## Maliyet
Claude Opus 5.5, low effort, yaklaşık dakikada bir istek. 6 saatlik toplantı tahminen 10-18 dolar tutar. Anthropic Console'da bir harcama limiti tanımlayın.
