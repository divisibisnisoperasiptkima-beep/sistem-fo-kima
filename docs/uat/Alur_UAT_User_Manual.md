# Alur UAT User Manual — Sistem FO KIMA

Dokumen ini digunakan oleh user/business owner untuk menjalankan User Acceptance Test (UAT) secara manual melalui browser dan mengumpulkan bukti screenshot.

## 1. Informasi Pengujian

Isi sebelum mulai:

| Item | Isi |
|---|---|
| Tanggal pengujian |  |
| Nama penguji |  |
| Role yang diuji | Admin / Teknisi / ISP |
| URL aplikasi |  |
| Browser dan versi |  |
| Environment | Staging/UAT, bukan produksi |
| Nomor versi aplikasi |  |

## 2. Aturan Pengujian

1. Gunakan akun dan data khusus UAT. Jangan mengubah atau menghapus data produksi.
2. Siapkan minimal satu akun Admin dan satu akun Teknisi. Uji ISP hanya jika role dan pembagian pelanggan ISP sudah aktif.
3. Gunakan nama data yang mudah dikenali, misalnya `UAT_NamaPenguji_Tanggal`.
4. Setelah skenario selesai, simpan screenshot dengan nama sesuai kode bukti, misalnya `AUTH-01-login-admin.png`.
5. Untuk setiap skenario, catat hasil **Lulus**, **Gagal**, atau **Diblokir**. Jika gagal, jangan langsung menghapus data sebelum screenshot dan catatan selesai.
6. Tutup sesi dengan logout. Jangan menyimpan password di screenshot atau laporan.

## 3. Data Uji yang Disiapkan

- Akun Admin UAT: email, password sementara, status aktif.
- Akun Teknisi UAT: email, password sementara, status aktif.
- Satu pelanggan UAT.
- Satu kontrak lokasi UAT yang dapat diperpanjang dan di-upgrade.
- Dua koordinat titik peta UAT dan satu label titik ISP UAT.
- Satu file uji kecil, misalnya `UAT-Dokumen.pdf` atau `UAT-Dokumen.txt`.
- Nilai contoh untuk kontrak: nomor kontrak, periode mulai/selesai, lokasi, kapasitas/core, nilai kontrak, dan kategori dokumen.

## 4. Alur Eksekusi End-to-End

### A. Login dan hak akses

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| AUTH-01 | Buka URL aplikasi, login dengan Admin UAT | Login berhasil dan Dashboard tampil | Screenshot halaman login sebelum submit dan Dashboard setelah login |
| AUTH-02 | Logout, login dengan Teknisi UAT | Login berhasil dan hanya menu Titik Peta yang tersedia | Screenshot menu Teknisi dan halaman Titik Peta |
| AUTH-03 | Login dengan akun nonaktif | Login ditolak dan pesan akun nonaktif tampil | Screenshot pesan penolakan |
| ROLE-01 | Sebagai Teknisi, coba buka URL/menu Dashboard, Pelanggan, Kontrak, atau Kelola Pengguna | Menu tidak tersedia atau akses ditolak; Titik Peta tetap dapat dibuka | Screenshot akses ditolak atau menu yang tidak tersedia |

### B. Dashboard

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| DASH-01 | Sebagai Admin, buka Dashboard | Card Pelanggan, Kontrak Aktif, Core Tersewa, dan Core Tersedia tampil tanpa error | Screenshot seluruh area card |
| DASH-02 | Pada card **Core Tersewa**, klik **Rincian** | Modal menampilkan pelanggan, sharing core 1/32, 1/16, 1/8, 1/4, Core, dan Total | Screenshot modal rincian sampai baris Total |
| DASH-03 | Bandingkan angka card dengan sumber data/query yang disepakati | Angka dashboard sama dengan data sumber pada waktu pengujian | Screenshot Dashboard dan bukti sumber data/query, jika tersedia |

### C. Pelanggan

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| CUST-01 | Buka **Pelanggan**, klik **Tambah Pelanggan**, isi seluruh field wajib, lalu simpan | Pelanggan baru muncul di tabel dan folder/link Drive terbentuk jika fitur digunakan | Screenshot form terisi sebelum simpan dan data berhasil tampil |
| CUST-02 | Buka aksi **Edit** pada pelanggan UAT, ubah satu field, simpan | Perubahan tersimpan dan tampil di tabel/detail | Screenshot sebelum dan sesudah edit |
| CUST-03 | Buka aksi hapus/nonaktif sesuai prosedur, batalkan dahulu, lalu konfirmasi hanya pada data UAT | Pembatalan tidak mengubah data; konfirmasi menghasilkan status/data yang sesuai aturan bisnis | Screenshot dialog konfirmasi dan hasil akhir |

### D. Kontrak dan siklus hidup kontrak

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| CONTRACT-01 | Buka **Kontrak Lengkap**, klik **Tambah Kontrak**, pilih pelanggan UAT, isi lokasi, periode, core, nilai, dan data wajib, lalu simpan | Kontrak muncul di tabel dengan status dan nilai yang benar | Screenshot form sebelum simpan dan baris kontrak setelah simpan |
| CONTRACT-02 | Pada kontrak UAT, pilih **Edit**, ubah data yang diizinkan, simpan | Data kontrak berubah sesuai input tanpa mengubah pelanggan yang salah | Screenshot form edit dan hasil tabel |
| CONTRACT-03 | Pilih aksi **Perpanjang Kontrak**, isi kode/periode/nilai kontrak baru, simpan | Record kontrak baru tercipta; kontrak lama tetap tersimpan dengan status **Diperpanjang** | Screenshot modal perpanjangan dan tabel yang memperlihatkan record lama + baru |
| CONTRACT-04 | Pilih aksi **Upgrade Paket Kontrak**, isi tanggal efektif, paket/core baru, dan nilai prorata, simpan | Kontrak lama berakhir sesuai aturan; record upgrade baru mulai pada tanggal efektif | Screenshot modal preview/nilai dan tabel hasil upgrade |
| CONTRACT-05 | Buka **Monitoring Kontrak** dan gunakan filter status | Data sesuai status filter dan tidak ada baris yang hilang secara tidak semestinya | Screenshot filter aktif dan hasil tabel |

### E. Dokumen kontrak

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| DOC-01 | Pada form tambah/edit/perpanjang kontrak, unggah file uji dan pilih kategori dokumen | Upload berhasil; nama file, kategori, dan tautan tampil pada detail kontrak | Screenshot field file sebelum upload dan daftar dokumen setelah berhasil |
| DOC-02 | Hapus hanya dokumen uji | Dokumen hilang dari daftar dan aplikasi menampilkan pesan berhasil | Screenshot dialog konfirmasi dan daftar setelah penghapusan |

### F. Titik Peta

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| MAP-01 | Login sebagai Teknisi/Admin, buka **Titik Peta** | Tabel lokasi tampil dengan pelanggan dan nama lokasi yang benar | Screenshot tabel Titik Peta |
| MAP-02 | Klik satu baris lokasi/pelanggan | Peta dan sidebar menampilkan konteks pelanggan/kontrak baris tersebut | Screenshot peta dengan sidebar terbuka |
| MAP-03 | Klik **Tambah Titik Lokasi**, pilih/klik koordinat, beri label, simpan | Marker dan label tampil serta tetap ada setelah halaman dimuat ulang | Screenshot form label, marker, dan sidebar hasil |
| MAP-04 | Edit label/koordinat titik UAT lalu hapus titik UAT | Perubahan tersimpan; titik lain tidak ikut berubah; titik UAT hilang setelah dihapus | Screenshot sebelum edit, sesudah edit, dan setelah hapus |
| MAP-05 | Tambah **Titik Tetap/ISP**, isi label, simpan | Marker ISP tampil dengan label yang benar dan berbeda dari titik pelanggan | Screenshot form ISP dan marker/sidebar hasil |
| MAP-06 | Buka sidebar lalu lakukan framing/fit peta | Semua marker yang relevan tetap terlihat dan tidak tertutup sidebar | Screenshot peta dengan sidebar dan seluruh marker terlihat |

### G. Kelola pengguna (Admin)

| ID | Langkah manual | Hasil yang diharapkan | Bukti wajib |
|---|---|---|---|
| USER-01 | Buka **Kelola Pengguna**, klik **Tambah Pengguna**, isi akun Teknisi UAT, simpan | Pengguna baru tampil dengan role dan status yang benar | Screenshot form dan tabel pengguna |
| USER-02 | Edit nama/role/data yang diizinkan | Perubahan tersimpan | Screenshot modal edit dan hasil tabel |
| USER-03 | Nonaktifkan akun Teknisi UAT, lalu coba login memakai akun tersebut | Status menjadi Nonaktif dan login ditolak | Screenshot status Nonaktif, lalu pesan login ditolak |
| USER-04 | Di staging dengan minimal dua Admin UAT, nonaktifkan salah satu admin lalu coba nonaktifkan admin aktif terakhir | Sistem menolak penonaktifan admin aktif terakhir | Screenshot pesan penolakan |

## 5. Format Pencatatan Hasil

Salin tabel berikut ke laporan UAT:

| ID | Tanggal | Penguji/Role | Hasil | Nama screenshot | Catatan/temuan |
|---|---|---|---|---|---|
| AUTH-01 |  |  | Lulus/Gagal/Diblokir |  |  |
|  |  |  |  |  |  |

Kriteria hasil:

- **Lulus:** hasil aktual sesuai hasil yang diharapkan dan bukti screenshot tersedia.
- **Gagal:** hasil aktual berbeda, ada error, data salah, atau akses tidak sesuai.
- **Diblokir:** pengujian tidak dapat dijalankan karena akun, data, environment, atau fitur belum tersedia.

## 6. Daftar Screenshot yang Perlu Disediakan

Minimum paket bukti untuk cakupan Admin dan Teknisi:

1. `AUTH-01-login-admin.png` — Dashboard setelah login Admin.
2. `AUTH-02-menu-teknisi.png` — menu yang terlihat setelah login Teknisi.
3. `AUTH-03-login-akun-nonaktif.png` — pesan login ditolak.
4. `DASH-01-card-dashboard.png` — seluruh card Dashboard.
5. `DASH-02-rincian-core.png` — modal Rincian Core Tersewa dan Total.
6. `CUST-01-tambah-pelanggan.png` dan `CUST-01-hasil.png` — form dan hasil pelanggan.
7. `CONTRACT-01-tambah-kontrak.png` dan `CONTRACT-01-hasil.png` — form dan hasil kontrak.
8. `CONTRACT-03-perpanjangan.png` dan `CONTRACT-03-hasil.png` — proses dan record lama + baru.
9. `CONTRACT-04-upgrade.png` dan `CONTRACT-04-hasil.png` — nilai/tanggal upgrade dan hasilnya.
10. `CONTRACT-05-monitoring-filter.png` — status filter dan tabel hasil.
11. `DOC-01-upload-berhasil.png` — metadata/link dokumen.
12. `DOC-02-hapus-dokumen.png` — konfirmasi dan daftar setelah hapus.
13. `MAP-01-tabel.png` — tabel Titik Peta.
14. `MAP-02-sidebar.png` — peta dengan konteks lokasi yang dipilih.
15. `MAP-03-tambah-titik.png` dan `MAP-03-marker.png` — form/label dan marker.
16. `MAP-04-edit-hapus-titik.png` — hasil edit dan kondisi setelah hapus.
17. `MAP-05-titik-isp.png` — marker ISP dengan label.
18. `MAP-06-fit-peta.png` — marker tetap terlihat saat sidebar terbuka.
19. `USER-01-tambah-pengguna.png` — form dan pengguna baru.
20. `USER-03-nonaktif-login.png` — status Nonaktif dan login ditolak.
21. `USER-04-admin-terakhir.png` — hanya jika diuji di staging.

Screenshot harus memperlihatkan URL/halaman, konteks data yang diuji, pesan sukses/gagal, dan waktu bila memungkinkan. Crop bagian yang tidak relevan, tetapi jangan menghilangkan nilai, status, nama field, atau pesan error. Samarkan password, token, nomor identitas, dan data sensitif sebelum dibagikan.

## 7. Penutupan UAT

1. Pastikan seluruh screenshot sudah diberi nama sesuai ID skenario.
2. Bersihkan pelanggan, kontrak, titik, dokumen, dan akun yang hanya digunakan untuk UAT.
3. Pastikan tidak ada data UAT tertinggal di environment bersama.
4. Isi [Template Laporan UAT](Template_Laporan_UAT.md) menggunakan hasil dan bukti yang terkumpul.
5. Minta penguji dan pemilik bisnis menandatangani keputusan: Diterima, Diterima dengan catatan, atau Ditolak.

## 8. Catatan untuk Cakupan Saat Ini

Berdasarkan hasil UAT yang tersedia, cakupan Admin dan Teknisi sudah pernah diterima. Pengujian role ISP masih ditunda sampai role dan pembagian pelanggan ISP digunakan. Pengujian aturan “admin aktif terakhir” wajib dilakukan di staging dengan minimal dua akun Admin UAT; jangan menggunakan satu-satunya admin produksi.

