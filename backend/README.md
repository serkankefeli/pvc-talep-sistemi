# PVC görsel teklif talep API'si

Bu servis, Angular/TypeScript görsel yapılandırıcısından gelen PVC pencere,
PVC kapı, sineklik, dış cephe kaplama, giyotin cam ve balkon kapama taleplerini
kaydeder. Ziyaretçiye otomatik fiyat vermez. Fiyat yalnızca kimlik doğrulamalı
yönetim alanında yönetici tarafından elle girilir ve müşteriye ancak
yöneticinin açık bir e-posta gönderme işlemiyle iletilir.

## Güvenlik sınırı

- `POST /api/v1/requests` `202 Accepted` döndürür; yanıtta yalnız rastgele
  `request_number`, `status` ve genel bir `message` vardır.
- Public fiyat sorgulama veya talep detayı uç noktası yoktur. Artan veritabanı
  kimliği hiçbir public yanıtta verilmez.
- Public giriş modelleri fiyat, maliyet, marj, BOM, HTML veya SVG kabul etmez;
  bilinmeyen alanlar `422` ile reddedilir.
- Yönetici API'si kısa ömürlü Bearer JWT ister. Angular erişim belirtecini
  yalnız çalışan uygulamanın belleğinde tutmalıdır; `localStorage`,
  `sessionStorage`, URL veya kalıcı cookie kullanılmamalıdır.
- CORS yalnız `CORS_ORIGINS` içindeki tam origin değerlerine izin verir ve `*`
  kabul edilmez. Ana site ile ayrı alan adı/subdomain birlikte kullanılacaksa
  örnek değer:

  ```env
  CORS_ORIGINS=https://www.ornek.com,https://teklif.ornek.com
  ```

- Yeni talep SMTP ile yöneticiye bildirilir. Bu otomatik bildirim müşteri adı,
  telefon, e-posta ve serbest metin taşımaz; yalnız rastgele referans, ürün
  adedi ve oturum açılması gereken panel bağlantısını içerir. Gönderim bir kez
  talep edilir ve durum veritabanında tutulur.
- SMTP yapılandırılmamışsa otomatik bildirim güvenli biçimde atlanır ve loga
  yalnız rastgele referans yazılır. Açık müşteri e-postası işlemi ise `503`
  döndürür; gönderilmiş gibi davranmaz.
- İstek gövdesi ve alan uzunlukları sınırlıdır. Public talep ve yönetici giriş
  uç noktalarında süreç içi temel hız sınırı vardır.
- Production modunda debug ve API dokümantasyonu kapalıdır.

## Kurulum

Python 3.11 veya üzeriyle:

```powershell
cd C:\Users\kefel\PycharmProjects\pvc\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Argon2 yönetici parolası üretmek için (parola ekranda görünmez):

```powershell
python -c "from getpass import getpass; from pwdlib import PasswordHash; print(PasswordHash.recommended().hash(getpass('Admin password: ')))"
```

Çıktıyı `.env` içindeki `ADMIN_PASSWORD_HASH` değerine yazın. En az 32 baytlık
rastgele `JWT_SECRET` üretin. `.env` dosyasını sürüm kontrolüne eklemeyin.

Geliştirme sunucusu:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Development dokümantasyonu `http://127.0.0.1:8000/docs` adresindedir.

## API özeti

| Yöntem | Yol | Erişim | Amaç |
|---|---|---|---|
| `GET` | `/api/v1/catalog` | Public | Yalnız aktif ürün, alan ve seçenekleri döndürür |
| `POST` | `/api/v1/requests` | Public | Görsel konfigürasyon talebi oluşturur |
| `POST` | `/api/v1/admin/login` | Public + hız sınırlı | Kısa ömürlü yönetici JWT'si verir |
| `GET` | `/api/v1/admin/requests` | Bearer JWT | Talepleri listeler |
| `GET` | `/api/v1/admin/requests/{id}` | Bearer JWT | Talep detayını gösterir |
| `PATCH` | `/api/v1/admin/requests/{id}` | Bearer JWT | Durum, iç not ve manuel teklif tutarını günceller |
| `POST` | `/api/v1/admin/requests/{id}/send-email` | Bearer JWT | Müşteriye açık yönetici eylemiyle e-posta yollar |
| `GET/POST` | `/api/v1/admin/catalog/products` | Bearer JWT | Katalog ürünlerini listeler veya ekler |
| `PATCH` | `/api/v1/admin/catalog/products/{key}` | Bearer JWT | Ürünü veya yayın durumunu günceller |
| `GET/POST` | `/api/v1/admin/catalog/products/{key}/fields` | Bearer JWT | Ürün alanlarını listeler veya ekler |
| `PATCH` | `/api/v1/admin/catalog/fields/{id}` | Bearer JWT | Alanı veya yayın durumunu günceller |
| `GET/POST` | `/api/v1/admin/catalog/fields/{id}/options` | Bearer JWT | Seçenekleri listeler veya ekler |
| `PATCH` | `/api/v1/admin/catalog/options/{id}` | Bearer JWT | Seçeneği veya yayın durumunu günceller |

Katalog başlangıçta altı ürün, her ürün için üç yönlendirme sorusu, ürünün
teknik seçimleri ve renklerle idempotent olarak doldurulur. Yönetici değişikliği
bir sonraki public katalog yanıtına doğrudan yansır. Geçmiş talepleri bozmamak
için katalog satırları fiziksel olarak silinmez; kaldırmak için `PATCH` ile
`{"active": false}` gönderilir. `DELETE` yolları da yalnız aynı soft-deactivate
işlemini yapar.

Yönetici ayrıca güvenli bir slug (`pergola`, `cam_tavan` gibi) ile yeni ürün
ailesi oluşturabilir. Yönetim arayüzü bu ürünü taslak (`active: false`) açar;
alanlar ve seçim seçenekleri hazırlandıktan sonra ürün yayınlanır. Bu özel
ürünlerden gelen public talep yalnız temel ölçü/adet/renk/not alanlarını ve
`catalog_answers` içindeki katalog cevaplarını kabul eder. Sabit ürün
anahtarları ise kendi sıkı ürüne özel şemalarını kullanmaya devam eder.

Yeni yönetici alanlarına verilen cevaplar ürün içindeki `catalog_answers`
nesnesinde yalnız alan `key` ve `string|boolean` değer olarak gönderilir.
Sunucu yeni talep sırasında ürünün, alanın ve seçeneğin halen aktif olduğunu
doğrular. Bilinmeyen, pasif, iç içe nesne/dizi veya fiyat/maliyet anlamlı
anahtarlar reddedilir. Bu doğrulama geçmiş talepler okunurken tekrar
çalıştırılmaz.

JWT oturum açma isteği JSON'dur:

```json
{"username": "admin", "password": "secret"}
```

Public talep örneği:

```json
{
  "contact": {
    "full_name": "Örnek Müşteri",
    "email": "musteri@example.com",
    "phone": "+90 555 000 00 00",
    "preferred_contact": "email",
    "city": "İstanbul",
    "district": "Kadıköy"
  },
  "items": [
    {
      "product_type": "pvc_window",
      "width_mm": 1400,
      "height_mm": 1300,
      "quantity": 2,
      "color": "white",
      "layout": "double_sash",
      "opening_direction": "inward",
      "glazing": "double_glazing",
      "divisions": []
    }
  ],
  "project_note": "Montaj dahil bilgi rica ederim.",
  "privacy_consent": true
}
```

## Production notları

- Servisi yalnız HTTPS arkasında çalıştırın. Reverse proxy istek boyutu ve hız
  sınırı da uygulamalıdır.
- Tek süreçli limiter MVP içindir. Birden fazla worker/instance kullanımında
  Redis veya API gateway tabanlı ortak limiter kullanın.
- PostgreSQL için `postgresql+psycopg://...` bağlantısı desteklenir. MVP
  başlangıçta tabloları oluşturur; production şema değişikliklerinden önce
  Alembic migration akışı eklenmelidir.
- SMTP hesabına yalnız gönderim yetkisi verin. Yönetim paneli URL'si public
  müşteri ekranından farklı olabilir fakat HTTPS olmalıdır.
- Uvicorn erişim loglarını ve reverse proxy loglarını gövde/header yazmayacak
  biçimde yapılandırın. JWT ve müşteri iletişim bilgilerini loglamayın.
