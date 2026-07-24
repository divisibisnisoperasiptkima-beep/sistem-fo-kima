# Backend Rust — Sistem FO KIMA

Backend mandiri untuk Sistem FO KIMA.

## Prasyarat

- Rust stable
- MySQL 8 pada host lokal

## Menjalankan

```bash
cp .env.example .env
# isi DATABASE_URL di .env
cargo run
```

Server berjalan pada `http://127.0.0.1:8080` secara default.

- `GET /healthz`: proses API hidup.
- `GET /readyz`: API dan koneksi MySQL siap.

Konfigurasi dan rahasia hanya dibaca dari `backend/.env`; file ini tidak dilacak Git.
