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

Yönetim panelindeki **Kullanıcılar** modülü her çalışan için ayrı hesap açar.
Sistem yöneticileri hesapları etkinleştirebilir, devre dışı bırakabilir, rol
verebilir ve başka bir kullanıcının parolasını sıfırlayabilir. Her kullanıcı
mevcut parolasını doğrulayarak kendi parolasını değiştirebilir. Parola veya
hesap durumu değiştiğinde eski oturumlar sunucu tarafında geçersiz kılınır.
Sistem yöneticisi ayrıca her kullanıcı için ekran görüntüleme, düzenleme,
e-posta gönderme ve abonelik işlemi yetkilerini ayrı ayrı tanımlar. Yetkisiz
menüler arayüzde gösterilmez; doğrudan URL ve API erişimi sunucu tarafından da
reddedilir. Yeni çalışan hesapları açıkça yetki verilene kadar yalnız kendi
hesap ve parola ekranına erişir.

Yönetici oturumu aynı sekmedeki sayfa yenilemelerinde korunur. Kısa ömürlü erişim
anahtarı yalnız `sessionStorage` içinde, API adresine bağlı olarak tutulur; parola
ve kullanıcı rolü depolanmaz. Yenilemede `/admin/users/me` ile sunucu doğrulaması
yapılır. Süre dolunca veya çıkış yapınca kayıt temizlenir; yenileme oturum süresini
uzatmaz. Varsayılan süre `JWT_EXPIRE_MINUTES=15` dakikadır. Tarayıcı sekme kurtarma
özelliği geçerli sekme kaydını geri getirebilir; ortak cihazda mutlaka güvenli çıkış
yapın. `sessionStorage` JavaScript tarafından okunabilir: HTTPS, CSP ve XSS
korumaları önemlidir; bu özellik HttpOnly çerezli uzun süreli oturum değildir.

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

## Çok firmalı SaaS hazırlığı

Firma başına ayrı veritabanı/logo dizini, alan adı üzerinden firma seçimi,
firma bazlı oturumlar ve manuel paket/deneme/kota yönetimi hazırlanmıştır.
Yönetimde **Firma / Paket** ekranı kullanım bilgilerini gösterir.
Varsayılan kurulum tek firmalı kalır; otomatik abonelik aktivasyonu henüz yoktur.
Etkinleştirme, yeni firma açma ve geri dönüş adımları: [SaaS rehberi](docs/SAAS.md).

Ücretli firma kayıtları bir yıllık abonelikle açılır. Süre bitince üye giriş
yapabilir ve abonelik ekranını görebilir, ancak işlemleri kullanamaz; veriler
silinmez. Son 30 günde 30/14/7/1 günlük hatırlatmalar için opsiyonel
`compose.subscriptions.yaml` servisi, firma iletişim adresi ve SMTP yapılandırması
gereklidir. Yenileme ve servis kurulumu SaaS rehberinde açıklanmıştır.

## Sözleşmeler ve iyzico Link

Yönetim → **Sözleşmeler / Ödeme ayarları** ekranında satıcı bilgileri, gizlilik/KVKK,
iptal-iade ve mesafeli satış metinleri düzenlenir. Başlangıç metinleri hukuki inceleme
bekleyen taslaklardır; kendiliğinden yayımlanmaz. Satıcı unvanı/adresi, vergi/MERSİS
bilgileri, destek e-postası/telefonu tamamlanmadan metinler yayımlanamaz.

Üç metin yayımlanıp incelendikten, hizmet kapsamı/toplam bedel ve gerçek
`https://iyzi.link/...` adresi tanımlandıktan sonra ödeme açılır. **Abonelik ödemesi**
ekranı açık onay alıp iyzico'ya yönlendirir; kart bilgisi bu uygulamada alınmaz.
Aboneliği biten kullanıcı bu ekrana ve sözleşmelere erişebilir. Bağlantıya tıklamak
ödeme kanıtı değildir; abonelik operatörün ödeme doğrulaması ve manuel yenilemesiyle
açılır. Fiyatlar herkese açık doğrama talep ekranına eklenmemiştir.

Ödeme linkindeki bedel/ürün ve uygulamadaki teklif/sözleşme bilgilerinin aynı olması
operatörün sorumluluğundadır. Gerçek ödeme, faturalar ve hukuki metinler canlıya
geçmeden önce ayrıca kontrol edilmelidir. Ayrıntılar: [SaaS rehberi](docs/SAAS.md).

## Yönetilebilir tanıtım sayfası

Ana adres `/` tanıtım sayfasıdır; müşteri çizim akışı `/talep-olustur` adresinden
devam eder. Yönetim → **Tanıtım sayfası** (`/admin/tanitim`) ekranı sistem
yöneticisi yetkisiyle açılır.

Panelden açılış başlığı/açıklaması, kapak görseli, vurgu etiketleri, buton metinleri
ve hedefleri, özellik kartları, çalışma adımları, model görselleri, sık sorulan
sorular, iletişim bilgileri ve sayfa başlığı/açıklaması düzenlenebilir. Bölümler
gizlenebilir, kaldırılabilir, tekrar eklenebilir ve sıralanabilir; kartlar ve
sorular eklenip kaldırılabilir. Bölümü kaldırmak o bölümün kartlarını silmez.
**Kaydetmeden ön izle** yayımlanmamış değişiklikleri gösterir. Değişiklikler
**Değişiklikleri kaydet** ile uygulanır; yayın kutusu kaldırılıp kaydedildiğinde
tanıtım içeriği ziyaretçiye gösterilmez, talep ekranı bağlantısı korunur.

İçerik her firmanın kendi veritabanında tutulur; uygulama yeniden başladığında
mevcut içerik başlangıç metinleriyle değiştirilmez. Eşzamanlı düzenlemeler için
revizyon kontrolü vardır. Başlangıç metinleri örnektir; gerçek iletişim ve
görseller panelden girilmelidir. Tanıtım sayfasında otomatik doğrama fiyatı yoktur.

Görseller en fazla 2 MB PNG/JPEG/WebP olarak yüklenebilir veya HTTPS adresiyle
tanımlanabilir. Yüklemeler firmanın logo dizini altındaki `landing/` dizinine
kaydedilir; veritabanı ve yükleme dizini birlikte yedeklenmelidir. Yüklenen
tanıtım görselleri URL'yi bilenlere açıktır (sayfa yayından kaldırıldığında bile);
gizli veya kişisel belge yüklemeyin. Kartı/görsel adresini kaldırmak dosyayı
fiziksel olarak silmez. Dış görsel sağlayıcının ziyaretçi IP adresini alabileceği
unutulmamalıdır; tercihen uygulamaya yüklenen görselleri kullanın.

Ana sayfada **Satın al** butonu `/satin-al` adresine gider. Buton görünürlüğü ve
metni tanıtım panelinden; yıllık yazılım bedeli **Sözleşmeler / Ödeme ayarları**
ekranından yönetilir. **Yıllık fiyatı ana sayfada yayımla** kutusu açılmadan
mevcut özel fiyatlar herkese gösterilmez. Yıllık bedel girilip yayın kutusu
açılarak kaydedilince ana sayfa, satın alma ekranı ve üye yenileme ekranı aynı
bedeli kullanır. iyzico Link üzerindeki bedel ayrıca aynı değere getirilmelidir.
Fiyat gösterimi ile online ödeme ayrı ayarlardır; sözleşmeler ve ödeme linki
tamamlanmadan tahsilat akışı açılmaz. Bu yalnızca yazılım abonelik fiyatıdır;
doğrama taleplerinin teklif fiyatları gizli kalır.

Yeni alıcı hesabı olmadan firma/ad/e-posta ve kullanım tercihi (siteye entegre
veya bağımsız) ile başvurabilir. İşaretlenmemiş koşul kutularının açık kabulü
sonrasında başvuru referansı ve kabul edilen bedel/metinlerin sürümü kaydedilir.
Tekrarlı aynı başvuru bir kez kaydedilir; fiyat/metin değişirse yeniden onay
istenir. Başvurular aynı ödeme ayarları ekranında sistem yöneticisine gösterilir.
Bu kayıtlar ödeme kanıtı değildir: operatör iyzico'da ödemeyi doğruladıktan sonra
firma alanını açar ve SaaS yıllık aboneliğini başlatır. Otomatik hesap açma,
tahsilat, ödeme eşleştirme veya abonelik aktivasyonu yoktur.

**Firma sayfası ve kullanım biçimleri** bölümü panelden düzenlenebilir. Ayrı
sayfa firma bazındadır; aynı firmadaki kullanıcılar ortak marka/sayfayı paylaşır.
Alan adı/alt alan adı ve entegrasyon kurulumu operatörce yapılır. Mevcut siteye
bağlantı verme mümkündür; farklı alan adından iframe gömme varsayılan CSP ile
kapalıdır ve yalnızca güvenilen firma adresleri için ayrıca yapılandırılmalıdır.
Satın alma bir kullanıcıya kendiliğinden alan adı tahsis etmez.

HTML/JavaScript çalıştıran serbest sayfa editörü yerine güvenli metin ve
sınırlandırılmış bölüm modeli kullanılır. Buton hedefleri talep ekranı, yönetici
girişi, satın alma, özellikler veya iletişim bölümüyle sınırlıdır. SPA başlık/açıklama
alanları düzenlenebilir; arama motoru indekslenmesi için SSR/prerender bu aşamada
eklenmemiştir.
