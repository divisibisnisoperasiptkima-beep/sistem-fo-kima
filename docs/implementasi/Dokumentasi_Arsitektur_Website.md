# Dokumentasi Arsitektur Website

## Status Implementasi — 23 Juli 2026

Arsitektur di bawah tetap menjadi arsitektur aktif. Cakupan yang telah
divalidasi melalui UAT adalah **admin dan teknisi**. Admin mengakses modul
bisnis secara penuh; teknisi hanya melihat halaman **Titik Peta FO KIMA** dan
endpoint bisnis (dashboard, pelanggan, kontrak, pengguna) menolaknya. Kedua
role dapat mengelola titik lokasi/kontrak dan titik ISP/pelanggan pada peta.

Role ISP, penugasan pelanggan ISP, dan workflow persetujuan peta masih
disiapkan sebagai pengembangan lanjutan, bukan perilaku aktif yang diuji.

## Arsitektur Target

```text
Frontend React/Vite → Backend Rust/Axum → MySQL
                                  └→ Google Drive API melalui OAuth Google Cloud
```

Tidak ada Next.js, Google Sheets, Google Apps Script, Supabase, atau Docker
dalam arsitektur aplikasi.

## Tanggung Jawab Komponen

### Frontend React/Vite

- login dan penyimpanan token sesi;
- halaman pelanggan, kontrak, billing, dokumen, dan peta jalur FO;
- validasi antarmuka dan upload berkas ke API Rust;
- menampilkan status data dan peta berlabel untuk titik lokasi maupun ISP.

### Backend Rust/Axum

- JWT, role, dan otorisasi admin/teknisi/ISP;
- aturan bisnis kontrak, perpanjangan, upgrade, billing, dan peta;
- transaksi MySQL serta audit perubahan;
- pembuatan folder Drive dan upload dokumen;
- API JSON untuk frontend.

### MySQL

- sumber data utama pelanggan, kontrak, billing, peta, user, dan audit;
- menyimpan metadata dokumen serta relasi file/folder Google Drive;
- menjaga histori kontrak dan snapshot harga billing.

### Google Drive API

- penyimpanan fisik dokumen;
- diakses hanya oleh backend menggunakan OAuth Google Cloud;
- struktur folder mengikuti pelanggan → lokasi → periode kontrak.

## Alur Request

1. Pengguna memakai frontend React.
2. Frontend mengirim token Bearer dan request ke backend Rust.
3. Backend memeriksa role serta aturan bisnis.
4. Backend membaca atau menulis MySQL.
5. Untuk dokumen, backend membuat folder atau mengunggah file ke Google Drive.
6. Backend mengembalikan respons JSON ke frontend.

## Endpoint Utama

- autentikasi;
- pelanggan dan dokumen pelanggan;
- kontrak lokasi, perpanjangan, upgrade, dan dokumen periode;
- billing dan detail prorata;
- tabel Titik Peta FO KIMA yang unik per pelanggan + nama lokasi, titik lokasi
  multi-marker, titik ISP/pelanggan, dan label marker;
- dashboard, kontrak beroperasi/proses perpanjangan, dan pembayaran.
