# Penjelasan Kontrak Lengkap

## Fungsi

Kontrak Lengkap adalah sumber histori seluruh kontrak lokasi. Satu record adalah
satu kontrak untuk satu lokasi dan satu periode.

## Data Utama

- ID kontrak dan `previous_lokasi_id`;
- pelanggan, lokasi, kategori, layanan, dan nomor kontrak;
- periode awal, periode akhir, dan durasi;
- nilai kontrak, biaya aktivasi, nilai bulanan, dan nilai periode aktif;
- status kontrak, alasan perubahan, dokumen, dan billing.

## Folder Kontrak

Folder kontrak berada dalam folder pelanggan dengan format `[KODE] Nama Pelanggan/Lokasi/`.

Struktur:

```text
[KODE] Nama Pelanggan/
└─ Lokasi/
    └── [Nama Lokasi]/
        └── [DD-MM-YYYY s.d. DD-MM-YYYY]/
            ├─ Kontrak/
            ├─ BAK-PKS/
            └─ Dokumen Lain/
```

## Aturan Periode dan Layanan

- Pengguna mengisi tanggal mulai + durasi, atau tanggal mulai + tanggal akhir.
- Backend menghitung field pasangannya dan memvalidasi kecocokan data.
- Core dan Sharing Core saling eksklusif.
- Status yang digunakan: `Belum Beroperasi`, `Beroperasi`,
  `Proses Perpanjangan`, `Diperpanjang`, `Di-upgrade`, atau `Berhenti`.
  Status lama `Berakhir` telah dimigrasikan menjadi `Proses Perpanjangan`.

## Perpanjangan dan Upgrade

Perpanjangan serta upgrade tidak mengubah record kontrak lama secara destruktif.
Keduanya membuat kontrak baru dan menyimpan hubungan histori.

- Perpanjangan memakai harga yang diinput pada kontrak baru.
- Upgrade memotong periode kontrak lama, memakai harga baru pada kontrak baru,
  dan menghasilkan billing prorata bila terjadi di tengah bulan.

## Penghapusan Kontrak

Penghapusan kontrak akan:
1. Menghapus folder periode dari Google Drive.
2. Menghapus record kontrak dan data relasi yang diperlukan dari database.

## Dokumen dan Billing

Billing disimpan terpisah dari kontrak. Satu kontrak dapat memiliki banyak
tagihan; detail prorata disimpan bila satu bulan mencakup harga lama dan baru.
