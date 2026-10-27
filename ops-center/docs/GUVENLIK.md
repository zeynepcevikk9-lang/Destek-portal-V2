# Güvenlik ilkeleri

Bu araç alarm bilgisini bir araya getirir; bu yüzden bir oturum ele geçirilirse görülecek şey büyük olabilir. Riski **az veri göstererek** ve **yalnızca okuyarak** küçültüyoruz.

## 1. Az veri

- Yalnızca **aksiyon gerektiren** alarmlar gösterilir. Kalp atışı, bilgi seviyesi ve susturulmuş/engellenmiş alarmlar gelmez.
- Arayüze giden alan listesi sabittir (`AlertGroup`): alarm adı, ortam, namespace, önem, adet, ilk görülme, kısa özet, en çok 8 etkilenen. Ham etiket listesi, `fingerprint` ve `generatorURL` (iç Prometheus adresi) **gönderilmez** (testle doğrulanır).
- Hata mesajları kısa ve geneldir, iç adres sızdırmaz.

## 2. Salt okunur

- Alertmanager'a yalnızca `GET /api/v2/alerts` atılır. Susturma, onay, silme yoktur.
- Ticket taslağı hiçbir yere kayıt açmaz. Ticket sistemi bağlanınca bile açma işlemi kullanıcının **tuşa basmasıyla** olur. Otomatik ticket yoktur.
- Wazuh, cihaz/MAC gibi kaynaklar eklenirse de aynı kural: önce yalnızca okuma.

## 3. Erişim

- Sunucu varsayılan olarak yalnızca `127.0.0.1` dinler. Dışarıya açmak bilinçli bir karar olmalıdır.
- **Henüz kimlik doğrulama yok** (yerel geliştirme). Dışarıya açılmadan önce zorunlu: SSO ile giriş, yalnızca yetkili roller (yönetici), mümkünse çok adımlı doğrulama.
- SSO çalışmazsa araca girilemez; bu yüzden güçlü parolalı, ayrı bir acil durum (break-glass) hesabı planlanmalıdır.
- Araç, izlediği altyapıyla aynı yerde çalışmamalıdır; asıl alarm yolu (Alertmanager → bildirim) bu araçtan bağımsız kalır, bu araç yalnızca bir kolaylık katmanıdır.

## 4. İşlem kaydı

- Her liste ve taslak isteği `data/audit.log` dosyasına (kim, ne zaman, ne) yazılır. Alarm içeriği kayda yazılmaz. `data/` klasörü git'e girmez.
- Kullanıcı kimliği şimdilik `x-user` başlığı ya da `local-dev`. SSO gelince token'dan alınacak.

## 5. Depoya konmayacaklar

Gerçek hostname, IP, parola, token, kubeconfig, müşteri veya çalışan verisi. Test ve geliştirme **sahte veriyle** yapılır (`server/src/fixtures`).
