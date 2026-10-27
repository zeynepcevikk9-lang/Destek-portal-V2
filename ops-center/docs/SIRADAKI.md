# Sıradaki adımlar (konuşarak belirlenecek)

Her adımı birlikte karara bağlayıp küçük küçük ilerliyoruz. Sıra ve kapsam değişebilir.

## Aday adımlar

1. ✅ **Ticket açma entegrasyonu hazır** (portal + Jira, deneme modunda). Kalan: yeni portalın API'si, canlıya geçiş kontrol listesi ([ENTEGRASYON.md](ENTEGRASYON.md)).
2. **Kimlik:** SSO ile giriş, rol kontrolü, acil durum hesabı.
3. **Sunucu durumu:** yalnızca aksiyon gerektiren durumlar (disk, servis hatası). Veri kaynağı: mevcut izleme sistemi (Prometheus), ek yetki gerektirmeden.
4. **Güvenlik olayları (Wazuh):** kullanıcı Wazuh'un durumunu anlatınca; yalnızca seçili, aksiyon gerektiren olaylar.
5. **Alarm geçmişi:** son çözülen alarmlar, tekrar eden sorunlar (haftalık özet).
6. **Cihazlar / MAC:** yalnızca okuma, ayrı bir adaptörle.

## Açık sorular

- Ticket'lar hangi sisteme açılacak ve taslakta hangi alanlar olmalı?
- "Aynı uygulamayı topla" görünümü yeterli mi, yoksa başka gruplama (sunucuya göre) gerekli mi?
- Bildirim: aksiyon bekleyen yeni bir alarm geldiğinde ayrıca haber verilsin mi, yoksa yalnızca ekran mı?
