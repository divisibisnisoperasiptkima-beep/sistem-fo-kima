# Portal ISP

## Hak akses

Administrator menugaskan satu atau lebih pelanggan ke akun ber-role `isp`
melalui menu **Kelola Pengguna**. Penugasan tersebut disimpan pada tabel
`user_pelanggan_access` dan digunakan oleh backend sebagai batas data utama.

## Tampilan ISP

Portal ISP memiliki tiga halaman baca:

- **Ringkasan**: pelanggan yang ditugaskan serta jumlah kontrak beroperasi dan
  belum beroperasi;
- **Kontrak & Lokasi**: kontrak/lokasi milik pelanggan yang ditugaskan;
- **Dokumen**: daftar file dokumen untuk seluruh pelanggan/kontrak yang
  ditugaskan, dengan tombol **Preview** dan **Download**.

Tautan atau ID folder Google Drive tidak dikirim ke tampilan ISP. Dokumen dibuka
melalui endpoint backend yang memeriksa sesi dan hak akses pelanggan terlebih dahulu.

## Upload dokumen

Akun ISP dapat mengunggah file ke salah satu pelanggan atau kontrak/lokasi
yang ditugaskan kepadanya. Backend memverifikasi kepemilikan pelanggan sebelum
membuat folder kategori dan mengunggah file ke Google Drive. ISP tidak dapat
mengubah, mengganti nama, atau menghapus dokumen melalui portal ini.

## Endpoint

- `GET /api/pelanggan` dan `GET /api/kontrak-lengkap`: otomatis difilter
  menurut `user_pelanggan_access`; kolom folder disembunyikan dari respons ISP.
- `GET /api/isp/dokumen`: dokumen lintas pelanggan yang diizinkan, tanpa ID
  folder Drive.
- `GET /api/dokumen/{id}/preview`: preview PDF/gambar setelah verifikasi akses.
- `GET /api/dokumen/{id}/download`: download file asli setelah verifikasi akses.
- `POST /api/dokumen`: ISP dapat mengunggah hanya ke pemilik yang diizinkan.
- `GET`/`PUT /api/users/{id}/pelanggan-access`: hanya admin, untuk membaca dan
  menetapkan pelanggan ke akun ISP.
