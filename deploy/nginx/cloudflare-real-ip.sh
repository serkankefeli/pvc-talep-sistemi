#!/bin/sh
# Cloudflare turuncu bulut arkasindayken gercek ziyaretci IP'sini cozer.
#
# Proxy aktifken nginx'in gordugu $remote_addr Cloudflare uc sunucusudur.
# Onlem alinmazsa hiz sinirlayici butun ziyaretcileri bir avuc Cloudflare
# IP'si olarak gorur ve SECURITY.md'deki "IP bazinda sinirlandirma" kuralii
# fiilen calismaz.
#
# Bu script guncel Cloudflare araliklarini indirip bir snippet uretir.
# Yalniz bu araliklardan gelen isteklerde CF-Connecting-IP dikkate alinir;
# sunucuya dogrudan baglanan biri bu basligi taklit ederek IP degistiremez.
#
# Cloudflare araliklari zaman zaman degisir; yilda birkac kez calistirilmali.
# Gri buluta (DNS only) donulurse snippet silinip nginx yeniden yuklenir.
#
# Kullanim:  sh deploy/nginx/cloudflare-real-ip.sh

set -eu

SNIPPET=/etc/nginx/snippets/cloudflare-real-ip.conf
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

mkdir -p /etc/nginx/snippets

{
    echo "# Otomatik uretildi: deploy/nginx/cloudflare-real-ip.sh"
    echo "# Uretim tarihi: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
} > "$TMP"

for URL in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    RANGES="$(curl -fsS --max-time 20 "$URL")"
    if [ -z "$RANGES" ]; then
        echo "HATA: $URL bos dondu, snippet degistirilmedi." >&2
        exit 1
    fi
    echo "$RANGES" | while read -r CIDR; do
        [ -n "$CIDR" ] && echo "set_real_ip_from $CIDR;"
    done >> "$TMP"
done

echo "real_ip_header CF-Connecting-IP;" >> "$TMP"

COUNT="$(grep -c '^set_real_ip_from' "$TMP")"
if [ "$COUNT" -lt 10 ]; then
    echo "HATA: yalniz $COUNT aralik alindi, beklenenden az. Snippet degistirilmedi." >&2
    exit 1
fi

cat "$TMP" > "$SNIPPET"
echo "$SNIPPET yazildi ($COUNT aralik)."

nginx -t
systemctl reload nginx
echo "nginx yeniden yuklendi."
