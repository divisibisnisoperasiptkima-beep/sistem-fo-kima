# Matriks Skenario UAT

| ID | Area | Skenario | Hasil yang Diharapkan | Status | Bukti/Temuan |
|---|---|---|---|---|---|
| AUTH-01 | Auth | Login admin valid | Admin masuk ke aplikasi | Lulus | Login API berhasil; endpoint dashboard, pelanggan, kontrak, pengguna, dan peta semuanya 200. |
| AUTH-02 | Auth | Login teknisi valid | Teknisi dapat memperoleh sesi valid | Lulus | API dan login Dev Access browser berhasil. |
| AUTH-03 | Auth | Login ISP valid | ISP hanya melihat pelanggan yang diberi akses | Lulus (browser/API) | Fitur ISP sudah dikembangkan dan diuji melalui portal lokal; detail skenario, pembatasan akses, dokumen, dan upload ada di `Laporan_UAT_ISP_2026-07-25.md`. |
| AUTH-04 | Auth | Login akun nonaktif | Login ditolak | Lulus (retest) | Akun UAT dinonaktifkan lalu login ditolak HTTP 401 dengan pesan spesifik bahwa akun dinonaktifkan. |
| ROLE-01 | Role | Teknisi membuka menu | Hanya menu Titik Peta tersedia | Lulus (browser) | Setelah login, hanya halaman/tabel Titik Peta FO KIMA yang tersedia. |
| ROLE-02 | Role | Teknisi memanggil endpoint admin | Akses ditolak | Lulus | Retest: dashboard, pelanggan, kontrak, dan pengguna semuanya 403; Titik Peta tetap 200. |
| CUST-01 | Pelanggan | Buat pelanggan valid | Profil dan folder pelanggan dibuat | Lulus (browser) | Pelanggan UAT dibuat dengan link folder Google Drive; seluruh data uji dan foldernya dibersihkan setelah test. |
| CONTRACT-01 | Kontrak | Buat kontrak lokasi | Kontrak dan histori tersimpan | Lulus (browser) | Dua kontrak lokasi UAT dibuat dan masing-masing memiliki link folder Drive periode. |
| CONTRACT-02 | Kontrak | Perpanjang kontrak | Record baru dibuat, record lama tetap tersimpan | Lulus (browser) | Kontrak lama berubah `Diperpanjang`; record lanjutannya tersimpan dengan periode/harga baru. |
| CONTRACT-03 | Kontrak | Upgrade kontrak | Record baru dan periode lama sesuai aturan | Lulus (browser) | Record lama dipotong sampai 22 Juli dan `Di-upgrade`; record baru 2 Core mulai 23 Juli dengan prorata Rp1.500.000. |
| MAP-01 | Peta | Tabel Titik Peta dibuka | Lokasi unik per pelanggan + nama lokasi | Lulus | Database menghasilkan 112 kombinasi unik; endpoint peta dapat diakses teknisi. |
| MAP-02 | Peta | Buka peta dari satu baris | Hanya lokasi/kontrak baris tersebut yang dimuat | Lulus (browser) | Baris Indosat / Core 15C memuat konteks sidebar yang sama, tanpa daftar lokasi kontrak lain. |
| MAP-03 | Peta | Tambah dua titik lokasi | Dua marker dan label tersimpan | Lulus | API: dua titik UAT tersimpan dan dapat dimuat ulang; dibersihkan setelah test. |
| MAP-04 | Peta | Edit/hapus satu titik lokasi | Titik lain tidak berubah | Lulus | API: titik A diubah lalu dihapus; titik B tetap ada; seluruh data UAT dibersihkan. |
| MAP-05 | Peta | Tambah titik ISP berlabel | Label langsung tampil pada marker/sidebar | Lulus (API) | Titik ISP berlabel UAT tersimpan, termuat ulang, lalu dihapus. Tampilan marker perlu verifikasi browser. |
| MAP-06 | Peta | Sidebar dibuka saat fit peta | Semua marker tetap terlihat dan tidak tertutup sidebar | Lulus (browser) | Marker pelanggan terlihat di area kanan dari sidebar 320 px saat peta dibuka. |
| DASH-01 | Dashboard | Validasi card Core Tersewa | Angka sama dengan query database aktif | Lulus | MySQL: 145 Core, 12 lokasi dedicated, kapasitas 384, tersedia 239. |
| DASH-02 | Dashboard | Buka Rincian Core Tersewa | Tabel pelanggan, 1/32, 1/16, 1/8, 1/4, Core, dan Total tampil | Lulus (browser) | Modal menampilkan 11 pelanggan dan total 19 / 12 / 12 / 1 / 145. |
| USER-01 | Pengguna | Nonaktifkan akun | Akun tidak dapat login, audit tetap aman | Lulus (browser) | Akun teknisi UAT dibuat, berstatus Nonaktif setelah aksi, lalu ditolak ketika login. |
| USER-02 | Pengguna | Nonaktifkan admin aktif terakhir | Operasi ditolak | Sebagian | Sistem menolak admin menonaktifkan akun sendiri. Aturan admin aktif terakhir belum diuji karena hanya ada satu admin aktif produksi; jadwalkan di staging dengan dua admin uji. |
| DOC-01 | Dokumen | Upload dokumen data uji | File dan metadata tersimpan di Drive/MySQL | Lulus (browser) | `UAT-Dokumen-20260723.txt` diunggah pada kontrak Indosat kategori Dokumen Lain; API 201 dan tautan Drive tampil. |
| DOC-02 | Dokumen | Hapus dokumen data uji | File dan metadata terhapus sesuai izin | Lulus (browser) | Delete dokumen mengembalikan API 204; daftar dokumen kosong kembali dan berkas uji lokal dihapus. |
| TECH-01 | Teknis | `cargo check` | Backend lulus kompilasi | Lulus | 23 Juli 2026. |
| TECH-02 | Teknis | `npm run lint` dan `npm run build` | Frontend lulus validasi | Lulus | 23 Juli 2026. |
