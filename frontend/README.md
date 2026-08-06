# PVC Görsel Talep Ön Yüzü

Angular 22 ile hazırlanmış bağımsız ön yüzdür. Halka açık ürün yapılandırıcı ile
yetkili talep yönetimi aynı uygulamada, ayrı rotalarda çalışır.

Ziyaretçi PVC pencere, PVC kapı, sineklik, giyotin cam, dış cephe veya balkon
kapama seçer. Her ürün için üç kısa ihtiyaç sorusu, `Bilmiyorum / uzman
belirlesin` seçeneği, oklarla hazırlanmış ölçüm rehberi ve girilen ölçüyle
güncellenen SVG önizleme sunulur. Rehber cevapları talebin ürün notuna eklenerek
yöneticiye iletilir.

Yönetici katalogdan yeni bir ürün ailesi de açabilir. Ürün taslak olarak
kaydedilir; alan ve seçenekleri tamamlanıp yayınlandığında ziyaretçi akışına
otomatik eklenir. Sonradan eklenen ürünler için ürün adıyla birlikte genel
ölçülü SVG önizleme gösterilir.

## Yerel kullanım

```bash
npm install
npm start
```

Varsayılan API adresi `http://localhost:8000` olarak
`public/config.json` içinde tanımlıdır.

## Alan adı / alt alan adı kurulumu

Uygulama derlendikten sonra oluşan statik dosyalar ana alan adında, ikinci bir
alan adında veya alt alan adında sunulabilir. API adresi yeniden derleme
gerektirmeden yayımlanan `config.json` dosyasından değiştirilir:

```json
{
  "apiUrl": "https://api.ornek.com"
}
```

Web sunucusu Angular rotaları için bulunamayan yolları `index.html` dosyasına
yönlendirmelidir. Python API tarafındaki CORS listesine ön yüzün tam origin
değeri eklenmelidir; joker origin kullanılmamalıdır. Canlı ortamda iki yüzey de
HTTPS üzerinden sunulmalıdır.

## Doğrulama

```bash
npm test -- --watch=false
npm run build
```

Yönetici erişim anahtarı yalnız bellekte tutulur; tarayıcı depolamasına
yazılmaz. Halka açık istek modeli ticari hesap alanları içermez.
