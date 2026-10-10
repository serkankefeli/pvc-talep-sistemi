# Çok firmalı SaaS hazırlığı

Bu aşama ödeme alan, kendiliğinden firma açan tamamlanmış bir abonelik ürünü
değildir. Firma izolasyonu, oturum ayrımı, manuel paket/deneme yönetimi ve kullanım
kotaları hazırlanmıştır. Varsayılan kurulum hâlâ tek firmalıdır (`SAAS_ENABLED=false`).
Canlı ortamda bu bayrak, aşağıdaki hazırlıklar tamamlanmadan açılmamalıdır.

## Mimari

- Her firma için ayrı PostgreSQL veritabanı ve ayrı logo dizini vardır.
  Talepler, fiyatlar, kullanıcılar, katalog, favoriler, revizyonlar ve marka bilgileri
  o firmanın veritabanında kalır. Mevcut katalog anahtarları değişmez.
- Angular aynı kodla çalışır. Üretimde `config.json` içindeki `apiUrl` boş olmalıdır;
  böylece `/api/` istekleri müşterinin bulunduğu alan adına gider.
- Firma, sadece operatörün tanımladığı tam `Host` değeriyle seçilir. İstek gövdesi,
  `X-Tenant-Id` ve `X-Forwarded-Host` firmayı değiştiremez. Bilinmeyen alan adı 404 döner.
  Proxy gelen alan adını korumalıdır; internete açık API portu kullanılmaz.
- Her firmanın JWT imza anahtarı ana sunucu sırrından ayrı türetilir. JWT issuer ve
  `tenant` alanı da kontrol edilir. Bir firmanın token'ı başka firmada geçmez.
  Registry'deki `auth_id` kayıt anında oluşturulur ve değiştirilmez. Aynı firma
  kodunun yeni kurulumda yeniden kullanılması eski oturumları geçerli kılmaz.
- CORS izinleri firma alan adına özeldir. SMTP ayarları firmaya aittir; yeni firmaya
  mevcut firmanın alıcı adresleri veya parolaları kopyalanmaz.
- Registry `/data/tenants.json` operatöre aittir. DB bağlantı parolaları, ilk kullanıcı
  hash'i ve SMTP sırları içerir. Git'e, web köküne, destek mesajlarına konmaz.
  Dosya atomik değiştirilir ve Linux'ta 600 izinle saklanır.
- Yeni firmanın hesabı, DB bağlantısı ve katalog kurulumu ilk istekte hazırlanır.
  CLI kayıt sırasında da kurar. Registry hatasında sistem kapalı davranır (503).

Yönetim menüsündeki **Firma / Paket** ekranı sadece giriş yapılan firmanın adını,
paketini, aktif kullanıcı ve aylık talep kullanımını gösterir. Firma yöneticisi
paketini veya kotasını kendisi değiştiremez.

## Başlangıç paketleri

Bunlar teknik başlangıç değerleridir; satış fiyatı veya ticari taahhüt değildir.

| Paket | Aktif kullanıcı | Aylık talep |
| --- | ---: | ---: |
| legacy (mevcut firma) | Sınırsız | Sınırsız |
| trial | 2 | 50 |
| starter | 3 | 250 |
| pro | 10 | 2.000 |
| enterprise | Sınırsız | Sınırsız |

Deneme varsayılan 14 gündür (CLI ile 1–90 gün). Ücretli paketler kayıt tarihinde
bir takvim yılı için başlar; 29 Şubat sonraki yıl 28 Şubat olarak ele alınır.
Abonelik/deneme süresi bitince giriş, firma/abonelik ekranı ve kendi parola değişimi
açık kalır; işlevsel API'ler (talep/çizim, PDF, revizyon, e-posta, katalog, kullanıcı
yönetimi) 403 `SUBSCRIPTION_EXPIRED` döndürür. Önceden açılmış oturumlar da kısıtlanır.
Veriler silinmez. Firma manuel askıya alınırsa giriş dahil tüm API erişimi kapanır;
bu durum otomatik abonelik bitişinden ayrıdır.

Yönetici dahil aktif hesaplar kullanıcı kotasını doldurur. Pasif hesapların
yeniden etkinleştirilmesi de kotaya tabidir. Her başarılı talep, içindeki çizim
sayısından bağımsız olarak bir kez sayılır. Aylık dönem UTC takvim ayıdır.
Geçersiz/reddedilen talepler sayılmaz. PostgreSQL satır kilidi aynı anda yapılan
talep/kullanıcı eklemelerini serileştirir. SQLite yalnızca yerel/test içindir.
Paket küçültülürse mevcut kullanıcılar silinmez; kota aşımı yeni kayıtları engeller.

## Mevcut firmayı veri kaybı olmadan kaydetmek

1. PostgreSQL yedeği, `backend/data` yedeği ve env dosyalarının korumalı yedeğini
   alın; geri yüklemeyi ayrı DB üzerinde doğrulayın. Docker volume silmeyin.
2. Yeni kodu önce `SAAS_ENABLED=false` ile kurup normal giriş, katalog, logo,
   talep oluşturma ve PDF akışlarını doğrulayın. `company_account` tablosu mevcut
   firmayı `sunyapi` / `legacy` olarak ekler; talepleri ve kullanıcıları taşımaz/silmez.
3. API container içinde mevcut firmayı aşağıdaki komutla kaydedin. Container adı
   mevcut Doğrama kurulumunun adıdır; farklı kurulumda uyarlayın.

```bash
docker exec -it dograma-api-1 python -m app.saas_cli register \
  --slug sunyapi --name 'Sunyapı' \
  --url https://dograma.estyazilim.com \
  --database-env DATABASE_URL --plan legacy --adopt-existing
```

Bu komut mevcut aktif yönetici hash'ini ve logo dizinini korur. `admin` yerine
başka yönetici varsa `--admin-username` ekleyin. Mevcut DB'nin firma kodu değiştirilemez.
Komut tekrarlanırsa aynı firmayı ikinci kez kaydetmez.

4. `backend/.env.docker` dosyasına şunları ekleyin. Diğer sırları değiştirmeyin:

```dotenv
SAAS_ENABLED=true
SAAS_MANIFEST_PATH=/data/tenants.json
SAAS_UPLOAD_ROOT=/data/uploads/tenants
SAAS_MAX_TENANTS=100
```

5. API'yi yeniden oluşturun (Doğrama sunucusunun mevcut Compose dosyalarıyla):

```bash
cd /opt/dograma
docker compose -p dograma -f compose.yaml -f compose.prod.yaml \
  -f compose.dograma.yaml up -d --force-recreate api web
curl --fail https://dograma.estyazilim.com/api/v1/health
```

SaaS etkinleştirmesi eski token'ları geçersiz kılar; tekrar giriş gerekir.
Sağlık yanıtına ek olarak giriş, katalog, logo ve bir test talebi mutlaka kontrol edilir.
Container'ın loopback sağlık testi registry'yi doğrular; tüm tenant DB'lerinin
çalıştığını garanti etmez. Her firmanın alan adına ayrı izleme gerekir.

## Yeni firma açmak (operatör)

Önce ayrı DB ve sadece o DB'ye yetkili, superuser olmayan PostgreSQL rolü oluşturun.
DB internetten erişilmemelidir. Şemayı oluşturmaya yetkisi olmalı; başka firmaların
DB'lerine bağlanma izinleri kaldırılmalıdır. İlk sürüm bu altyapıyı kendiliğinden
oluşturmaz. Registry aynı DB'nin iki firmaya atanmasını ve logo dizinlerinin
çakışmasını reddeder. DB içindeki firma kimliği de yeniden atamayı reddeder.

DNS/TLS ve reverse proxy için yeni firma alan adını hazırlayın. Proxy aynı web
servisine yönlenmeli, `/api/` zinciri `Host` değerini değiştirmemelidir.
Registry domain eklemek tek başına DNS veya sertifika oluşturmaz.

Operatörün güvenli ortamında yeni DB URL'sini bir env değişkenine koyun ve CLI'ye
sadece değişkenin adını verin. Parolayı komut geçmişine veya argv'ye yazmayın:

```bash
read -rs -p 'Yeni firma DB bağlantısı: ' NEW_COMPANY_DATABASE_URL
echo
export NEW_COMPANY_DATABASE_URL
docker exec -it -e NEW_COMPANY_DATABASE_URL dograma-api-1 \
  python -m app.saas_cli register \
  --slug ornek-firma --name 'Örnek Firma' \
  --url https://ornek-firma.example.com \
  --database-env NEW_COMPANY_DATABASE_URL --plan trial
unset NEW_COMPANY_DATABASE_URL
```

İlk yönetici parolası gizli olarak sorulur; en az 12 karakter gerekir. Yeni firma
DB'si boş olmalıdır. Terminal otomasyonunda `--password-stdin` desteklenir, fakat
parolayı loglara veya shell geçmişine yazarak kullanmayın. İlk sürümde kayıt işlemleri
tek operatör tarafından sırayla yapılmalıdır; eşzamanlı registry yazımı desteklenmez.

Yeni firmada SMTP varsayılan boşdur. Güvenli registry'deki o firmaya ait `smtp_host`,
`smtp_username`, `smtp_password`, `smtp_from_email`, `smtp_admin_email` gibi alanlar
operatörce düzenlenir. SMTP test edilmeden e-posta özelliği sunulmaz. Firma müşterilerinin
çizimleri yönetimde bulunur; otomatik fiyat yayımlanmaz.

```bash
docker exec dograma-api-1 python -m app.saas_cli list
docker exec dograma-api-1 python -m app.saas_cli set-plan ornek-firma starter
docker exec dograma-api-1 python -m app.saas_cli suspend ornek-firma
docker exec dograma-api-1 python -m app.saas_cli resume ornek-firma
```

Paket/statü değişiklikleri sonraki API isteğinde uygulanır; container yeniden
başlatmak gerekmez. Registry'yi elle değiştirirken doğrulanmış dosyayı atomik
değiştirin; kısmi JSON geçici olarak tüm firmalara 503 döndürür.

## Yayına hazırlık ve geri dönüş

- Her DB için günlük yedek, logo yedeği, şifrelenmiş registry/env yedeği ve geri
  yükleme testi gerekir. DB silmek veya firma kaydını kaldırmak abonelik iptal yöntemi değildir.
- Tek sunucuda paylaşılan CPU/RAM ve PostgreSQL vardır; özel DB uygulama veri
  izolasyonu sağlar, ayrı fiziksel sunucu veya yüksek erişilebilirlik garantisi vermez.
- Tenant sayısı ve SQL bağlantı havuzları yük testinde ölçülmeli. Mevcut sürüm
  küçük ölçekli PostgreSQL eşzamanlı kota testlerini içerir; üretim yük testi
  yapılmadan büyük ölçekli satışa hazır sayılmaz.
- Şema değişiklikleri/migration operatör denetiminde, firmalar sırayla yükseltilerek
  uygulanmalı. Otomatik tablo oluşturma mevcut yaklaşımın devamıdır; Alembic sürümlü
  migration, merkezi izleme ve işlem günlüğü ileriki aşamanın parçasıdır.
- Geri dönüş yalnızca mevcut tek firma kurulumunda, erişim/paylaşım etkisi
  değerlendirilerek `SAAS_ENABLED=false` ve eski firma DB/logo ayarlarıyla yapılır.
  Bu bayrak diğer firmaları birleştirmez veya verilerini taşımaz. Her işlem öncesi yedek alın.

## Yıllık abonelik ve hatırlatma servisi

Ücretli firma ilk kaydında `--subscription-email owner@example.com` ile
firma sahibinin doğrulanmış iletişim adresi operatörce tanımlanır. SMTP alıcı
adresi müşteri talebinden alınmaz. Deneme/legacy paket için yıllık ücretli dönem
kendiliğinden açılmaz; `set-plan` ile ücretli pakete geçiş ilk yıllık dönemi başlatır.
Ücretli paketler arasında değişiklik yapmak mevcut bitiş tarihini uzatmaz.
Eski ücretli firma kayıtlarında tarihler eksikse sınırsız erişim verilmez;
aşağıdaki `renew` komutuyla dönem tanımlanır. Legacy mevcut kurulumun sınırsız
paketidir; ticari yıllık abonelik için ücretli paket seçilmelidir.

```bash
docker exec dograma-api-1 python -m app.saas_cli renew ornek-firma \
  --subscription-email owner@example.com
```

Erken yenilemede kalan süre kaybolmaz: yeni bir yıl mevcut bitiş tarihinden
başlatılır. Süresi geçmiş hesapta yenileme tarihinden bir yıl başlar. Manuel
askıya alınmış hesabı yenilemek askıyı kaldırmaz (`resume` ayrı işlemdir).
Mevcut kullanıcı/parola, talepler ve token kimliği korunur; sonraki istek
yenilenen hakkı görür. Abonelik paketi firmaya aittir; o firmanın bütün kullanıcıları
aynı bitiş tarihine tabidir, personel hesabına ayrıca ücretli dönem açılmaz.

`SUBSCRIPTION_REMINDER_DAYS=30,14,7,1` son 30 gün içinde dört hatırlatma planlar.
Bu ayar API/worker env dosyasında değiştirilebilir (1–60 gün). Worker saatte bir
kontrol eder. SMTP ayarları ve alıcı adresi doğrulanmadan canlı e-posta gönderilmez.
SaaS mod ve manifest hazırlanmış olmalıdır. Doğrama kurulumu için ek Compose dosyası:

```bash
cd /opt/dograma
docker compose -p dograma -f compose.yaml -f compose.prod.yaml \
  -f compose.dograma.yaml -f compose.subscriptions.yaml --profile subscriptions \
  up -d --build subscription-worker
docker compose -p dograma -f compose.yaml -f compose.prod.yaml \
  -f compose.dograma.yaml -f compose.subscriptions.yaml --profile subscriptions \
  logs --tail=50 subscription-worker
```

Tek seferlik kontrol (SMTP açıksa gerçek e-posta gönderebilir):

```bash
docker exec dograma-api-1 python -m app.subscription_reminders
```

Başarılı gönderimler `subscription_reminders` tablosuna dönem bitişi ve hatırlatma
günüyle kaydedilir. Aynı dönem/checkpoint yeniden gönderilmez; PostgreSQL satır
kilidi birden fazla worker'ı serileştirir. Başarısız gönderimler en erken 6 saat
sonra tekrar denenir. Kesinti sonrası kaçırılan bütün mesajlar peş peşe değil,
yalnızca en yakın gün eşiği gönderilir. Süresi geçen veya manuel askıya alınan
hesaba hatırlatma gönderilmez. SMTP kabulü teslim/inbox garantisi değildir.
SMTP kabul edip DB kaydı yazılmadan süreç çökerse tekrar mesaj ihtimali vardır;
SMTP protokolüyle mutlak exactly-once teslim garantisi verilmez.

Süre kontrolü worker'a bağlı değildir: API her istekte tarih kontrolü yapar;
worker çalışmasa da süresi dolan abonelik işlevsel kullanıma kapanır. Worker
profili varsayılan kapalıdır; bu geliştirme canlıda zamanlayıcı veya SMTP kurmaz.

## Sonraki aşamalar

Merkezi platform yönetimi ve firma açma ekranı; ticari paket/özellik yönetimi;
ödeme doğrulaması ve imzalı/idempotent webhook; faturalandırma; otomatik yenileme/iptal;
unutulan parola ve davet e-postası; ayrıntılı işlem günlüğü; yedek/PITR;
tenant bazlı yük testi ve güvenlik değerlendirmesi. Ödeme alınmadan önce bu
akışların ayrıca tamamlanması gerekir.

## Testler

`backend/tests/test_saas.py` firma token/veri/katalog/logo ayrımını, sahte host
başlıklarını, kullanıcı/talep limitlerini, askıya alma/deneme bitişini ve ortak
DB/dizin reddini denetler. Angular testleri firma ekranı ve API sözleşmesini denetler.
Bu otomatik testler dış sızma testi veya üretim yük testi yerine geçmez.

`backend/tests/test_saas_postgres.py`, `SAAS_TEST_POSTGRES_URL` tanımlandığında
yalnızca geçici bir PostgreSQL test sunucusunda çalıştırılır. Bu sunucuda testin
oluşturup sildiği `saas_test_<uuid>` veritabanları kullanılır. Bu değişkene canlı
sunucu adresi vermeyin. İki test ayrı DB ve eşzamanlı talep/kullanıcı kotasını denetler.

SaaS/yıllık abonelik doğrulamasında 104 standart backend testi, 3 geçici PostgreSQL
entegrasyon testi ve 155 Angular testi geçti; üretim arayüzü derlemesi tamamlandı.
Canlı çok firmalı mod için yukarıdaki operatör hazırlıkları ayrıca gereklidir.

## Hukuki metinler ve iyzico Link hazırlığı

`commerce_settings` her firmanın kendi DB'sinde satıcı, hizmet, teklif, iyzico Link
ve üç metni tutar. Superuser yönetimde `/admin/sozlesmeler` üzerinden düzenler;
başlangıç taslakları yayımlanmamış ve ödeme kapalıdır. `create_all` yeni tabloları
oluşturur; mevcut veriler veya metinler yeniden başlatmada üzerine yazılmaz.

Yayımlama için gerçek satıcı bilgileri, tamamlanmış metin ve hukuki inceleme onayı
gereklidir. Bu onay uygulamadaki bir idari beyan olup avukat denetiminin yerine
geçmez. SaaS hizmetinin ticari/tüketici satış niteliği, cayma istisnaları ve dijital
hizmetin erken başlaması şartlarını uzman değerlendirmelidir; varsayılan genel
bir “iade yoktur” hükmü eklenmemiştir. Gerekli ayrı açık onaylar söz konusuysa
ödemeyi açmadan önce hizmete özgü akış ayrıca tamamlanmalıdır.

Sözleşmeler düz metin olarak render edilir; HTML çalıştırılmaz. Genel sayfalar:
`/gizlilik-politikasi`, `/iptal-iade`, `/mesafeli-satis`. Gizlilik bağlantısı iletişim
formunda da gösterilir. Aydınlatma metni ve açık rıza farklı amaçlardır; gerçek
işleme hukuki sebeplerine göre eski talep onayı ayrıca hukuki kontrolden geçmelidir.

`/admin/odeme` (süre dolsa da erişilebilir) sunucudaki güncel teklif sürümü için
işaretlenmemiş sözleşme kutularını sunar. İyzico'ya gitmeden önce
`payment_link_acceptances` tablosuna kullanıcı, zaman, sürüm ve tam metin/teklif
anlık görüntüsü kaydedilir. Güncel sürüm değişmişse 409 ile yeniden onay istenir.
Bu kayıt ödeme işlemi, dekont veya tam bir elektronik imza değildir. İyzico Link
işlem numarası ile otomatik eşleştirme yoktur; ödeme panelindeki alıcı/fatura ve
işlem bilgileri operatör tarafından kontrol edilmelidir. Bu modül alıcı fatura
bilgilerini toplamaz; alıcıya özgü sözleşme/ön bilgilendirme ve kopya gönderimi
gereksinimleri gerçek iyzico akışıyla birlikte yayın öncesi tamamlanmalıdır.

Linkte ve uygulamada aynı toplam bedel/hizmet olmalıdır. Uygulama linkteki tutarı
API'den doğrulamaz. Yalnızca HTTPS ve tam `iyzi.link` hostu kabul edilir; sahte
hostlar, başka siteler, sorgu parametreli adresler reddedilir. Kart bilgileri
iyzico sayfasına girilir. Bağlantı, dönüş URL'si veya “ödedim” beyanı hiçbir şekilde
abonelik uzatmaz. Sağlayıcıda ödemenin başarılı olduğu kontrol edilince operatör
mevcut `saas_cli renew` akışını çalıştırır. Tek-firmalı legacy kurulumda yıllık
lisans yönetimi için önce SaaS/firma abonelik dönemi yapılandırılmalıdır.

Bu geliştirme SMTP, gerçek üye işyeri hesabı/linki, otomatik tahsilat, fatura,
canlı aktivasyon veya kart saklama eklemez. iyzico ile Öde/iyzico SVG'leri resmî
marka paketlerinden alınmıştır; beyaz zemin/en-boy oranı korunur.

Kaynaklar (9 Ekim 2026):

- [iyzico Link](https://www.iyzico.com/iyzilink)
- [iyzico marka kılavuzu](https://www.iyzico.com/hakkimizda/iyzico-marka-kilavuzu)
- [iyzico yardım merkezi / site gereksinimleri](https://www.iyzico.com/destek/yardim-merkezi)
- [Ticaret Bakanlığı mesafeli sözleşmeler bilgilendirmesi](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme)
- [KVKK aydınlatma yükümlülüğü](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)

Bu modülün son kontrolünde 116 standart backend testi ve 161 Angular testi geçti;
üretim arayüzü derlendi. Bu çalıştırmada geçici PostgreSQL sunucusu tanımlanmadığı
için 3 isteğe bağlı PostgreSQL testi atlandı. Gerçek iyzico tahsilatı, hukuki onay,
canlı sunucu güncellemesi ve gerçek e-posta teslimi bu testlere dahil değildir.
