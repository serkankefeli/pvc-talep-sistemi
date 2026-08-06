# PVC Görsel Talep Sistemi

Bu proje; PVC pencere, PVC kapı, sineklik, giyotin cam, balkon kapama ve
cephe kaplama taleplerinin yönlendirmeli, ölçülü bir görsel üzerinden
alınması için hazırlanmış web uygulamasıdır.

Sistem **ziyaretçiye otomatik fiyat göstermez**. Ziyaretçi yalnızca ürün
özelliklerini, ölçülerini ve iletişim bilgilerini gönderir. Talep:

1. Yönetici panelindeki talep kuyruğuna kaydedilir.
2. Yöneticiye e-posta bildirimi gönderilir.
3. Yönetici talebi inceler, gerekirse müşteriyi arar.
4. Fiyatı yalnız yönetici belirler.
5. Teklif ancak yöneticinin açık işlemiyle müşteriye e-posta edilir.

Ürün kartları, ölçüm rehberleri, yönlendirme soruları ve renk/cam/model gibi
seçenekler yönetici kataloğundan yönetilir. Yayından kaldırılan seçenekler yeni
müşteri formlarında görünmez; geçmiş taleplerde korunur.

Müşteriden istenecek ürün sorularının etiketi, yardım metni, türü, zorunluluğu,
sırası ve seçenekleri yönetici tarafından eklenebilir, düzenlenebilir veya
yayından kaldırılabilir. Ürün adı ve açıklaması, ölçü etiketleri ve ölçüm
yönergeleri, seri/kesit görselleri, renk, cam, model ve teknik açıklamalar da aynı
katalogdan yönetilir. İletişim bilgileri, adet, güvenli ölçü sınırları ve çizim
motorunun desteklediği yerleşim türleri sistemin veri ve güvenlik sözleşmesidir;
bunlar serbest metinli katalog seçeneği değildir.

PVC doğrama ekranında standart pencere, kapı ve birleşik `pencere + kapı`
şablonları bulunur. Her bölüm sabit, tek açılım, vasistas, çift açılım veya
sürme olarak ayrı seçilebilir; dikey/yatay kayıtlar, açılım işaretleri ve kollar
ölçüye oranlı ön görünüşte gösterilir. Şablon ve açılım seçeneklerinin görünen
adları, açıklamaları, özellikleri ve örnek görselleri yönetici kataloğundan
yönetilir. Her ürünün **Profil serisi** alanındaki bir seçeneğe yapılandırılmış
profil ölçüleri eklenebilir. PVC kapı ve pencerede kasa/kenar, üst, alt ve ara
kayıt ölçüleri milimetre ölçeğiyle çizime uygulanır; aynı ölçüler ve varsa kesit
görselleri müşteri tarafından seri seçildiğinde açıklama olarak da görünür.

Balkon kapama simülasyonunda A/B/C cepheleri ayrı ayrı hesaplanır. Her cephede
montaj payı, duvar/uç profili, köşe profili, ara dikme, üst profil ve alt profil
milimetre olarak toplam ölçüden düşülür; kalan net alan eşit camlara bölünür.
Yönetici bu değerleri **Katalog > Balkon kapama > Sistem tipi** veya **Profil
serisi** seçeneklerinden değiştirebilir. Profil serisinde özel ölçü tanımlanmışsa
sistem tipindeki genel ölçünün önüne geçer. Talep gönderildiğinde kullanılan
profil ölçülerinin sunucu tarafından doğrulanmış bir kopyası talebe kaydedilir;
katalog daha sonra değişse bile eski talebin çizimi değişmez. Tarayıcıdan
değiştirilmiş veya sahte bir profil ölçüsü gönderilse bile sunucu bunu kullanmaz;
aktif yönetici kataloğundaki seri/sistem ölçüsünü yeniden çözer.

Yönetici, mevcut ürün aileleriyle sınırlı değildir. Katalogdan benzersiz bir
ürün anahtarıyla yeni ürün oluşturabilir; ürün önce taslak olarak kaydedilir.
Sorular ve seçenekler hazırlandıktan sonra yayınlanır. Yönetici tarafından
eklenen ürünlerde müşteri yine ölçü girer ve genel ölçülü önizlemeyi görür.

Yönetici **Talep Merkezi**; talep numarası, müşteri, firma, e-posta ve telefon
üzerinde arama; durum süzme; güvenli sıralama ve gerçek sayfalama sunar. Sık
kullanılan talepler yöneticiye özel favorilere alınabilir. Seçilen talebin
müşteri özeti ve ölçülü ürün çizimleri listeden ayrılmadan sağ panelde
incelenebilir; ayrıntılı değerlendirme, manuel fiyat ve açık e-posta gönderimi
ayrı korumalı detay ekranında yapılır. Liste/kart görünümü, gösterilecek
sütunlar ve son görüntülenen kayıtlar yönetici çalışma alanı tercihleridir.

## Teknoloji

- Frontend: Angular + TypeScript
- Backend: Python + FastAPI
- Geliştirme veritabanı: SQLite
- Üretim veritabanı: PostgreSQL

## Dizinler

- `frontend/`: ziyaretçi yapılandırıcısı ve yönetici arayüzü
- `backend/`: public talep API'si, yönetici API'si ve e-posta servisi
- `docs/`: ürün, güvenlik ve yayınlama kararları

## Temel güvenlik sınırı

Public uygulama ve public API hiçbir fiyat, maliyet, marj, iskonto veya
malzeme alış bilgisi taşımaz. Bunlar yalnızca kimliği doğrulanmış yönetici
uçlarında bulunur. Tarayıcıdan gelen toplamlar veya çizim kodları güvenilir
kabul edilmez.

Kurulum ve çalıştırma bilgileri backend ve frontend klasörlerinin kendi
README dosyalarında yer alır.

## Önerilen çalışma yöntemi: Docker

Docker, bu proje için en kolay ve kalıcı yerel çalışma yöntemidir. API ile web
arayüzü ayrı konteynerlerde çalışır. PowerShell veya Codex kapatılsa bile
konteynerler Docker Desktop tarafından çalıştırılmaya devam eder.

Bu bilgisayarda Docker Desktop için Windows başlangıç kaydı oluşturulmuştur.
Projeyi başka bir bilgisayara kurarsanız Docker Desktop ayarlarında **Windows
oturumu açıldığında Docker Desktop'ı başlat** seçeneğini etkinleştirin.
Konteynerlerde `restart: unless-stopped` politikası bulunduğu için Docker
yeniden başladığında sistem de otomatik olarak geri gelir.

### Docker ile başlatma

Docker Desktop açıkken PowerShell'de:

```powershell
cd C:\Users\kefel\PycharmProjects\pvc
powershell -ExecutionPolicy Bypass -File .\.runtime\start_docker.ps1
```

Betik ilk kullanımda mevcut SQLite veritabanını ve yüklenen logoları silmeden
`backend\data` kalıcı veri klasörüne kopyalar. Ardından iki Docker imajını
oluşturur ve servisleri arka planda başlatır.

Doğrudan Docker Compose komutu da kullanılabilir:

```powershell
docker compose up -d --build
```

Adresler:

```text
Müşteri ekranı:  http://127.0.0.1:4200/
Yönetici girişi: http://127.0.0.1:4200/admin/giris
API kontrolü:    http://127.0.0.1:8000/api/v1/health
```

### Durum ve günlükler

```powershell
powershell -ExecutionPolicy Bypass -File .\.runtime\status_docker.ps1
docker compose logs --tail=100 api web
```

Her iki servisin durumunda `healthy` görülmelidir.

### Docker servislerini durdurma

```powershell
powershell -ExecutionPolicy Bypass -File .\.runtime\stop_docker.ps1
```

Yeniden başlatmak için `start_docker.ps1` betiğini tekrar çalıştırın.

### Kod değiştikten sonra güncelleme

```powershell
docker compose up -d --build
```

Bu komut değişen imajı yeniden oluşturur ve gerekli konteyneri yeniler.

### Kalıcı veriler ve yedekleme

Veritabanı ve yüklenen logolar `backend\data` klasöründedir. `docker compose
stop` verileri silmez. Bu klasörü silmeyin ve paylaşmayın; müşteri bilgileri ve
yönetici tarafından girilen katalog içeriği burada bulunur.

Veritabanını yedeklemek için önce sistemi durdurup dosyayı kopyalayın:

```powershell
docker compose stop
New-Item -ItemType Directory -Force .\backups
Copy-Item .\backend\data\pvc_requests.db .\backups\pvc_requests-backup.db
docker compose start
```

`backend\.env` ve `backend\.env.docker` gizli ayarlar içerir; sürüm kontrolüne
eklenmez ve üçüncü kişilerle paylaşılmaz.

## Docker kullanmadan çalışma (yedek yöntem)

Sistem iki ayrı servisten oluşur. API ve web arayüzü için iki PowerShell
penceresi açılmalı, aşağıdaki pencereler açık bırakılmalıdır.

### 1. Frontend üretim paketini hazırlama

Bu işlem ilk çalıştırmada ve frontend kodu değiştikten sonra bir kez yapılır:

```powershell
cd C:\Users\kefel\PycharmProjects\pvc\frontend
npm.cmd run build
```

Derleme tamamlandıktan sonra aşağıdaki iki servisi ayrı PowerShell
pencerelerinde başlatın.

### 2. API servisini başlatma

Birinci PowerShell penceresi:

```powershell
cd C:\Users\kefel\PycharmProjects\pvc
powershell -ExecutionPolicy Bypass -File .\.runtime\start_api.ps1
```

API adresi:

```text
http://127.0.0.1:8000
```

### 3. Web arayüzünü başlatma

İkinci PowerShell penceresi:

```powershell
cd C:\Users\kefel\PycharmProjects\pvc
powershell -ExecutionPolicy Bypass -File .\.runtime\start_frontend.ps1
```

Müşteri ekranı:

```text
http://127.0.0.1:4200/
```

Yönetici girişi:

```text
http://127.0.0.1:4200/admin/giris
```

### 4. Çalıştığını kontrol etme

Üçüncü bir PowerShell penceresinde:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Invoke-WebRequest http://127.0.0.1:4200/ -UseBasicParsing
```

İlk komutta `status: ok`, ikinci komutta `StatusCode: 200` görülmelidir.

Çalışan portları kontrol etmek için:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 4200, 8000 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

### 5. Servisleri durdurma

API ve web arayüzünün çalıştığı PowerShell pencerelerinde ayrı ayrı
`Ctrl + C` tuşlarına basın.

Bilgisayar veya terminal kapatıldığında bu yerel servisler de kapanır.
Sistemi tekrar kullanmak için 2. ve 3. adımları yeniden çalıştırın.

### Sorun giderme

Son API kayıtları:

```powershell
Get-Content C:\Users\kefel\PycharmProjects\pvc\.runtime\api.run.log -Tail 50
```

Son frontend kayıtları:

```powershell
Get-Content C:\Users\kefel\PycharmProjects\pvc\.runtime\frontend.run.log -Tail 50
```

Frontend yeniden derlendikten sonra tarayıcı eski paketleri arıyorsa sayfayı
`Ctrl + F5` ile yenileyin.
