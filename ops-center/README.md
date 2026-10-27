# Operasyon: aksiyon bekleyenler

Altyapı alarmlarından **yalnızca aksiyon gerektirenleri** tek ekranda gösteren, **salt okunur** küçük bir araç. Alarmlar Alertmanager'dan okunur; gürültü (kalp atışı, bilgi seviyesi) gösterilmez, aynı konudaki alarmlar tek satırda toplanır. İstenirse bir alarmdan **ticket taslağı** üretilir; taslak hiçbir yere kaydedilmez, ticket'ı kullanıcı açar.

> Bu ilk sürümdür. Tasarım ve kapsam konuşarak şekillenecek (bkz. [docs/SIRADAKI.md](docs/SIRADAKI.md)).

## Ne yapar, ne yapmaz

| Yapar | Yapmaz |
|---|---|
| Alertmanager'dan okur (yalnızca `GET`) | Hiçbir sisteme yazmaz, susturma/onay yapmaz |
| Gürültüyü eler, alarmları gruplar | Otomatik ticket açmaz |
| Ticket **taslağı** üretir | Ham etiket, iç adres, parola göstermez |
| Her kaynağı ayrı okur (biri çökerse diğeri çalışır) | Dışarıya açılmaz (yalnızca `127.0.0.1`) |

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

## Güvenlik ilkeleri

Ayrıntı: [docs/GUVENLIK.md](docs/GUVENLIK.md). Kısaca: az veri, salt okunur, yerel dinleme, gizli bilgi depoya girmez, her işlem kaydedilir. **Depoya gerçek hostname, IP, parola, token ya da müşteri/çalışan verisi konmaz.**

## Yapı

```
server/   Node + TypeScript API (Fastify): Alertmanager okuyucu, gruplama, taslak, işlem kaydı
web/      React + TypeScript arayüz (Vite)
docs/     güvenlik ilkeleri ve sıradaki adımlar
```
