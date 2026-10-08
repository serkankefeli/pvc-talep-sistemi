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
