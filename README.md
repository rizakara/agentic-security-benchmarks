# agentic-security-benchmarks

AI ile üretilen kodun güvenlik analizi üzerine bir vaka çalışması.

Üç farklı prompt senaryosu (sıradan, make-it-secure, make-it-secure + SECURITY.md) ile Claude Code üzerinde oluşturulan e-ticaret API projelerini ve bunların güvenlik audit sonuçlarını içerir.

Detaylı analiz ve bulgular için: [Terzi Kendi Söküğünü Dikebilir Mi? AI ile Üretilen Kodun Güvenlik Paradoksu](https://rizakara.substack.com/p/terzi-kendi-sokugunu-dikebilir-mi)

## Yapı

```
├── ecommerce-fast/                     # Sıradan prompt çıktısı
│   ├── AGENT_AUDIT.md
│   ├── SNYK_AUDIT.md
│   ├── docker-compose.yml
│   └── src/
│       ├── config.js
│       ├── controllers/
│       ├── db/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       └── utils/
├── ecommerce-secure/                   # "Make it secure" prompt çıktısı
│   ├── AGENT_AUDIT.md
│   ├── SNYK_AUDIT.md
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── src/
│       ├── app.js
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── services/
│       └── utils/
└── ecommerce-secure-with-rules/        # Make-it-secure + SECURITY.md çıktısı
    ├── AGENT_AUDIT.md
    ├── SNYK_AUDIT.md
    ├── Dockerfile
    ├── docker-compose.yml
    └── src/
        ├── config/
        ├── db/
        ├── middleware/
        ├── routes/
        └── schemas/
```
