# Uretim Kurulumu — pvc.montajtakip.com

Hedef sunucu `46.224.58.194`. Uygulama tek alan adindan yayinlanir: web
container'inin nginx'i `/api/` isteklerini ag uzerinden api container'ina
tasidigi icin ayri bir api subdomain'i gerekmez.

```
Ziyaretci -> host nginx (443, TLS) -> 127.0.0.1:4310 web container
                                        |-- /        Angular SPA
                                        |-- /api/ -> api container :8000 -> db :5432
```

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

## 1. DNS

Cloudflare'de `montajtakip.com` bolgesine A kaydi eklenir:

| Tur | Ad  | Icerik          | Proxy      |
|-----|-----|-----------------|------------|
| A   | pvc | 46.224.58.194   | DNS only   |

Kok alan adi su an DNS-only oldugu icin ayni duzen korunmustur. **Turuncu
buluta alinacaksa** `deploy/nginx/pvc.montajtakip.com.conf` dosyasinin
sonundaki nota bakin: `set_real_ip_from` eklenmezse hiz sinirlayici butun
ziyaretcileri tek Cloudflare IP'si olarak gorur.

Yayilmayi dogrulayin:

```bash
dig +short pvc.montajtakip.com @1.1.1.1
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
```

Argon2 hash'i uretmek icin `backend/README.md`'deki yontem kullanilir. Duz
parola hicbir dosyaya yazilmaz.

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

```bash
cp /opt/pvc/deploy/nginx/pvc.montajtakip.com.conf /etc/nginx/sites-available/pvc.montajtakip.com
ln -s /etc/nginx/sites-available/pvc.montajtakip.com /etc/nginx/sites-enabled/
install -d /var/www/certbot
```

Sertifika alinmadan once vhost'taki `ssl_certificate` yollari mevcut olmadigi
icin `nginx -t` basarisiz olur. Sirasi: once sertifika, sonra tam vhost.

```bash
certbot certonly --webroot -w /var/www/certbot -d pvc.montajtakip.com
nginx -t && systemctl reload nginx
```

`certbot renew` zamanlayicisinin kurulu oldugunu dogrulayin:

```bash
systemctl list-timers | grep certbot
```

## 6. Kurulum sonrasi dogrulama

```bash
curl -sI https://pvc.montajtakip.com/ | head -1
curl -sf https://pvc.montajtakip.com/api/v1/health
curl -sI https://pvc.montajtakip.com/ | grep -i strict-transport-security
curl -sI http://pvc.montajtakip.com/ | head -1     # 301 beklenir
```

API dokumantasyonunun kapali oldugunu dogrulayin (404 beklenir):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://pvc.montajtakip.com/api/v1/docs
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
