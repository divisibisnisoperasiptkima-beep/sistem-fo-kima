# Kesesuaian Dokumentasi dengan Skema MySQL Saat Ini

## Tujuan

Dokumen ini menjadi acuan agar pengembangan backend memakai tabel dan kolom
MySQL yang sudah ada. Tidak ada perubahan database yang dilakukan hanya dari
dokumen ini.

## Pemetaan Entitas

| Konsep bisnis | Tabel MySQL saat ini | Kolom/referensi utama |
| --- | --- | --- |
| Pelanggan/provider | `pelanggan` | `id`, `kode_pelanggan`, `nama_pelanggan`, kontak, `link_folder_berkas` |
| Kontrak lokasi | `lokasi` | `id`, `kode_kontrak`, `pelanggan_id`, `previous_lokasi_id`, periode, harga, status |
| Billing | `billing` | `id`, `lokasi_id`, `bulan`, jatuh tempo, nominal, snapshot harga, invoice, tanggal tagih/bayar, status |
| Detail prorata billing | `billing_details` | `billing_id`, `lokasi_id`, periode layanan, jumlah hari, harga snapshot, nominal prorata |
| Metadata dokumen | `dokumen` | pemilik pelanggan/lokasi/billing, kategori, file/folder Drive, URL, uploader |
| Titik pelanggan | `titik_pelanggan` | `pelanggan_id`, `points`, `approval_status`, `pending_points` |
| Jalur FO | `rute_fo` | `lokasi_id`, `geometry`, `manual_points`, `approval_status`, `pending_manual_points` |
| Akun dan role | `users` | `id`, `email`, `role`, status akun, versi sesi |
| Akses ISP | `user_pelanggan_access` | `user_id`, `pelanggan_id` |
| Audit akun | `user_audit_logs` | actor, target, aksi, details, waktu |

## Penyesuaian Istilah

- `ID Kontrak` pada dokumentasi dipetakan ke `lokasi.id`.
- Kode/nomor identitas bisnis kontrak dipetakan ke `lokasi.kode_kontrak`.
- `ID Kontrak Sebelumnya` dipetakan ke `lokasi.previous_lokasi_id`.
- Kontrak per lokasi tetap memakai tabel bernama `lokasi`; nama tabel ini tidak
  diubah agar data dan foreign key yang sudah ada tetap aman.

## Kondisi Data Saat Ini

Migration status telah diterapkan. Data lama `Aktif` menjadi `Beroperasi`,
`Nonaktif` menjadi `Berhenti`, dan `Berakhir` menjadi `Proses Perpanjangan`.
Constraint tabel `lokasi` sekarang menerima `Beroperasi`, `Belum Beroperasi`,
`Proses Perpanjangan`, `Diperpanjang`, `Di-upgrade`, serta `Berhenti`.

Status pembayaran yang saat ini ditemukan adalah `Belum Lunas`. Status ini tetap
berbeda dari status proses billing seperti `Belum Ditagih`, `Sudah Ditagih`, dan
`Sudah Dibayar`; keputusan pemetaan status perlu ditetapkan sebelum migration.

## Kebutuhan Migration Lanjutan

### Billing

Tabel `billing` sekarang memiliki `bulan_jatuh_tempo`, `tanggal_jatuh_tempo`,
dan `harga_bulanan_snapshot`. Tabel `billing_details` menyimpan rincian prorata
upgrade tanpa mengubah histori nominal billing lama.

Kebijakan hari jatuh tempo yang pasti masih perlu ditetapkan sebelum generator
billing mengisi kolom baru secara otomatis.

### Dokumen Google Drive

Tabel `dokumen` sekarang menyimpan metadata banyak file untuk pelanggan, kontrak
lokasi, atau billing, termasuk ID file/folder Google Drive, URL, kategori, nama
file, pengunggah, dan waktu unggah. Folder Drive tetap mengikuti struktur
pelanggan → lokasi → periode.

### Peta Jalur FO

Tabel peta menyimpan kolom persetujuan historis dan status data lama telah
diselaraskan dari `approved`/`pending` menjadi
`disetujui`/`menunggu_persetujuan`. Implementasi peta aktif menggunakan
`titik_lokasi_detail` untuk beberapa titik berlabel pada satu kontrak/lokasi,
serta `titik_isp` untuk titik ISP/pelanggan berlabel.

Saat ini admin dan teknisi yang berwenang dapat mengelola titik peta langsung.
Workflow draft/persetujuan belum diaktifkan pada UI maupun UAT dan tetap menjadi
pengembangan lanjutan.

## Urutan Aman

1. Gunakan nama tabel dan foreign key yang ada di backend baru.
2. Tambahkan API sesuai kolom yang sudah tersedia.
3. Buat migration kecil dan idempoten untuk status, billing, dokumen, serta
   persetujuan peta.
4. Migrasikan data lama secara eksplisit dan dapat diaudit.
5. Baru aktifkan fitur frontend yang memakai kolom/tabel baru.
