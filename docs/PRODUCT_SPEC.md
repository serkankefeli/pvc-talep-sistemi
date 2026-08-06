# Ürün Tanımı

## Amaç

Web sitesi ziyaretçisinin PVC pencere, PVC kapı, sineklik, giyotin cam,
balkon kapama veya cephe kaplama ürününü ölçüleriyle görsel olarak tarif
etmesini ve firmaya incelenebilir bir talep olarak göndermesini sağlamak.

Bu sürümde otomatik fiyat hesaplanmaz ve ziyaretçiye fiyat gösterilmez.

## Roller

### Ziyaretçi

- Ürün ailesini seçer.
- Teknik terim bilmesi beklenmeden kullanım amacını ve uygulama yerini
  açıklayan kısa soruları yanıtlar.
- Ürüne özel örnek çizimde genişlik ve yüksekliğin nereden nereye alınacağını
  görür.
- Hazır model/şablon seçer.
- Genişlik ve yüksekliği milimetre olarak girer.
- Ürüne göre açılım, renk, cam veya kaplama seçeneklerini seçer.
- Oluşan ölçülü görseli görür.
- Ad, telefon, e-posta ve açıklamasını girerek talep gönderir.
- Yalnızca rastgele oluşturulmuş talep numarasını alır.

Ziyaretçi geçmiş talepleri, başka talepleri, fiyatları veya admin
durumlarını sorgulayamaz.

## Yönlendirmeli ölçü akışı

Ölçü alanı boş bir teknik form olarak sunulmaz. Akış sırası:

1. Müşteri ne yaptıracağını sade kartlardan seçer.
2. Sistem ürünün kullanım şekli ve montaj alanıyla ilgili 2–4 kısa soru sorar.
3. Genişlik ve yüksekliğin hangi iki nokta arasında alınacağını örnek SVG
   üzerinde oklar ve milimetre etiketiyle gösterir.
4. Müşteri yaklaşık ölçüyü girer ve kendi ölçüsüyle güncellenen önizlemeyi
   görür.
5. Sistem bunun imalat ölçüsü değil, uzman incelemesine gidecek ön talep
   olduğunu açıkça belirtir.

Rehber çizimleri uygulamanın tipli durumundan üretilir. Ziyaretçiden HTML veya
SVG kodu kabul edilmez.

### Yönetici

- Güvenli giriş yapar.
- Yeni ve işleme alınmış talepleri listeler.
- Talep ayrıntısını ve müşteri konfigürasyonunu görür.
- Katalog ekranından ürün kartlarını, ölçüm rehberini, form sorularını ve
  bunların seçeneklerini yönetir.
- Benzersiz, küçük harfli bir anahtarla yeni bir ürün ailesi açar. Yeni ürün
  taslak başlar; alanları ve seçenekleri hazırlandıktan sonra yayınlanır.
- Renk, cam, model, açılım, sineklik türü ve benzeri seçenekleri ekleyebilir,
  sıralayabilir, düzenleyebilir veya public ekrandan kaldırabilir.
- İç not, durum ve yalnızca admin tarafında görülen teklif tutarı ekler.
- Müşteriyi aradığını işaretleyebilir.
- Hazırlanmış teklifi açık onay işlemiyle müşteriye e-posta edebilir.

## Yönetilebilir katalog

Müşteri formundaki ürün ve seçim içeriğinin kaynağı frontend kodu değil,
veritabanındaki katalogdur. Public katalog yalnız yayındaki kayıtları döndürür.

- Ürün: ad, açıklama, sıralama ve ölçüm rehberi metinleri
- Alan: anahtar, başlık, yardım metni, tip, zorunluluk ve sıralama
- Seçenek: güvenli değer, görünen etiket, sıralama ve yayın durumu

Bir seçenek yayından kaldırıldığında fiziksel olarak silinmez. Böylece daha
önce o seçeneği kullanmış talepler anlaşılır ve yeniden görüntülenebilir.
Yönetici tarafından girilen bütün metinler düz metindir; HTML veya SVG kabul
edilmez.

Yeni ürün anahtarı `pergola` veya `cam_tavan` gibi en az iki karakterli,
küçük ASCII harf/rakam/alt çizgi biçimindedir ve sonradan değiştirilmez.
Yönetici tarafından açılan ürünler, genişlik-yükseklik ve adet temel alanları
ile katalogdaki dinamik soruları kullanır. İlk altı ürün ailesinde ürüne özel
çizim kuralları korunur; sonradan eklenen ürünlerde güvenli genel ölçülü
önizleme kullanılır.

## İlk ürün aileleri

### PVC pencere

- Sabit, tek kanat, çift kanat ve bölmeli başlangıç şablonları
- En, boy, renk, cam ve açılım seçimi
- Ölçü ve açılım yönü gösteren SVG önizleme

### PVC kapı

- Tek kanat, çift kanat ve camlı/panelli başlangıç şablonları
- En, boy, yön, eşik ve renk seçenekleri

### Sineklik

- Sabit, menteşeli, sürme ve plise başlangıç tipleri
- En, boy, profil rengi ve tül tipi

### Giyotin cam

- Manuel veya motorlu sistem seçimi
- Panel adedi, cam türü ve alt sabit panel seçimi
- Açıklığın içten içe genişliği ile alt–üst sınır arasındaki yüksekliği
  gösteren ölçüm rehberi

### Balkon kapama

- Sürme, katlanır, giyotin veya PVC doğrama seçimi
- Düz, L veya U biçimli alan seçimi
- Parapet ve çatı ihtiyacı
- Ana cephenin genişliği ve uygulama yüksekliğini gösteren rehber; L/U
  yüzeylerinin ayrıca not edilmesi uyarısı

### Cephe kaplama

- İlk sürümde teknik imalat hesabı değil, görsel talep toplama
- Cephe eni, yüksekliği, kaplama tipi, panel yönü ve açıklama
- Teknik keşif gerektirdiği açıkça belirtilir

## Talep durumları

- `new`: Yeni talep
- `reviewing`: İnceleniyor
- `contacted`: Müşteriyle iletişim kuruldu
- `quoted`: Teklif hazırlandı/gönderildi
- `won`: Onaylandı
- `lost`: Kaybedildi
- `cancelled`: İptal edildi veya mükerrer

## Kapsam dışı

- Public otomatik fiyat
- Public fiyat hesaplama API'si
- Public talep sorgulama
- Üretim/CNC emri
- Serbest CAD çizimi
- Cephe statik hesabı
- Müşterinin kendi çizdiği HTML veya SVG'nin sisteme yüklenmesi
