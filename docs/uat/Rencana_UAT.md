# Rencana UAT Sistem FO KIMA

## Tujuan

Memastikan fitur utama berjalan sesuai alur bisnis, role pengguna, dan data MySQL yang menjadi sumber utama sistem.

## Status Eksekusi — 23 Juli 2026

- Cakupan **admin dan teknisi** telah dieksekusi dan diterima; lihat `Laporan_UAT_2026-07-23.md`.
- Cakupan **ISP** ditunda sampai role dan penugasan pelanggan ISP mulai digunakan.
- Skenario admin aktif terakhir hanya boleh dijalankan di staging dengan minimal dua admin uji.

## Ruang Lingkup

1. Autentikasi dan sesi pengguna.
2. Role admin, teknisi, dan ISP.
3. Pelanggan, kontrak lokasi, histori perpanjangan/upgrade, dan billing.
4. Titik Peta FO KIMA: tabel unik, multi-titik lokasi, titik ISP, label, dan framing peta.
5. Dashboard: card Core Tersewa dan rincian per pelanggan.
6. Pengguna: tambah, ubah, penonaktifan, dan perlindungan administrator terakhir.
7. Dokumen dan metadata Google Drive menggunakan data uji.

## Di Luar Ruang Lingkup

- Penghapusan atau perubahan data produksi tanpa persetujuan.
- Pengujian beban skala besar.
- Penghapusan dokumen Drive operasional.

## Peran Penguji

- **Admin:** pengujian penuh dan pengelolaan pengguna.
- **Teknisi:** hanya tabel/peta teknis serta pengelolaan titik.
- **ISP:** data pelanggan yang diberikan melalui `user_pelanggan_access`.

## Lingkungan

- Frontend: React/Vite.
- Backend: Rust/Axum pada `127.0.0.1:8080`.
- Database: MySQL project pada `backend/.env`.
- Browser: Chrome/Chromium versi yang digunakan saat pengujian.
- Data uji: gunakan pelanggan/kontrak uji yang dapat dipulihkan.

## Kriteria Penerimaan

- Tidak ada error 500, panic backend, atau pelanggaran akses pada skenario lulus.
- Angka dashboard konsisten dengan query database yang sesuai.
- Data histori kontrak tidak terhapus ketika kontrak baru dibuat.
- Titik lama tetap tampil setelah restart backend.
- Setiap temuan memiliki bukti dan tingkat prioritas.
