# Fiyat ve Talep Güvenliği

## Ana ilke

Rakiplerin fiyatları teknik inceleme, tarayıcı kaynak kodu veya API
taramasıyla öğrenememesi için fiyat verisi public güven sınırına hiç
girmemelidir.

## Zorunlu kontroller

1. Public cevaplarda `price`, `cost`, `margin`, `discount`,
   `quoted_amount` veya eşdeğer alan bulunmaz.
2. Public fiyat hesaplama ve public talep detay uç noktası yoktur.
3. Admin uçlarının tamamı varsayılan olarak yetkisiz erişimi reddeder.
4. Yönetici parolası düz metin olarak saklanmaz; Argon2id hash kullanılır.
5. Yönetici erişim anahtarı kısa ömürlüdür ve frontend kalıcı depolamada
   tutulmaz.
6. CORS yalnız ortam değişkenindeki kesin HTTPS adreslerine izin verir;
   joker (`*`) kullanılmaz.
7. Talep numarası veritabanı sıra numarasını açığa çıkarmaz.
8. Public talep uç noktası IP ve iletişim bilgisi bazında sınırlandırılır.
9. Kullanıcıdan HTML/SVG alınmaz; bütün alanlar uzunluk ve tip açısından
   doğrulanır.
10. E-posta alıcısı, göndereni ve başlıkları sunucu belirler. Kullanıcı
    verisi yeni alıcı veya e-posta başlığı oluşturamaz.
11. Loglara parola, JWT, SMTP parolası, telefon, e-posta veya teklif tutarı
    yazılmaz.
12. Üretimde API dokümantasyonu ve ayrıntılı hata çıktıları kapatılır.
13. Katalog metinleri yalnız düz metin olarak saklanır ve Angular tarafından
    metin bağlama ile gösterilir; yönetici girdisi HTML olarak işlenmez.
14. Public talepteki dinamik cevap anahtarları ve değerleri uzunluk/adet
    sınırına tabidir; fiyat, maliyet, marj ve benzeri ayrılmış anahtarlar
    reddedilir.
15. Katalog silme işlemi fiziksel silme değil yayından kaldırmadır. Geçmiş
    talepler katalog değişikliğinden etkilenmez.

## Rakip kaynaklı sahte talep

Otomatik fiyat verilmediği için toplu fiyat taraması engellenir; ancak bir
rakip gerçek müşteri gibi talep gönderip yöneticiyle görüşmeye çalışabilir.
Bu artık yalnız teknik değil, operasyonel bir risktir.

Yönetici paneli aşağıdaki sinyalleri göstermelidir:

- Aynı IP veya iletişim bilgisinden kısa sürede gelen talepler
- Çok sayıda farklı ölçü/model isteyen hesaplar
- Doğrulanmamış veya şüpheli iletişim bilgileri
- Mükerrer talepler

Yüksek hacimli veya şüpheli durumda telefon/e-posta doğrulaması ve CAPTCHA
devreye alınmalıdır.

## Teklif gönderimi

- Teklif hiçbir zaman public bir URL'de tahmin edilebilir kimlikle tutulmaz.
- E-posta işlemi yalnız yöneticinin açık butonuyla başlar.
- İleride PDF üretildiğinde teklif numarası, müşteri adı ve tarih ile
  kişiselleştirilir.
- Gönderim, alıcı, zaman ve yönetici bilgisiyle denetim kaydına yazılır.
