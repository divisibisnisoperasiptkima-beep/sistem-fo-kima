# Pemahaman Dokumentasi dan Aturan Bisnis FO KIMA

## Ruang Lingkup

Sistem mengelola pelanggan/provider, lokasi layanan, kontrak per lokasi,
billing, dokumen, dan jalur FO. File ini merangkum aturan bisnisnya.

## Pelanggan dan Kontrak

- Satu record pelanggan adalah satu profil provider/mitra layanan FO.
- Satu pelanggan dapat memiliki banyak lokasi dan histori kontrak.
- Satu record kontrak berarti satu kontrak untuk satu lokasi dalam satu periode.
- Kontrak menyimpan periode, harga, layanan Core atau Sharing Core, status,
  dokumen, dan referensi kontrak sebelumnya.
- Core dan Sharing Core saling eksklusif: hanya satu yang boleh diisi.

Kontrak baru, perpanjangan, dan upgrade selalu membuat record baru. Kontrak
lama dipertahankan untuk histori melalui `previous_lokasi_id`.

| Kejadian | Kontrak lama | Kontrak baru |
| --- | --- | --- |
| Perpanjangan | `Beroperasi` sampai lanjutan berlaku, lalu `Diperpanjang` | Menyimpan referensi kontrak lama |
| Upgrade | Dipotong sehari sebelum upgrade lalu `Di-upgrade` | Memakai paket dan harga baru |

Status kontrak adalah `Belum Beroperasi`, `Beroperasi`,
`Proses Perpanjangan`, `Diperpanjang`, `Di-upgrade`, dan `Berhenti`.
Nilai lama `Berakhir` telah dimigrasikan menjadi `Proses Perpanjangan`.

## Billing

Satu kontrak dapat memiliki banyak tagihan; satu record billing mewakili satu
periode tagihan. Billing menyimpan nominal, invoice, tanggal tagih/bayar, dan
status pembayaran. Billing terhubung ke kontrak/lokasi yang berlaku pada
periode layanan dan menyimpan snapshot harga agar histori tidak berubah.

| Tanggal mulai kontrak | Bulan jatuh tempo pertama |
| --- | --- |
| Tanggal 1–15 | Bulan yang sama |
| Tanggal 16–akhir bulan | Bulan berikutnya |

Harga billing mengikuti kontrak yang berlaku pada periode layanan.

- Jika periode awal kontrak tanggal 1–15, bulan jatuh tempo pertama adalah bulan
  yang sama. Jika periode awal tanggal 16–akhir bulan, bulan jatuh tempo pertama
  adalah bulan berikutnya.
- Perpanjangan membuat billing baru untuk periode kontrak perpanjangan dengan
  harga yang berlaku pada kontrak baru. Billing lama tidak diubah.
- Upgrade memotong kontrak lama sehari sebelum tanggal upgrade dan membuat
  kontrak baru mulai tanggal upgrade.
- Billing pada bulan upgrade memakai prorata: hari sebelum upgrade menggunakan
  harga lama, sedangkan mulai tanggal upgrade menggunakan harga baru.
- Billing bulan berikutnya menggunakan harga baru secara penuh.
- Billing yang sudah dibuat atau dibayar tidak boleh berubah tanpa proses
  koreksi dan audit.

Siklus status billing adalah `Belum Ditagih`, `Sudah Ditagih`, `Belum Lunas`,
dan `Sudah Dibayar`.

## Struktur Dokumen

```text
Nama Pelanggan/
├─ Bak-PKS/
├─ Kontrak/
├─ Dokumen Lain/
└─ Lokasi/
   └─ Nama Lokasi/
      └─ DD-MM-YYYY s.d. DD-MM-YYYY/
         ├─ BAK-PKS/
         ├─ Kontrak/
         └─ Dokumen Lain/
```

Dokumen pelanggan berlaku umum. Dokumen kontrak berada di folder periode.
Perpanjangan dan upgrade membuat folder periode baru agar histori tidak
tercampur.

## Peta dan Role Saat Ini

| Role | Akses aplikasi saat ini | Aksi peta |
| --- | --- | --- |
| Admin | Akses penuh pelanggan, kontrak, dashboard, pengguna, dokumen, dan peta | Menambah, mengubah, atau menghapus titik lokasi/kontrak serta titik ISP/pelanggan |
| Teknisi | Hanya halaman tabel **Titik Peta FO KIMA**; API bisnis ditolak | Menambah, mengubah, atau menghapus titik lokasi/kontrak serta titik ISP/pelanggan |
| ISP | Ditunda sampai penugasan `user_pelanggan_access` mulai digunakan | Belum menjadi cakupan UAT saat ini |

Tabel peta menampilkan satu baris unik untuk kombinasi pelanggan + nama lokasi.
Saat peta suatu baris dibuka, hanya titik lokasi/kontrak dari baris tersebut
yang dimuat. Satu lokasi dapat memiliki beberapa titik berlabel; titik tetap
ISP/pelanggan juga berlabel dan terhubung ke pelanggan.

## Dashboard Core Saat Ini

Dashboard menghitung kapasitas dari konfigurasi dan pemakaian dari kontrak
aktif. Card **Core Tersewa** dapat membuka rincian per pelanggan dengan kolom
`1/32`, `1/16`, `1/8`, `1/4`, dan `Core`, termasuk baris total. Pada validasi
23 Juli 2026, data aktif menunjukkan kapasitas 384 Core, tersewa 145 Core,
tersedia 239 Core, dan 12 lokasi dedicated.
