# PRD Sistem Monitoring FO KIMA

## Tujuan

Menyediakan aplikasi operasional untuk pelanggan/provider, lokasi, kontrak,
billing, dokumen, dan jalur FO. Sistem pengganti proses manual dan menjadi
sumber data utama yang dapat diaudit.

## Pengguna

- admin operasional;
- teknisi;
- staf monitoring dan billing;
- ISP dengan akses data terbatas.

## Status Implementasi Saat Ini

- Cakupan admin dan teknisi telah divalidasi melalui UAT pada 23 Juli 2026.
- Teknisi saat ini dibatasi ke halaman Titik Peta FO KIMA; endpoint data bisnis
  (dashboard, pelanggan, kontrak, dan pengguna) ditolak untuk role teknisi.
- Peta mendukung multi-titik berlabel per lokasi/kontrak dan titik tetap
  pelanggan/ISP berlabel.
- Role ISP serta penugasan `user_pelanggan_access` belum menjadi cakupan aktif
  dan UAT-nya ditunda.

## Fitur Inti

1. Manajemen pelanggan dan dokumen pelanggan (dengan upload file saat buat pelanggan).
2. Kontrak lokasi, perpanjangan, upgrade, status, dan histori.
3. Billing per kontrak, invoice, pembayaran, jatuh tempo, serta prorata upgrade.
4. Dokumen Google Drive melalui OAuth backend.
5. Peta jalur FO, titik pelanggan/lokasi, dan persetujuan teknisi.
6. Monitoring kontrak beroperasi, berakhir, serta pembayaran.
7. Role, audit, dan pembatasan akses ISP.

## Aturan Penting

- Kontrak baru, perpanjangan, dan upgrade membuat record baru.
- Harga billing mengikuti kontrak yang berlaku pada periode layanan.
- Mulai kontrak tanggal 1-15: bulan jatuh tempo adalah bulan sama.
- Mulai kontrak tanggal 16-akhir bulan: bulan jatuh tempo bulan berikutnya.
- Alur draft/persetujuan peta adalah kebutuhan lanjutan. Implementasi aktif
  saat ini mengizinkan admin dan teknisi yang berwenang mengelola titik peta
  secara langsung.
- Kode pelanggan auto-generate dengan format `PLG-XXXXXX`.
- Folder pelanggan auto-create dengan nama `[KODE] Nama Pelanggan`.
- Pelanggan tidak dapat dihapus jika masih memiliki kontrak.

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

Backend membuat struktur tersebut dan mengunggah berkas melalui Google Drive
API. MySQL menyimpan metadata serta relasi file dengan data bisnis.

## Kriteria Selesai Tahap Awal

- pengguna dapat login sesuai role;
- pelanggan, kontrak, dan billing dapat dikelola melalui aplikasi;
- perpanjangan/upgrade menjaga histori dan billing;
- dokumen dapat diunggah ke folder Drive yang benar;
- admin dan teknisi dapat mengelola titik peta sesuai pembatasan role aktif;
- monitoring menampilkan status kontrak dan pembayaran secara benar.
