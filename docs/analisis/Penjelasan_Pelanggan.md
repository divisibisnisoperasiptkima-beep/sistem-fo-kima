# Penjelasan Pelanggan

## Fungsi

Pelanggan adalah profil provider/mitra layanan FO. Satu pelanggan dapat memiliki
banyak lokasi dan histori kontrak.

## Data Utama

- kode pelanggan unik (auto-generate oleh sistem, format: `PLG-XXXXXX`);
- nama pelanggan;
- PIC, telepon, email, dan keterangan;
- jumlah kontrak `Beroperasi` dan `Belum Beroperasi` (hasil perhitungan);
- tautan folder Google Drive pelanggan.

## Folder Pelanggan

Folder utama bernama `[KODE] Nama Pelanggan` dan dimuat di root folder pelanggan.
Folder dibuat otomatis saat pelanggan dibuat.

Struktur folder:

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

- Folder `Kontrak` untuk dokumen kontrak utama.
- Folder `BAK-PKS` untuk berita acara dan PKS.
- Folder `Dokumen Lain` untuk dokumen pendukung lainnya.
- Folder `Lokasi` berisi subfolder lokasi dan periode kontrak.

Backend Rust membuat folder dan mengunggah file melalui Google Drive API.
MySQL menyimpan metadata file serta relasinya ke pelanggan.

## Kode Pelanggan

Kode pelanggan di-generate otomatis dengan format `PLG-XXXXXX` (6 karakter acak).
Tersedia endpoint `GET /api/pelanggan-next-code` untuk generate kode baru.

## Aturan Operasional

- Pelanggan dibuat sebelum kontrak lokasi dibuat.
- Kode pelanggan auto-generate, tidak perlu input manual.
- Folder Drive dibuat otomatis saat pelanggan dibuat.
- Perubahan nama pelanggan akan rename folder Drive.
- Penghapusan customer tidak diizinkan jika masih memiliki kontrak/lokasi.
- Data pelanggan tidak menyimpan periode kontrak; periode berada pada kontrak
  lokasi agar histori tetap rapi.
