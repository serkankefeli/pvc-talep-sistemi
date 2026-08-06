#!/bin/sh
# Yonetici parolasinin Argon2id hash'ini uretip backend/.env.docker icine yazar.
#
# Parola ekranda gorunmez, kabuk gecmisine dusmez, surec listesinde yer almaz
# ve hicbir dosyaya duz metin olarak yazilmaz. Yalniz hash saklanir.
#
# Kullanim:  cd /opt/pvc && sh deploy/set-admin-password.sh

set -eu

cd "$(dirname "$0")/.."

if [ ! -f backend/.env.docker ]; then
    echo "HATA: backend/.env.docker yok. Once .env.docker.example kopyalanmali." >&2
    exit 1
fi

printf 'Admin parolasi: '
stty -echo 2>/dev/null || true
read -r PASSWORD
stty echo 2>/dev/null || true
printf '\n'

if [ -z "$PASSWORD" ]; then
    echo "HATA: parola bos olamaz." >&2
    exit 1
fi

# Parola docker'a yalniz stdin uzerinden gecer; arguman veya ortam
# degiskeni kullanilmaz, boylece `ps` ciktisinda gorunmez.
HASH="$(
    printf '%s' "$PASSWORD" | docker compose -f compose.yaml -f compose.prod.yaml \
        run --rm --no-deps -T api \
        python -c 'import sys
from pwdlib import PasswordHash
print(PasswordHash.recommended().hash(sys.stdin.read()))' | tr -d '\r' | grep '^\$argon2' | tail -n 1
)"
PASSWORD=''

case "$HASH" in
    '$argon2'*) ;;
    *) echo "HATA: beklenen Argon2 hash uretilemedi." >&2; exit 1 ;;
esac

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
grep -v '^ADMIN_PASSWORD_HASH=' backend/.env.docker > "$TMP" || true
printf "ADMIN_PASSWORD_HASH='%s'\n" "$HASH" >> "$TMP"
cat "$TMP" > backend/.env.docker
chmod 600 backend/.env.docker

echo "backend/.env.docker guncellendi. Kullanici: $(grep -oP '^ADMIN_USERNAME=\K.*' backend/.env.docker || echo admin)"
