# Rencana Implementasi Rust, MySQL, dan Google Drive

> Catatan status (23 Juli 2026): ini adalah rencana awal. CRUD pelanggan dan
> kontrak, perpanjangan/upgrade, dokumen Google Drive, dashboard, dan peta
> titik telah diimplementasikan serta diuji untuk admin/teknisi. Role ISP,
> generator billing otomatis, jalur FO, dan workflow persetujuan peta masih
> merupakan pekerjaan lanjutan.

## Arsitektur Target

```text
Frontend React/Vite → Backend Rust → MySQL
                           └→ Google Drive API melalui OAuth Google Cloud
```

Next.js, Google Sheets, dan Google Apps Script tidak termasuk dalam arsitektur
target. Google Apps Script dibatalkan.

## Tanggung Jawab Backend Rust

- autentikasi JWT dan role admin/teknisi/ISP;
- validasi aturan pelanggan, kontrak, billing, dan peta;
- transaksi aman untuk perpanjangan dan upgrade;
- perhitungan status kontrak serta billing prorata;
- audit perubahan;
- API frontend dan integrasi Google Drive.

## Data yang Sudah Ada dan Perlu Didukung

- `users` dan audit user;
- `pelanggan`;
- `lokasi` sebagai kontrak per lokasi/periode;
- `billing` dan `billing_details` untuk prorata;
- metadata dokumen pada tabel `dokumen`;
- `titik_pelanggan`, `rute_fo`, dan status persetujuan peta;
- akses ISP terhadap pelanggan.

Detail pemetaan nama bisnis ke tabel/kolom MySQL dan kebutuhan migration ada di
[`Kesesuaian_Skema_MySQL.md`](Kesesuaian_Skema_MySQL.md).

## Google Drive API

Backend memakai Google Drive API melalui OAuth dari Google Cloud Console.

- Browser mengunggah file ke backend; token OAuth tidak dikirim ke browser.
- Backend membuat folder pelanggan, `Bak-PKS`, `Kontrak`, `Dokumen Lain`, `Lokasi`, periode, dan
  subfolder jenis berkas secara idempoten.
- MySQL menyimpan ID file, ID folder, URL, nama, kategori, pengunggah, waktu,
  dan relasi pemilik dokumen.
- Kredensial OAuth dan refresh token disimpan di environment backend.

## API yang Perlu Dibangun

1. Pelanggan: daftar, detail, tambah, ubah, hapus, dan dokumen pelanggan.
2. Kontrak: daftar, detail, tambah, ubah, perpanjang, upgrade, dan dokumen.
3. Billing: daftar per kontrak, buat, ubah, generator siklus, dan prorata.
4. Peta: tabel lokasi unik, titik lokasi multi-marker, titik ISP/pelanggan,
   label, dan framing peta.
5. Monitoring: kontrak beroperasi, mendekati berakhir, pembayaran, dan rekap.

## Urutan Implementasi

1. CRUD pelanggan dan kontrak lokasi dengan validasi bisnis.
2. Perpanjangan serta upgrade sebagai transaksi atomik.
3. Generator billing, jatuh tempo, dan prorata upgrade.
4. OAuth Google serta pengelolaan folder dan upload Drive.
5. Peta jalur FO dan workflow persetujuan, bila kebutuhan bisnisnya sudah
   ditetapkan.
6. Monitoring, audit, pengujian, dan penyempurnaan role.
