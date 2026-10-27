# Operasyon: aksiyon bekleyenler

Altyapı alarmlarından **yalnızca aksiyon gerektirenleri** tek ekranda gösteren, **salt okunur** küçük bir araç. Alarmlar Alertmanager'dan okunur; gürültü (kalp atışı, bilgi seviyesi) gösterilmez, aynı konudaki alarmlar tek satırda toplanır. Bir alarmdan **ticket taslağı** üretilir; kullanıcı **tuşa basıp onaylayınca** ticket hem **yeni destek portalına** hem **Jira'ya** açılır (Jira varsayılan olarak **deneme modundadır**, hiçbir şey göndermez). Ayrıntı: [docs/ENTEGRASYON.md](docs/ENTEGRASYON.md).

> Bu ilk sürümdür. Tasarım ve kapsam konuşarak şekillenecek (bkz. [docs/SIRADAKI.md](docs/SIRADAKI.md)).

## Ne yapar, ne yapmaz

| Yapar | Yapmaz |
|---|---|
| Alertmanager'dan okur (yalnızca `GET`) | Alertmanager'a yazmaz, susturma/onay yapmaz |
| Gürültüyü eler, alarmları gruplar | **Otomatik** ticket açmaz (yalnızca kullanıcı onaylayınca) |
| Onayla ticket açar: önce portal, sonra Jira; Jira hata verirse ticket kaybolmaz, tekrar denenir | Aynı alarmdan ikinci ticket açmaz |
| Her kaynağı ayrı okur (biri çökerse diğeri çalışır) | Ham etiket, iç adres, parola göstermez |
| Jira'ya varsayılan olarak **gerçekten göndermez** (deneme modu) | Dışarıya açılmaz (yalnızca `127.0.0.1`) |

## Çalıştırma (sahte veriyle, hiçbir sisteme bağlanmadan)

```bash
# 1) API
cd server
npm install
npm test               # testler
npm run dev            # http://127.0.0.1:8787  (varsayılan: MODE=mock, sahte veri)

# 2) Arayüz (ikinci terminalde)
cd web
npm install
npm run dev            # http://127.0.0.1:5173
```

## Gerçek Alertmanager ile (salt okunur)

Alertmanager'a yalnızca **yerel port yönlendirme** ile bağlanın, internete açmayın:

```bash
kubectl -n <namespace> port-forward svc/<alertmanager-servisi> 19093:9093

MODE=live SOURCES="kume-1=http://127.0.0.1:19093" npm run dev
```

| Ortam değişkeni | Varsayılan | Anlamı |
|---|---|---|
| `MODE` | `mock` | `live` olmadıkça sahte veri kullanılır |
| `SOURCES` | boş | `ad=url,ad=url` biçiminde Alertmanager adresleri |
| `IGNORE_ALERTNAMES` | `Watchdog,InfoInhibitor,MonitoringHeartbeat` | Gösterilmeyecek alarm adları |
| `MIN_SEVERITY` | `warning` | Bunun altındakiler gösterilmez |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Dinleme adresi (dışarıya açmak bilinçli karar olmalı) |
| `AUDIT_LOG` | `./data/audit.log` | İşlem kaydı (git'e girmez) |
| `PORTAL_MODE`, `JIRA_MODE` ve diğer ticket ayarları | `local`, `dry-run` | Ayrıntı ve tam liste: [docs/ENTEGRASYON.md](docs/ENTEGRASYON.md). Örnek: `server/.env.example` |

Ayarları `server/.env` dosyasına yazabilirsiniz (git'e girmez, otomatik okunur). **Parola/token paylaşılan dosyalara yazılmaz.**

## Güvenlik ilkeleri

Ayrıntı: [docs/GUVENLIK.md](docs/GUVENLIK.md). Kısaca: az veri, salt okunur, yerel dinleme, gizli bilgi depoya girmez, her işlem kaydedilir. **Depoya gerçek hostname, IP, parola, token ya da müşteri/çalışan verisi konmaz.**

## Yapı

```
server/   Node + TypeScript API (Fastify): Alertmanager okuyucu, gruplama, taslak, işlem kaydı
web/      React + TypeScript arayüz (Vite)
docs/     güvenlik ilkeleri, ticket entegrasyonu (portal + Jira) ve sıradaki adımlar
```
