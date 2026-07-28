# Panduan Setup dan Menjalankan Sistem FO KIMA

Panduan ini menjalankan aplikasi lokal dengan arsitektur React/Vite → Rust/Axum → MySQL → Google Drive.

## 1. Prasyarat

- Node.js 20+ dan npm;
- Rust stable (edition 2024);
- MySQL 8+ yang aktif;
- kredensial Google Drive OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, dan ID folder root Drive.

> Backend memerlukan konfigurasi Google Drive saat mulai, walaupun hanya ingin membuka API lokal. Jangan menyimpan rahasia pada repository atau membagikan file `.env`.

## 2. Siapkan database dan konfigurasi

1. Buat database dan user MySQL bila belum tersedia.

   ```sql
   CREATE DATABASE fo_kima CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'fo_kima_user'@'127.0.0.1' IDENTIFIED BY 'ganti-dengan-password-kuat';
   GRANT ALL PRIVILEGES ON fo_kima.* TO 'fo_kima_user'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

2. Siapkan konfigurasi backend.

   ```bash
   cd backend
   cp .env.example .env
   ```

   Isi minimal `backend/.env` berikut dengan nilai environment Anda.

   ```env
   DATABASE_URL=mysql://fo_kima_user:<password>@127.0.0.1:3306/fo_kima
   JWT_SECRET=<secret-acak-panjang>
   BIND_ADDR=127.0.0.1:8080
   CORS_ALLOWED_ORIGIN=http://localhost:5173

   GOOGLE_CLIENT_ID=<client-id-google>
   GOOGLE_CLIENT_SECRET=<client-secret-google>
   GOOGLE_REFRESH_TOKEN=<refresh-token-google>
   GOOGLE_DRIVE_LINK_SHARING=false
   PELANGGAN_ROOT_FOLDER_ID=<id-folder-root-google-drive>

   # Backup database terenkripsi ke Root/Backup/Database
   BACKUP_ENABLED=false
   BACKUP_TIMEZONE=Asia/Makassar
   BACKUP_SCHEDULE_HOUR=2
   BACKUP_SCHEDULE_MINUTE=0
   BACKUP_FOLDER_NAME=Backup
   BACKUP_DATABASE_FOLDER_NAME=Database
   BACKUP_RETENTION_DAILY=7
   # openssl rand -base64 32
   BACKUP_ENCRYPTION_KEY=<base64-32-byte-key>
   # Wajib hanya jika akan menguji restore; user harus terpisah dari produksi
   BACKUP_RESTORE_DATABASE_URL=mysql://fo_kima_restore_user:<password>@127.0.0.1:3306/fo_kima_restore_admin
   BACKUP_MAX_RESTORE_BYTES=2147483648
   ```

   Sistem melakukan dump database, kompresi gzip, enkripsi AES-256-GCM, lalu
   upload ke folder `Backup/Database` di bawah `PELANGGAN_ROOT_FOLDER_ID`.
   Jika backup diaktifkan, proses otomatis berjalan pada jam yang dikonfigurasi:
   `BACKUP_ENCRYPTION_KEY` wajib berisi hasil Base64 dari tepat 32 byte acak.
   `BACKUP_TIMEZONE` yang didukung saat ini adalah `UTC`, `Asia/Jakarta`,
   `Asia/Makassar`, dan `Asia/Jayapura`. Folder backup harus tetap Dibatasi;
   sistem akan menolak backup jika menemukan permission publik/domain.
   Untuk uji manual oleh admin, panggil endpoint
   `POST /api/admin/backup/run` dengan Bearer token admin. Endpoint ini menjalankan
   satu backup dan mengembalikan checksum serta ukuran hasilnya.
   Riwayat 20 backup terakhir dapat dilihat melalui `GET /api/admin/backup/jobs`.
   Pengujian restore aman dijalankan melalui `POST /api/admin/backup/restore`
   dengan body `{"backup_job_id": 123}`. Sistem hanya membuat database sementara
   dengan prefix `fo_kima_restore_`, memverifikasi jumlah tabel, lalu menghapusnya.

3. Siapkan konfigurasi frontend bila URL backend berbeda dari default.

   ```bash
   cd ../frontend
   cp .env.example .env.development
   ```

   Nilai lokal default adalah:

   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8080
   ```

## 3. Jalankan aplikasi

Gunakan dua terminal terpisah.

Terminal 1 — backend:

```bash
cd backend
cargo run --bin fo-kima-backend
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173` di browser. Backend tersedia di `http://127.0.0.1:8080`.

Saat backend pertama kali berjalan, aplikasi menyiapkan skema dan migrasi database secara otomatis. Log SQL yang lambat pada tahap ini dapat terjadi dan bukan selalu error; proses dianggap siap setelah muncul pesan `FO KIMA backend listening`.

## 4. Verifikasi cepat

Jalankan dari terminal lain:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/readyz
```

Kedua endpoint harus mengembalikan respons sukses. Setelah itu, login melalui browser menggunakan akun yang tersedia pada database environment lokal Anda.

## 5. Perintah penting

| Lokasi | Perintah | Fungsi |
|---|---|---|
| `backend` | `cargo test --bin fo-kima-backend` | Menjalankan test backend |
| `frontend` | `npm run lint` | Memeriksa kode frontend |
| `frontend` | `npm run build` | Membuat build produksi frontend |

## 6. Masalah umum

| Gejala | Periksa / tindakan |
|---|---|
| Backend tidak terhubung ke MySQL | Pastikan MySQL aktif, database/user ada, dan `DATABASE_URL` benar. |
| Backend berhenti pada konfigurasi Drive | Lengkapi empat variabel Google Drive dan pastikan refresh token masih valid. |
| Browser menampilkan CORS atau `Failed to fetch` | Akses frontend lewat `http://localhost:5173` dan samakan `CORS_ALLOWED_ORIGIN=http://localhost:5173`. |
| Port sudah dipakai | Hentikan proses lama atau ubah `BIND_ADDR` dan `VITE_API_BASE_URL` secara konsisten. |
| Dokumen gagal diunggah | Periksa izin folder root Google Drive, refresh token, dan batas ukuran unggahan backend. |
| Preview/download dokumen gagal | Pastikan backend memiliki akses ke Drive dan dokumen dibuka dari portal setelah login; ISP tidak lagi memakai link publik Drive. |

## 7. Berhenti menjalankan aplikasi

Tekan `Ctrl+C` pada masing-masing terminal backend dan frontend.

Dokumen teknis pendukung: [arsitektur](implementasi/Dokumentasi_Arsitektur_Website.md) dan [integrasi Google Drive](laporan/Dokumentasi_Implementasi_Drive.md).

Untuk deployment produksi di VPS, lihat [Panduan Deploy VPS](Panduan_Deploy_VPS.md).

Panduan penggunaan aplikasi untuk pengguna operasional: [User Manual Sistem FO KIMA](manual/User_Manual_Sistem_FO_KIMA.md).
