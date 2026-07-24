# Alur Bisnis Kontrak Lokasi

## Prinsip

- Satu record adalah satu kontrak untuk satu lokasi dalam satu periode.
- Kontrak baru, perpanjangan, dan upgrade membuat record baru.
- Kontrak lama dipertahankan dan dihubungkan dengan `previous_lokasi_id`.
- Core dan Sharing Core tidak boleh diisi bersamaan.

## Status Kontrak

- `Belum Beroperasi`
- `Beroperasi`
- `Proses Perpanjangan`
- `Diperpanjang`
- `Di-upgrade`
- `Berhenti`

Status yang disimpan dan ditampilkan mengikuti periode serta histori perubahan.
Status lama `Berakhir` telah dimigrasikan menjadi `Proses Perpanjangan`.

## Kontrak Baru

Admin memasukkan pelanggan, lokasi, periode, layanan, nilai kontrak, nilai
bulanan, dan dokumen. Backend menghitung tanggal/durasi pasangannya, nilai
periode aktif, dan status awal.

## Perpanjangan

- Hanya kontrak terbaru pada pelanggan dan lokasi yang sama yang dapat
  diperpanjang.
- Backend membuat kontrak baru dengan harga yang diinput pada perpanjangan.
- Kontrak lama menjadi `Diperpanjang`; kontrak lanjutan menyimpan referensi
  `previous_lokasi_id` ke kontrak lama.
- Folder periode baru dibuat untuk dokumen perpanjangan.

## Upgrade

- Hanya kontrak `Beroperasi` terbaru yang dapat di-upgrade.
- Backend membuat kontrak baru dengan paket dan harga baru.
- Kontrak lama dipotong sampai sehari sebelum kontrak baru dimulai, lalu menjadi
  `Di-upgrade`.
- Billing pada bulan perubahan dihitung prorata.
- Folder periode baru dibuat untuk dokumen upgrade.

## Penghapusan

- Kontrak: hanya untuk salah input, duplikat, atau data uji. Backend menghapus
  folder periode kontrak dari Drive dan record kontraknya dari MySQL.
- Pelanggan: tidak dapat dihapus jika masih memiliki kontrak/lokasi.
  User harus menghapus kontrak terlebih dahulu.

## Dokumen

Folder pelanggan: `[KODE] Nama Pelanggan/`

```text
[KODE] Nama Pelanggan/
├─ Kontrak/
├─ BAK-PKS/
├─ Dokumen Lain/
└─ Lokasi/
    └── [Nama Lokasi]/
        └── [DD-MM-YYYY s.d. DD-MM-YYYY]/
            ├─ Kontrak/
            ├─ BAK-PKS/
            └─ Dokumen Lain/
```

Dokumen kontrak selalu berada pada folder periode miliknya.
