# dograma.estyazilim.com kurulumu

Hedef sunucu: `95.217.13.5`

Uygulama `/opt/dograma` altinda ve `dograma` Docker proje adiyla calisir.
Veritabani, varsayilan Docker agi ve volume'ler diger projelerden ayridir.
Yalnizca `web` servisi merkezi `digital-nginx` container'inin bulundugu
`root_casecrafters-net` agina `dograma-web` takma adiyla baglanir.

Kullanilan Compose dosyalari:

```bash
docker compose \
  -f compose.yaml \
  -f compose.prod.yaml \
  -f compose.dograma.yaml \
  up -d --build --wait --wait-timeout 300
```

Ortam dosyasinda yayin adresi:

```dotenv
PVC_PUBLIC_URL=https://dograma.estyazilim.com
```

Merkezi nginx vhost kaynagi:

```text
deploy/nginx/dograma.estyazilim.com-bootstrap.conf
deploy/nginx/dograma.estyazilim.com.conf
```

TLS yenileme zamanlayicisi:

```bash
install -m 644 deploy/systemd/dograma-certbot-renew.service /etc/systemd/system/
install -m 644 deploy/systemd/dograma-certbot-renew.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dograma-certbot-renew.timer
```

Saglik kontrolleri:

```bash
curl -sf http://127.0.0.1:4310/health
curl -sf http://127.0.0.1:4310/api/v1/health
curl -sf https://dograma.estyazilim.com/api/v1/health
```

## 9 Ekim 2026 yayını

SaaS/abonelik hazırlığı, sözleşme düzenleme ve iyzico Link ödeme hazırlığı yayınlandı.
Sürüm paketi: `20261009T084153Z` (UTC). SHA-256:
`d8fbb28ebe4612fcccd70717465bcca50c63dece4e85d1f2de791c5ff8b48566`.

Kaynak kod çalışma ağacından paketlenerek aktarılmıştır; bu yayın Git push veya
yeni Git commit'i oluşturmaz. Yerel `.env`, veri dosyaları ve `.runtime/start_api.ps1`
yayın paketine dahil edilmemiştir. Canlı ortam dosyalarının checksum'ları değişmedi.

Yedekler sunucuda, yalnızca root erişimli şu dizindedir:
`/opt/dograma/backups/20261009T084153Z/`. PostgreSQL custom dump, kaynak/yapılandırma
ve yüklenen dosyalar yedeklendi; DB dump dizini `pg_restore --list` ile doğrulandı.
Eski imajlar `dograma-api:rollback-20261009T084153Z` ve
`dograma-web:rollback-20261009T084153Z` etiketleriyle tutuluyor.

Yalnızca dograma API ve web yeniden oluşturuldu; DB ve diğer uygulamalar yeniden
başlatılmadı. HTTPS sağlık, korumalı yönetim uçları, yeni SPA yolları ve resmî
iyzico SVG erişimleri kontrol edildi. Yayın öncesi/sonrası: 1 yönetici, 0 talep,
10 ürün, 127 alan, 348 seçenek; kayıt sayıları aynı kaldı.

Yönetim yolları:

- `/admin/sozlesmeler`: satıcı, sözleşmeler ve ödeme ayarları (superuser).
- `/admin/odeme`: abonelik ödeme bağlantısı.
- `/admin/firma`: abonelik ve kullanım bilgileri.

Üç sözleşme taslak, iyzico Link ödemesi kapalıdır. Satıcı/hizmet bilgileri,
gerçek ödeme linki ve hukuki kontrol tamamlanmadan ödeme açılmamalıdır. SMTP
yapılandırılmamış; hatırlatma worker'ı ve çok firmalı SaaS modu bu yayında
etkinleştirilmemiştir. Mevcut hesap legacy kalır, erişimi kesilmez.

İmaj geri dönüşü için (gerektiğinde):

```bash
cd /opt/dograma
docker compose -p dograma -f compose.yaml -f compose.prod.yaml \
  -f compose.dograma.yaml -f backups/rollback-20261009T084153Z.yaml \
  up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 api web
```

Bu komut yalnızca önceki imajlara döner; DB yedeğini geri yüklemez ve sonradan
oluşturulan kayıtları silmez. Şema değişiklikleri bu yayında yalnızca yeni
tablo/nullable sütun ekler. DB restorasyonu gerektiğinde ayrıca ve veri kaybı
riski değerlendirilerek yapılmalıdır; otomatik restorasyon yoktur.

## 10 Ekim 2026: canlı oturum / panel genişliği düzeltmesi

Canlı sürümde token yalnızca bellekte tutuluyordu; sayfa yenilemesi oturumu
siliyordu. Yereldeki düzeltme canlıya ulaşmamıştı. Canlı kaynak üzerine yalnızca
7 frontend dosyası uygulandı: auth service, guard, interceptor, uygulama açılışında
oturum doğrulaması, giriş açıklaması ve shell/katalog genişlik stilleri.
Bekleyen tanıtım/satın alma özellikleri bu yayına dahil edilmedi.

Yeni canlı bundle: `main-6E7NB56K.js`; imaj: `dograma-web:session-20261010`
(aynı imaj `dograma-web:latest` olarak etiketlendi). Derleme başarılı; aynı auth
service/interceptor için 9 yerel test geçti. HTTPS üzerinden yeni session anahtarı,
sunucu doğrulama kodu ve giriş ekranındaki yeni açıklama kontrol edildi.
Canlı hesaba giriş + yenileme uçtan uca testi kullanıcı girişi gerektirir;
giriş yapmadan bu testin geçtiği iddia edilmemelidir.

Yalnızca web container yeniden oluşturuldu. API/DB, canlı ortam dosyaları,
hesaplar ve diğer uygulamalar değiştirilmedi. Üç servis sağlıklı ve HTTPS API
sağlık yanıtı `ok`. Önceki imaj `dograma-web:rollback-session-20261010`, kaynak
yedeği `/opt/dograma/backups/session-20261010/frontend-hotfix-sources.tar.gz`.
İlk kullanımda yeni sayfayı yükleyip tekrar giriş yapılmalıdır; eski bellek
oturumu sonradan kurtarılamaz. Geçerli token sekme bazlı sessionStorage içinde
orijinal süresiyle saklanır; yenileme süresini uzatmaz, parola saklanmaz ve
her açılışta `/api/v1/admin/users/me` ile kimlik sunucudan doğrulanır.
