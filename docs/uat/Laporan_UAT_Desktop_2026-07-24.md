# Laporan UAT Desktop — Sistem FO KIMA

## Informasi Pengujian

| Item | Nilai |
|---|---|
| Tanggal | 24 Juli 2026 |
| Metode | UAT manual melalui browser desktop |
| Resolusi | 1440 × 900 px |
| Environment | Environment UAT yang disetujui |
| Role diuji | Admin dan Teknisi |
| Data uji | `UAT_DESKTOP_20260724` |

## Ringkasan Hasil

| Status | Jumlah |
|---|---:|
| Lulus | 13 |
| Gagal | 0 |
| Bukti tampilan/observasi | 4 |

Seluruh skenario yang diuji lulus setelah retest perbaikan upgrade kontrak. Temuan UAT-20260724-01 ditutup: tanggal upgrade yang sama atau lebih awal dari awal kontrak kini ditolak secara aman sebelum ada perubahan data.

## Bukti Tampilan Awal

### AUTH-00 — Halaman login

![Halaman login desktop](bukti-screenshot-desktop-2026-07-24/AUTH-00-halaman-login-desktop.png)

### AUTH-01 — Login Admin dan Dashboard

**Hasil:** Lulus. Admin dapat masuk dan Dashboard tampil.

![Dashboard Admin](bukti-screenshot-desktop-2026-07-24/AUTH-01-dashboard-admin-desktop.png)

### DASH-02 — Rincian Core Tersewa

**Hasil:** Lulus. Modal rincian dan total Core tampil.

![Rincian Core](bukti-screenshot-desktop-2026-07-24/DASH-02-rincian-core-desktop.png)

### AUTH-02 — Pembatasan menu Teknisi

**Hasil:** Lulus. Setelah login sebagai Teknisi, hanya menu Titik Peta tersedia.

![Menu Teknisi](bukti-screenshot-desktop-2026-07-24/AUTH-02-menu-teknisi-titik-peta-desktop.png)

## Eksekusi Dengan Data UAT

### CUST-01 — Buat pelanggan UAT

**Data:** `UAT_DESKTOP_20260724`.

**Hasil:** Lulus. Pelanggan baru berhasil dibuat, dapat dicari pada tabel, dan kemudian dibersihkan setelah seluruh kontraknya dihapus.

![Form pelanggan terisi](bukti-screenshot-desktop-2026-07-24/CUST-01-form-pelanggan-terisi-desktop.png)

![Pelanggan berhasil tersimpan](bukti-screenshot-desktop-2026-07-24/CUST-01-pelanggan-berhasil-tersimpan-desktop.png)

### CONTRACT-01 — Buat kontrak dan unggah dokumen

**Data:** lokasi `UAT Lokasi Perpanjangan`, 1 Core, periode 24 Juli 2026–24 Juli 2027.

**Hasil:** Lulus. Kontrak dibuat dengan folder Drive dan dokumen uji berhasil diunggah.

![Form kontrak terisi](bukti-screenshot-desktop-2026-07-24/CONTRACT-01-form-kontrak-uat-terisi-desktop.png)

![Dokumen kontrak terunggah](bukti-screenshot-desktop-2026-07-24/DOC-01-dokumen-kontrak-uat-terunggah-desktop.png)

### CONTRACT-03 — Perpanjangan kontrak

**Hasil:** Lulus. Sistem membentuk record periode baru; record induk berubah menjadi `Diperpanjang` dan record baru berstatus `Belum Beroperasi` sesuai tanggal mulai periode berikutnya.

![Form perpanjangan](bukti-screenshot-desktop-2026-07-24/CONTRACT-03-form-perpanjangan-uat-desktop.png)

![Hasil perpanjangan](bukti-screenshot-desktop-2026-07-24/CONTRACT-03-hasil-perpanjangan-uat-desktop.png)

### CONTRACT-04 — Upgrade paket kontrak

**Data:** lokasi `UAT Lokasi Upgrade`, perubahan dari 1 Core menjadi 2 Core.

**Hasil awal:** Gagal. Saat tombol **Upgrade Paket** disimpan dengan tanggal efektif sama dengan awal kontrak, API merespons HTTP 500 karena constraint `chk_lokasi_periode`.

![Form upgrade dan simulasi prorata](bukti-screenshot-desktop-2026-07-24/CONTRACT-04-form-upgrade-uat-desktop.png)

![Bukti kegagalan upgrade](bukti-screenshot-desktop-2026-07-24/CONTRACT-04-upgrade-gagal-database-desktop.png)

**Retest perbaikan (24 Juli 2026): Lulus.** Form membatasi tanggal minimum ke satu hari setelah `periode_awal`, lalu menampilkan pesan yang dapat ditindaklanjuti bila tanggal sama dipaksakan untuk diuji. Backend juga menolak permintaan yang sama dengan HTTP 400 dan pesan yang identik, tanpa mengubah kontrak. Perubahan pada hari pertama diarahkan menggunakan fitur edit kontrak.

![Validasi tanggal upgrade](bukti-screenshot-desktop-2026-07-24/CONTRACT-04-validasi-tanggal-upgrade-desktop.png)

### CONTRACT-06 — Upgrade Sharing Core

**Data:** kontrak sementara `UAT Sharing Core 20260724SC`, perubahan rasio dari `1/16` menjadi `1/8` pada 24 Juli 2026.

**Hasil: Lulus.** Kontrak induk berstatus `Di-upgrade` dan dipotong hingga 23 Juli 2026. Record baru terbentuk berstatus `Beroperasi`, periode 24 Juli–23 Agustus 2026, dengan kapasitas `Sharing 1/8` dan nilai per bulan Rp2.400.000.

![Form upgrade Sharing Core](bukti-screenshot-desktop-2026-07-24/CONTRACT-06-form-upgrade-sharing-core-desktop.png)

![Hasil upgrade Sharing Core](bukti-screenshot-desktop-2026-07-24/CONTRACT-06-hasil-upgrade-sharing-core-desktop.png)

### DOC-02 — Hapus dokumen UAT

**Hasil:** Lulus. Dokumen uji dihapus dari aplikasi dan Drive; API mengembalikan HTTP 204.

![Dokumen setelah dihapus](bukti-screenshot-desktop-2026-07-24/DOC-02-dokumen-uat-terhapus-desktop.png)

### DRIVE-01 sampai DRIVE-03 — Verifikasi integrasi Google Drive

**Data:** pelanggan dan kontrak sementara `UAT Drive 20260724DRV`, dokumen `UAT-Drive-20260724.txt`.

**Hasil: Lulus.** Backend membuat folder pelanggan dan folder periode kontrak pada Google Drive. Dokumen kategori `Kontrak` berhasil diunggah dan tautan file dapat dibuka langsung di Google Drive. Setelah dokumen dihapus melalui API (HTTP 204), tautan file mengembalikan HTTP 404/"Halaman Tidak Ditemukan", sehingga penghapusan pada Drive terverifikasi.

![File uji terbuka di Google Drive](bukti-screenshot-desktop-2026-07-24/DRIVE-01-file-uji-terbuka-google-drive-desktop.png)

![Folder kontrak di Google Drive](bukti-screenshot-desktop-2026-07-24/DRIVE-02-folder-kontrak-google-drive-desktop.png)

![File uji terhapus dari Google Drive](bukti-screenshot-desktop-2026-07-24/DRIVE-03-file-uji-terhapus-google-drive-desktop.png)

### MAP-03 — Tambah dan hapus titik lokasi

**Data:** label `UAT Titik Lokasi A` pada lokasi UAT.

**Hasil:** Lulus. Titik dibuat dari klik peta, label tersimpan, marker tampil pada sidebar, lalu titik dihapus kembali saat cleanup.

![Form titik lokasi](bukti-screenshot-desktop-2026-07-24/MAP-03-form-titik-lokasi-uat-desktop.png)

![Titik lokasi tersimpan](bukti-screenshot-desktop-2026-07-24/MAP-03-titik-lokasi-uat-tersimpan-desktop.png)

### USER-01 dan USER-03 — Buat dan nonaktifkan pengguna

**Data:** akun Teknisi UAT (alamat email disamarkan pada dokumen distribusi bila diperlukan).

**Hasil:** Lulus. Akun dibuat sebagai Teknisi, kemudian dinonaktifkan. Percobaan login memakai akun tersebut ditolak dengan pesan bahwa akun sudah dinonaktifkan.

![Form pengguna terisi](bukti-screenshot-desktop-2026-07-24/USER-01-form-pengguna-uat-terisi-desktop.png)

![Konfirmasi nonaktifkan pengguna](bukti-screenshot-desktop-2026-07-24/USER-03-konfirmasi-nonaktifkan-uat-desktop.png)

![Login akun nonaktif ditolak](bukti-screenshot-desktop-2026-07-24/AUTH-03-login-akun-nonaktif-uat-desktop.png)

## Observasi Halaman Lain

| ID | Area | Hasil | Bukti |
|---|---|---|---|
| CUST-00 | Daftar Pelanggan | Tabel, pencarian, dan aksi tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/CUST-00-daftar-pelanggan-desktop.png) |
| CONTRACT-00 | Daftar Kontrak | Tabel, filter status, pencarian, dan aksi tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/CONTRACT-00-daftar-kontrak-desktop.png) |
| CONTRACT-05 | Monitoring Kontrak | Tabel monitoring tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/CONTRACT-05-monitoring-kontrak-desktop.png) |
| MAP-01 | Titik Peta | Tabel pelanggan/lokasi tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/MAP-01-daftar-titik-peta-desktop.png) |
| MAP-02 | Peta dan sidebar | Konteks pelanggan/lokasi pada sidebar tampil. | [gambar](bukti-screenshot-desktop-2026-07-24/MAP-02-peta-sidebar-desktop.png) |
| MAP-05 | Titik tetap ISP | Mode tambah titik tetap ISP tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/MAP-05-mode-tambah-titik-isp-desktop.png) |
| USER-00 | Kelola Pengguna | Tabel pengguna dan aksi manajemen tersedia. | [gambar](bukti-screenshot-desktop-2026-07-24/USER-00-daftar-pengguna-desktop.png) |

## Temuan

| ID | Severity | Status | Deskripsi | Bukti |
|---|---|---|---|---|
| UAT-20260724-01 | Tinggi | Ditutup | Penyebab: tanggal upgrade sama dengan awal kontrak membuat periode lama berakhir sebelum dimulai. Perbaikan: validasi frontend dan backend mewajibkan tanggal upgrade setelah awal kontrak. Retest API menghasilkan HTTP 400 dengan pesan yang jelas, tanpa perubahan data. | [screenshot retest](bukti-screenshot-desktop-2026-07-24/CONTRACT-04-validasi-tanggal-upgrade-desktop.png) |

## Cleanup

- Dokumen uji telah dihapus melalui aplikasi (HTTP 204).
- Dokumen, folder kontrak, dan folder pelanggan UAT Drive telah dihapus; pencarian akhir tidak menemukan kontrak UAT Drive.
- Titik lokasi `UAT Titik Lokasi A` telah dihapus melalui aplikasi.
- Kontrak UAT perpanjangan, record hasil perpanjangan, dan kontrak UAT upgrade telah dihapus melalui aplikasi.
- Kontrak induk dan record hasil upgrade Sharing Core (`1/16` → `1/8`), serta pelanggan UAT-nya, telah dihapus melalui aplikasi.
- Pelanggan `UAT_DESKTOP_20260724` telah dihapus setelah tidak lagi memiliki kontrak.
- Akun Teknisi UAT sengaja dibiarkan berstatus **Nonaktif**, karena fungsi hapus pengguna pada aplikasi merupakan penonaktifan untuk menjaga audit trail.
- Berkas lokal `UAT-Dokumen-20260724.txt` dipertahankan sebagai artefak bukti UAT; berkas tersebut tidak lagi tersimpan di Google Drive atau database.

## Keputusan UAT

- [x] Diterima dengan catatan
- [ ] Perlu perbaikan sebelum skenario upgrade kontrak dapat diterima

Skenario upgrade yang sebelumnya gagal telah diretest dan aman terhadap tanggal efektif yang tidak valid. Upgrade pada hari berikutnya tetap menjadi alur yang valid; perubahan pada hari pertama kontrak diarahkan ke edit kontrak.
