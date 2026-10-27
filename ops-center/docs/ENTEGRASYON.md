# Ticket entegrasyonu: yeni portal + Jira

Bir alarmdan ticket, **kullanıcı tuşa basınca** hem yeni destek portalına hem Jira'ya açılır. Otomatik ticket yoktur.

## Akış

```
Aksiyon bekleyen alarm
   → Ticket taslağı (başlık, açıklama, ekip, öncelik)
   → Kullanıcı onaylar ("Evet, aç")
   → 1) Yeni portal: kayıt açılır, portal numarası alınır (BT-1001 / SG-0001)
   → 2) Jira: ticket açılır, portal numarası etiket ve açıklamaya yazılır
   → Sonuç: portal numarası + Jira anahtarı birlikte gösterilir
```

## Kararlar

| Konu | Karar | Neden |
|---|---|---|
| Asıl kayıt | **Portal** | Jira geçici olarak çökse bile ticket kaybolmaz |
| Sıra | Önce portal, sonra Jira | Portal açılamazsa Jira'ya da gönderilmez (tek taraflı kayıt oluşmaz) |
| Jira hata verirse | Ticket portalda kalır, `jira.status=failed`, arayüzde **"Jira'yı tekrar dene"** | Kayıp yok, elle düzeltme kolay |
| Aynı alarmdan ikinci basış | Yeni ticket açılmaz, "zaten açılmış" gösterilir | Çift ticket'ı engeller. Anahtar: alarm + ilk görülme zamanı |
| Ticket numarası | Portal numarası kullanıcıya, Jira anahtarı yanında | İkisi de aranabilir (sürümler arası karar: değiştirilebilir) |
| Varsayılan mod | **Jira deneme modu**, yerel portal kaydı | Yanlışlıkla canlıya yazmak imkânsız; canlı mod açık ayar ister |

## Yeni portal API sözleşmesi

Portal henüz yok. Hazır olunca `PORTAL_MODE=http` ile bağlanır; bu sözleşmeyi karşılaması gerekir.

**İstek:** `POST {PORTAL_URL}/api/tickets` (varsa `Authorization: Bearer <PORTAL_TOKEN>`)

```json
{
  "title": "KubePodNotReady — demo-app",
  "description": "Alarm: ...",
  "team": "it",
  "priority": "normal",
  "source": "alarm",
  "externalRef": "a1b2c3...",
  "createdBy": "kullanici"
}
```

- `team`: `it` veya `sec`. `priority`: `kritik`, `yuksek`, `normal`.
- `externalRef`: tekrar edilen isteği tanımak için. Portal, aynı `externalRef` ile ikinci kez gelirse **yeni kayıt açmamalı**, mevcut olanı döndürmeli.

**Yanıt:** `201` ve `{ "id": "BT-1001" }`. `id` yoksa ya da `2xx` değilse ticket açılmamış sayılır.

## Jira eşlemesi

- **Uç nokta:** `POST {JIRA_BASE_URL}/rest/api/2/issue` (v2: açıklama düz metin olabilir, v3 ADF ister).
- **Kimlik:** Basic (`JIRA_EMAIL` + `JIRA_API_TOKEN`), yalnızca ortam değişkeninden. Hata mesajları ve yanıtlar token içermez (testle doğrulanır).
- **Alanlar:** `project` (ekibe göre), `issuetype` (ekibe göre), `summary` (en çok 250 karakter), `description` (ilk satır `Portal ticket: <numara>`), `labels` (`ops-center`, `alarm`, `portal-<numara>`), `priority` (yalnızca `JIRA_PRIORITY_MAP` varsa).
- Proje anahtarları, ticket tipleri ve öncelik adları **koda gömülü değildir**; yerel `.env` dosyasından gelir (depo herkese açık olabilir).
- Özel alanlar (örneğin "Talep Eden") şimdilik gönderilmez. Gerekirse ayar olarak eklenir.

## Ayarlar

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `PORTAL_MODE` | `local` | `local`: yerel kayıt (geliştirme). `http`: yeni portalın API'si |
| `PORTAL_URL`, `PORTAL_TOKEN` | boş | `PORTAL_MODE=http` için |
| `JIRA_MODE` | `dry-run` | `dry-run`: Jira'ya **hiçbir şey gönderilmez**. `live`: gerçek gönderim |
| `JIRA_BASE_URL` | | `https://` ile başlamalı (canlı mod) |
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | | Canlı mod. **Token depoya girmez** |
| `JIRA_PROJECT_IT`, `JIRA_PROJECT_SEC` | | Ekibe göre proje anahtarı (canlı mod) |
| `JIRA_ISSUETYPE_IT`, `JIRA_ISSUETYPE_SEC` | | Ekibe göre ticket tipi adı (canlı mod) |
| `JIRA_PRIORITY_MAP` | boş | `kritik=Highest,yuksek=High,normal=Medium`. Boşsa öncelik gönderilmez |
| `TICKET_STORE` | `./data/tickets.json` | Yerel kayıt dosyası (git'e girmez) |

Canlı moda geçerken eksik ayar varsa sunucu **açılmaz** ve yalnızca eksik ayarın adını söyler (değer yazmaz).

## Canlıya geçmeden önce kontrol listesi

- [ ] Jira için **kişisel token yerine servis hesabı** (yalnızca gerekli projelere yetkili).
- [ ] Siber ticket'ların gideceği Jira projesinin erişimi **Private**: yoksa Jira'ya girebilen herkes görür.
- [ ] Araca **SSO ile giriş** ve yetkili roller (şu an kimlik doğrulama yok, yalnızca yerel).
- [ ] İlk gerçek gönderim, **deneme (test) bir projede** ve tek ticket ile; sonuç elle kontrol edilir.
- [ ] Yeni portal API'si hazır ve sözleşmeyi karşılıyor (`externalRef` ile tekrar koruması dahil).
- [ ] Jira proje anahtarı, ticket tipi ve öncelik adları gerçek Jira'dan teyit edildi.

## Bilinen sınırlar (ilk sürüm)

- Kayıt **dosya tabanlı** (geliştirme için). Kalıcı çözüm portalın kendi veritabanıdır.
- Jira'da önceden "bu alarm için ticket var mı" araması yok; çift kayıt koruması yerel kayda dayanır.
- Jira'daki değişiklikler (durum, yorum) portala geri akmaz; yalnızca portal → Jira yönü var.
- Kimlik doğrulama yok; kullanıcı kimliği şimdilik `x-user` başlığı ya da `local-dev`.
