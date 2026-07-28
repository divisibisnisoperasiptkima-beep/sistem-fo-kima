# Rencana UAT Role ISP — Sistem FO KIMA

## Informasi

| Item | Nilai |
|---|---|
| Tanggal rencana | 25 Juli 2026 |
| Cakupan | Portal ISP, pembatasan pelanggan, kontrak/lokasi, dokumen, upload |
| Role penguji | Admin dan ISP |
| Environment | Localhost UAT (`localhost:5173` + backend `127.0.0.1:8080`), bukan produksi |
| Status | Selesai dieksekusi di localhost — lulus dengan catatan |

## Tujuan

Memastikan akun ISP dapat melihat data pelanggan yang ditugaskan, melihat
kontrak/lokasi terkait, melihat dan membuka dokumen individual, serta
mengunggah dokumen. ISP tidak boleh melihat data pelanggan lain, folder Drive,
atau fitur internal admin.

## Data Uji

Siapkan data berikut di environment UAT:

- `ISP-UAT-A`: akun role `isp` yang ditugaskan ke `Pelanggan UAT A`;
- `ISP-UAT-B`: akun role `isp` yang ditugaskan ke `Pelanggan UAT B`;
- satu pelanggan tanpa penugasan ke kedua akun tersebut;
- minimal satu kontrak/lokasi dan satu dokumen untuk masing-masing pelanggan;
- satu berkas baru `UAT-ISP-20260725.txt` untuk skenario upload.

Gunakan password sementara yang berbeda untuk setiap akun dan hapus/nonaktifkan
data uji setelah UAT selesai. Jangan memakai pelanggan atau dokumen produksi.

## Skenario UAT

| ID | Skenario | Langkah ringkas | Hasil yang diharapkan |
|---|---|---|---|
| ISP-01 | Membuat akun ISP | Admin membuka Kelola Pengguna, membuat akun dengan role ISP | Akun berhasil dibuat dan tampil sebagai ISP |
| ISP-02 | Menugaskan pelanggan | Admin mengedit akun ISP dan memilih Pelanggan UAT A | Penugasan tersimpan; pelanggan dapat dibaca akun tersebut |
| ISP-03 | Login ISP | Login memakai akun ISP-UAT-A | Login berhasil dan hanya menu Portal ISP tampil |
| ISP-04 | Tanpa penugasan | Login akun ISP yang belum diberi pelanggan | Portal kosong dan menampilkan instruksi menghubungi admin |
| ISP-05 | Ringkasan pelanggan | Buka halaman Ringkasan | Hanya profil Pelanggan UAT A dan jumlah kontraknya tampil |
| ISP-06 | Daftar kontrak/lokasi | Buka Kontrak & Lokasi | Hanya kontrak/lokasi Pelanggan UAT A tampil; data B tidak tampil |
| ISP-07 | Daftar dokumen | Buka Dokumen | Dokumen pelanggan/kontrak A tampil dengan kategori dan waktu unggah |
| ISP-08 | Buka file individual | Klik Buka dokumen | File Google Drive terbuka; tidak ada tombol/tautan folder |
| ISP-09 | Upload ke kontrak | Pilih kontrak A, kategori, dan berkas UAT lalu upload | Upload berhasil dan file muncul di daftar dokumen A |
| ISP-10 | Upload ke pelanggan | Pilih Pelanggan A dan upload berkas | Upload berhasil dan file terkait pelanggan A muncul |
| ISP-11 | Upload lintas pelanggan | Paksa request upload memakai ID pelanggan/kontrak B | Backend menolak request; tidak ada file atau metadata baru |
| ISP-12 | Akses URL lintas pelanggan | Ubah parameter API menjadi ID pelanggan/kontrak B | Backend mengembalikan 403/404; data B tidak bocor |
| ISP-13 | Endpoint admin | ISP memanggil dashboard, users, create/edit/delete kontrak, dan peta | Request ditolak; tidak ada akses admin atau perubahan data |
| ISP-14 | Folder tidak terekspos | Periksa respons API pelanggan, kontrak, dan dokumen | ISP tidak menerima `link_folder_berkas` atau `drive_folder_id` |
| ISP-15 | Akun dinonaktifkan | Admin menonaktifkan ISP-UAT-A lalu akun mencoba login | Login ditolak; sesi lama tidak lagi berlaku |
| ISP-16 | Penugasan lebih dari satu pelanggan | Admin menambahkan Pelanggan B ke ISP-UAT-A | Portal menampilkan A dan B; pelanggan lain tetap tersembunyi |
| ISP-17 | Pembersihan UAT | Hapus dokumen uji melalui admin/alat cleanup dan nonaktifkan akun | Tidak ada data uji tertinggal; data produksi tidak berubah |

## Pemeriksaan API minimum

Dengan token ISP, verifikasi:

```text
GET  /api/pelanggan
GET  /api/kontrak-lengkap
GET  /api/isp/dokumen
POST /api/dokumen
GET  /api/dashboard       -> ditolak
GET  /api/users           -> ditolak
GET  /api/titik-peta      -> ditolak
```

Untuk setiap respons ISP, pastikan tidak ada tautan folder Drive. Untuk upload,
pastikan backend memeriksa `user_pelanggan_access`, bukan hanya menyembunyikan
pilihan pelanggan di frontend.

## Kriteria penerimaan

- ISP hanya dapat membaca pelanggan yang ditugaskan.
- Kontrak/lokasi dan dokumen mengikuti cakupan pelanggan yang sama.
- File dapat dibuka melalui tautan file individual.
- Upload berhasil untuk pemilik yang diizinkan dan ditolak untuk pemilik lain.
- Tidak ada tautan atau ID folder Drive pada respons portal ISP.
- Endpoint admin dan data lintas pelanggan terlindungi di backend.
- Cleanup selesai tanpa perubahan data produksi.

## Form hasil eksekusi

Eksekusi backend dan browser lokal telah dicatat pada
[`Laporan_UAT_ISP_2026-07-25.md`](./Laporan_UAT_ISP_2026-07-25.md). Seluruh
skenario backend komplit (14 skenario) dan pemeriksaan UI utama lulus. Data
sementara sudah dibersihkan; akun uji dinonaktifkan.

| ID | Hasil (Lulus/Gagal) | Bukti | Catatan |
|---|---|---|---|
| ISP-01 s.d. ISP-17 | Lulus | Laporan UAT dan runner backend/browser | ISP-01 s.d. ISP-03, ISP-05 s.d. ISP-10, dan ISP-15 s.d. ISP-17 dijalankan dengan dataset sementara; ISP-04, ISP-11 s.d. ISP-14 dan pemeriksaan teknis juga lulus. |

## Keputusan UAT

- [ ] Diterima
- [x] Diterima dengan catatan
- [ ] Ditolak dan perlu perbaikan

Catatan penguji: UAT lokal lulus. Gunakan `http://localhost:5173` karena
konfigurasi CORS frontend/backend tidak mengizinkan host `127.0.0.1:5173`.
Kredensial Dev Access ISP pada environment development perlu diperbarui bila
ingin melakukan login manual tanpa akun UAT sementara.

______________________________________________________________________________

______________________________________________________________________________
