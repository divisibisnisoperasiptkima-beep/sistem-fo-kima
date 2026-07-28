# Laporan UAT Admin & Teknisi — 23 Juli 2026

## Ringkasan

Audit telah dijalankan terhadap source, build, MySQL live, API, dan browser lokal melalui Playwright.

| Metrik | Nilai |
|---|---:|
| Skenario lulus | 22 |
| Skenario gagal | 0 |
| Skenario ditunda | 1 |
| Skenario sebagian | 1 |
| Temuan kritis | 0 |

## Hasil Lulus

| ID | Hasil | Bukti |
|---|---|---|
| TECH-01 | Lulus | `cargo check` backend berhasil. |
| TECH-02 | Lulus | `npm run lint` dan `npm run build` frontend berhasil. |
| DASH-01 | Lulus | MySQL live: 16 pelanggan, 56 kontrak aktif, 145 Core tersewa pada 12 lokasi dedicated, kapasitas 384, Core tersedia 239. |
| AUTH-02 | Lulus | Login API `teknisi@kima.dev` berhasil dan endpoint peta mengembalikan 200. |
| AUTH-01 | Lulus | Login API admin berhasil; endpoint dashboard, pelanggan, kontrak, pengguna, dan peta tetap mengembalikan 200 setelah perbaikan role teknisi. |
| MAP-01 | Lulus | Database menghasilkan 112 kombinasi pelanggan + nama lokasi yang unik dan endpoint peta dapat diakses teknisi. |
| MAP-03 | Lulus | Dua titik lokasi UAT dibuat pada kontrak Berhenti, kemudian dimuat ulang; keduanya dibersihkan. |
| MAP-04 | Lulus | Satu dari dua titik UAT berhasil diubah dan dihapus; titik lainnya tetap ada sebelum cleanup. |
| MAP-05 | Lulus (API) | Titik ISP berlabel UAT berhasil dibuat, dimuat ulang untuk mengambil ID-nya, dan dihapus. |
| ROLE-01 | Lulus (browser) | Login Dev Access teknisi hanya menampilkan halaman tabel Titik Peta FO KIMA; tidak ada menu bisnis lain. |
| MAP-02 | Lulus (browser) | Membuka baris Indosat / Core 15C memuat konteks peta yang tepat pada sidebar, bukan daftar semua lokasi. |
| MAP-06 | Lulus (browser) | Dengan sidebar terbuka (lebar 320 px), marker pelanggan terlihat pada area peta di kanan sidebar. |
| DASH-02 | Lulus (browser) | Modal Rincian menampilkan kolom yang diminta serta total 19 / 12 / 12 / 1 / 145. |
| AUTH-04 | Lulus (browser) | Akun UAT yang telah dinonaktifkan ditolak saat login dengan respons HTTP 401. |
| USER-01 | Lulus (browser) | Akun teknisi UAT dibuat, dinonaktifkan, tampil berstatus Nonaktif, dan tidak lagi dapat login. |
| CUST-01 | Lulus (browser) | Pelanggan `UAT Lifecycle 20260723` dibuat dengan folder Drive, kemudian berhasil dibersihkan setelah seluruh kontrak dihapus. |
| CONTRACT-01 | Lulus (browser) | Dua kontrak UAT berhasil dibuat pada pelanggan uji; setiap record menerima tautan folder Drive periode. |
| CONTRACT-02 | Lulus (browser) | Perpanjangan membuat record baru; kontrak lama menjadi `Diperpanjang` dan record baru mempertahankan nilai/harga yang diinput. |
| CONTRACT-03 | Lulus (browser) | Upgrade pada kontrak aktif memotong periode lama hingga 22 Juli (`Di-upgrade`) dan membuat record 2 Core mulai 23 Juli, termasuk nilai periode aktif prorata Rp1.500.000. |
| DOC-01 | Lulus (browser) | Berkas teks UAT diunggah ke kategori Dokumen Lain pada kontrak Indosat; API mengembalikan 201 dan metadata/tautan Drive tampil di UI. |
| DOC-02 | Lulus (browser) | Dokumen UAT dihapus; API mengembalikan 204, daftar dokumen kembali kosong, dan berkas lokal uji dihapus. |

## Audit Database

| Area | Hasil |
|---|---|
| Akun Dev Access teknisi | `teknisi@kima.dev`, role `teknisi`, aktif. |
| Lokasi unik untuk tabel peta | 112 kombinasi pelanggan + nama lokasi. |
| Titik ISP | 1 data. |
| Titik lokasi detail | 0 data. Ini bukan kegagalan migrasi: 2 record titik lama tidak mempunyai koordinat. |
| Sharing Core aktif | 1/32: 19; 1/16: 12; 1/8: 12; 1/4: 1. |

## Batasan Pengujian

- Backend mengizinkan origin `http://localhost:5173`; membuka frontend dengan `http://127.0.0.1:5173` akan gagal login karena CORS. Ini hanya konfigurasi origin lokal, bukan kegagalan fitur.
- UAT marker tambah/edit/hapus telah lulus melalui API. Input browser untuk menambahkan marker tampil dan meminta label, tetapi pembuatan marker melalui klik koordinat peta belum diotomasi karena data uji harus selalu dibersihkan.
- Lifecycle pelanggan/kontrak menggunakan pelanggan `UAT Lifecycle 20260723`, dua lokasi, lima record kontrak, dan folder Drive khusus UAT. Semua kontrak, folder periode, folder pelanggan, dan data MySQL uji telah dihapus; pencarian akhir mengembalikan 16 pelanggan dan 0 kontrak UAT.
- Tidak ada data pelanggan, kontrak, titik, atau dokumen UAT yang tersisa di MySQL setelah cleanup.
- UAT tulis memakai kontrak Berhenti tanpa titik detail, dengan label `UAT ...`; semua titik sementara telah dihapus setelah masing-masing skenario.

## Temuan

| ID | Severity | Temuan | Bukti | Rekomendasi |
|---|---|---|---|---|
| UAT-001 | Ditutup | Pembatasan role teknisi sebelumnya baru berada pada UI; API data bisnis masih dapat dibaca oleh teknisi. | Retest runtime pada backend source terbaru: `/api/titik-peta` = 200; `/api/dashboard`, `/api/pelanggan`, `/api/kontrak-lengkap`, dan `/api/users` = 403. | Tidak ada tindakan lanjutan. Pertahankan retest ini pada perubahan role berikutnya. |
| UAT-002 | Ditutup | Login akun nonaktif sebelumnya menampilkan pesan generik “Sesi berakhir. Silakan login ulang.” | Retest backend: `POST /api/auth/login` akun nonaktif mengembalikan 401 dengan pesan “Akun Anda sudah dinonaktifkan. Hubungi administrator.” Frontend kini meneruskan pesan 401 untuk request login tanpa token. | Tidak ada tindakan lanjutan; restart backend lokal sebelum retest browser. |

## Skenario Berikutnya

1. Fitur ISP sudah dilanjutkan pengembangannya dan pengujian hak akses ISP
   telah dieksekusi di localhost; lihat `Laporan_UAT_ISP_2026-07-25.md` untuk
   hasil backend dan browser.
2. Bila diperlukan, verifikasi aturan admin aktif terakhir pada lingkungan staging yang memiliki minimal dua admin uji; jangan menonaktifkan admin produksi.

## Keputusan UAT

**Diterima untuk cakupan admin dan teknisi.** Tidak ada kegagalan build, inkonsistensi data dashboard, pelanggaran akses teknisi, maupun kegagalan pada alur browser/API yang telah diuji. Pada saat laporan ini dibuat UAT ISP masih ditunda; fitur ISP kemudian dilanjutkan pengembangannya dan telah memiliki laporan UAT lokal terpisah. Pengujian admin aktif terakhir dijadwalkan untuk staging.
