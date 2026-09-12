# Uretim Kurulumu — teklif.sunyapi.com

Hedef Sunyapi sunucusu `49.13.239.82`. Uygulama tek alan adindan yayinlanir: web
container'inin nginx'i `/api/` isteklerini ag uzerinden api container'ina
tasidigi icin ayri bir api subdomain'i gerekmez.

```
Ziyaretci -> host nginx (443, TLS) -> 127.0.0.1:4310 web container
                                        |-- /        Angular SPA
                                        |-- /api/ -> api container :8000 -> db :5432
```

> **Overlay dosyasi zorunludur.** `compose.yaml` tek basina calistirilirsa API'yi
> `127.0.0.1:8000`'e yayinlar; bu port sunucuda **canli montajtakip.com** vhost'unun
> proxy hedefidir. Her komutta `-f compose.yaml -f compose.prod.yaml` birlikte
> verilmelidir — overlay bu yayini `!reset` ile kaldirir.

## 0. On kosullar

Sunucuda baska projeler calisiyor. Kuruluma baslamadan once cakisma olup
olmadigini dogrulayin:

```bash
ss -ltnp | grep -E ':(4310|5432)\b' ; docker network ls ; ip -o -4 addr show | awk '{print $4}'
```

- `4310` portu bos olmali. Doluysa `.env` icindeki `PVC_WEB_PORT` degistirilir
  ve nginx vhost'undaki `proxy_pass` ayni degere cekilir.
- `172.31.240.0/24` araligi kullanimda olmamali. Doluysa `PVC_NETWORK_SUBNET`
  degistirilir; bu deger ayni zamanda uvicorn'un guvendigi proxy araligidir,
  ikisi tek degiskenden gelir.

Bellek: sunucuda 3.7 GB RAM var ve ayni kutuda baska uretim servisleri
calisiyor. Swap yoksa once eklenmelidir; Angular derlemesi bu tamponsuz
ortamda diger servisleri riske atar.

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 1. DNS

Cloudflare'de `sunyapi.com` bolgesine A kaydi eklenir:

| Tur | Ad  | Icerik          | Proxy      |
|-----|-----|-----------------|------------|
| A   | teklif | 49.13.239.82 | DNS only   |

Kok alan adi su an DNS-only oldugu icin ayni duzen korunmustur. **Turuncu
buluta alinacaksa** `deploy/nginx/teklif.sunyapi.com.conf` dosyasinin
sonundaki nota bakin: `set_real_ip_from` eklenmezse hiz sinirlayici butun
ziyaretcileri tek Cloudflare IP'si olarak gorur.

Yayilmayi dogrulayin:

```bash
dig +short teklif.sunyapi.com @1.1.1.1
```

## 2. Kodu sunucuya alin

```bash
install -d -m 750 /opt/pvc && git clone https://github.com/serkankefeli/pvc-talep-sistemi.git /opt/pvc
```

## 3. Ortam dosyalari

Uc dosya gerekir. Ucu de `.gitignore`'dadir, repoya girmez.

### `/opt/pvc/.env` — yalniz Compose interpolasyonu

```bash
cd /opt/pvc && cp .env.prod.example .env
```

`POSTGRES_PASSWORD` doldurulur:

```bash
openssl rand -base64 36
```

### `/opt/pvc/backend/.env` — uygulama ayarlari

`backend/.env.example` kopyalanir. `ENVIRONMENT`, `DEBUG`, `ENABLE_DOCS`,
`DATABASE_URL`, `CORS_ORIGINS` ve `ADMIN_PANEL_BASE_URL` degerlerini Compose
zaten dogru sekilde eziyor; bu dosyada asil doldurulmasi gerekenler
`JWT_SECRET` ve SMTP bilgileridir.

```bash
openssl rand -base64 48   # JWT_SECRET, en az 32 karakter olmali
```

SMTP bos birakilirsa API calismaya devam eder; musteriye e-posta gonderme
islemi 503 doner, sessizce basarili gorunmez.

### `/opt/pvc/backend/.env.docker` — yonetici kimligi

```bash
cp backend/.env.docker.example backend/.env.docker
sh deploy/set-admin-password.sh
```

Script parolayi ekranda gostermeden sorar, Argon2id hash'ini uretip dosyaya
yazar. Duz parola hicbir dosyaya, kabuk gecmisine veya surec listesine
dusmez — docker'a yalniz stdin uzerinden gecer. Once imajlarin derlenmis
olmasi gerekir (adim 4).

> `ENVIRONMENT=production` iken `ADMIN_PASSWORD_HASH` bos veya `JWT_SECRET`
> varsayilan birakilirsa uygulama acilista hata verip durur (`config.py`
> icindeki `validate_production_secrets`). Bu kasitlidir.

## 4. Ayaga kaldirin

```bash
cd /opt/pvc && docker compose -f compose.yaml -f compose.prod.yaml up -d --build --wait --wait-timeout 300
```

Dogrulama:

```bash
curl -sf http://127.0.0.1:4310/api/v1/health && curl -sI http://127.0.0.1:4310/ | head -1
```

## 5. Host nginx ve TLS

Once yalniz HTTP ve ACME dogrulamasini iceren gecici vhost etkinlestirilir:

```bash
install -d /var/www/certbot
install -d /etc/nginx/snippets
cp /opt/pvc/deploy/nginx/pvc-proxy-pass.conf /etc/nginx/snippets/pvc-proxy-pass.conf
cp /opt/pvc/deploy/nginx/teklif.sunyapi.com-bootstrap.conf /etc/nginx/sites-available/teklif.sunyapi.com
ln -sfn /etc/nginx/sites-available/teklif.sunyapi.com /etc/nginx/sites-enabled/teklif.sunyapi.com
nginx -t && systemctl reload nginx
```

Sertifika alindiktan sonra ayni vhost tam TLS yapilandirmasiyla degistirilir:

```bash
certbot certonly --webroot -w /var/www/certbot -d teklif.sunyapi.com
cp /opt/pvc/deploy/nginx/teklif.sunyapi.com.conf /etc/nginx/sites-available/teklif.sunyapi.com
nginx -t && systemctl reload nginx
```

`certbot renew` zamanlayicisinin kurulu oldugunu dogrulayin:

```bash
systemctl list-timers | grep certbot
```

## 6. Kurulum sonrasi dogrulama

```bash
curl -sI https://teklif.sunyapi.com/ | head -1
curl -sf https://teklif.sunyapi.com/api/v1/health
curl -sI https://teklif.sunyapi.com/ | grep -i strict-transport-security
curl -sI http://teklif.sunyapi.com/ | head -1     # 301 beklenir
```

API dokumantasyonunun kapali oldugunu dogrulayin (404 beklenir):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://teklif.sunyapi.com/api/v1/docs
```

## Hiz sinirlayici ve gercek ziyaretci IP'si

`api.py` istemciyi bilincli olarak socket karsiligindan okur, sahte
header'lara guvenmez. Ancak bu kurguda API her zaman web container'inin
nginx'i arkasindadir; onlem alinmazsa butun ziyaretciler tek istemci sayilir
ve **hicbir istek yapmamis bir ziyaretci dogrudan 429 alir** — admin girisi de
dahil, yani herkes 5 dakikada 10 basarisiz denemeyle yonetici girisini
kilitleyebilir.

`compose.prod.yaml` bunu uygulama koduna dokunmadan cozer: uvicorn
`--proxy-headers --forwarded-allow-ips=<compose agi>` ile calisir. Uvicorn
X-Forwarded-For zincirini **sagdan sola** yurur ve guvenilmeyen ilk adresi
alir. Iki nginx katmani da `$proxy_add_x_forwarded_for` kullandigi icin gercek
ziyaretci her zaman guvenilir proxy'lerin solunda, internetten gelen sahte bir
deger ise onun da solunda kalir; bu yuzden sahte deger secilmez.

Bu davranis yerelde dogrulanmistir: farkli ziyaretciler ayri kovalara duser ve
`X-Forwarded-For: 9.9.9.9, <gercek>` gonderildiginde `9.9.9.9` degil gercek
adres esas alinir.

> `SlidingWindowRateLimiter` surec-ici bir yapidir. API birden fazla uvicorn
> worker'i ile calistirilirsa her worker kendi sayacini tutar. Tek worker
> varsayimi korunmalidir; olceklenirse paylasimli (Redis vb.) bir sayaca
> gecilmelidir.

## Yedekleme

Veritabani `db-data` adli Docker volume'unde, yuklenen logolar
`backend/data/uploads/branding` altindadir.

```bash
cd /opt/pvc
docker compose -f compose.yaml -f compose.prod.yaml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > /var/backups/pvc-$(date +%F).sql.gz
tar -czf /var/backups/pvc-uploads-$(date +%F).tar.gz -C backend/data uploads
```

## Guncelleme

```bash
cd /opt/pvc && git pull && docker compose -f compose.yaml -f compose.prod.yaml up -d --build --wait
```

## Geri alma

```bash
cd /opt/pvc && git checkout <onceki-sha> && docker compose -f compose.yaml -f compose.prod.yaml up -d --build --wait
```

Sema degisikligi iceren bir surumden geri donuluyorsa once ilgili yedek geri
yuklenmelidir; `SQLModel.metadata.create_all` yalnizca eksik tablolari
olusturur, sema dusurme yapmaz.
