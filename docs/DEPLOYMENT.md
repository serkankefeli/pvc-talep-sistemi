# Domain ve Yayınlama Mimarisi

Uygulama ana web sitesinden bağımsız dağıtılır. Aynı kaynak kodu aşağıdaki
iki senaryoda da çalışır.

## Önerilen subdomain düzeni

```text
www.firma.com             mevcut ana site
teklif.firma.com          Angular ziyaretçi uygulaması
yonetim-teklif.firma.com  Angular admin rotası veya ayrı admin dağıtımı
api-teklif.firma.com      Python FastAPI
```

Ana sitedeki "Ölçünü Gir, Talep Oluştur" butonu
`https://teklif.firma.com` adresine gider.

## İkinci domain düzeni

```text
www.firma.com             mevcut ana site
www.olculutalep.com        Angular uygulaması
api.olculutalep.com        Python FastAPI
```

Frontend API adresini çalışma zamanı ayarından alır. Kod değişikliği
yapmadan domain değiştirilebilir.

## Ana siteye gömme

Iframe gerekiyorsa yalnız ziyaretçi yapılandırıcısı gömülür. Yönetici paneli
iframe içinde çalıştırılmaz.

- API CORS listesinde yalnız gerçek frontend adresleri bulunur.
- Frontend `Content-Security-Policy` başlığındaki `frame-ancestors`
  değerinde yalnız ana siteye izin verir.
- `postMessage` kullanılırsa hem gönderen hem hedef origin tam adres olarak
  doğrulanır.
- Yönetici anahtarı ve fiyat verisi iframe mesajlarında taşınmaz.

## Üretim gereksinimleri

- HTTPS ve HTTP'den HTTPS'e yönlendirme
- PostgreSQL
- SMTP veya kurumsal e-posta servisi
- Ayrı frontend ve API servisleri
- Düzenli şifreli veritabanı yedeği
- Log ve denetim kaydı saklama politikası
- API üzerinde kesin host/origin allowlist

