# Penjelasan Billing

## Prinsip Data

- Satu record billing adalah satu tagihan untuk satu periode.
- Satu kontrak dapat memiliki banyak tagihan.
- Billing menyimpan snapshot harga agar histori tidak berubah ketika kontrak
  berikutnya memiliki harga baru.
- Billing terhubung ke kontrak/lokasi yang berlaku pada periode layanan.
- Billing historis tidak boleh diubah karena perubahan harga, perpanjangan, atau
  upgrade setelahnya.

## Penentuan Bulan Jatuh Tempo Pertama

| Periode awal kontrak | Bulan jatuh tempo pertama |
| --- | --- |
| Tanggal 1–15 | Bulan yang sama |
| Tanggal 16–akhir bulan | Bulan berikutnya |

Aturan ini berlaku untuk kontrak baru maupun kontrak hasil perpanjangan. Hari
tepat jatuh tempo di dalam bulan tersebut merupakan konfigurasi kebijakan
bisnis tersendiri dan tidak mengubah aturan pemilihan bulan di atas.

Contoh:

```text
Periode awal 10 Juni 2026 -> bulan jatuh tempo pertama Juni 2026
Periode awal 20 Juni 2026 -> bulan jatuh tempo pertama Juli 2026
```

## Siklus Status Billing

Urutan proses billing adalah:

```text
Belum Ditagih -> Sudah Ditagih -> Belum Lunas -> Sudah Dibayar
```

- `Belum Ditagih`: record billing sudah dibuat, tetapi invoice belum diterbitkan.
- `Sudah Ditagih`: invoice sudah diterbitkan kepada pelanggan.
- `Belum Lunas`: invoice sudah diterbitkan tetapi belum dibayar.
- `Sudah Dibayar`: pembayaran sudah dicatat, termasuk tanggal pembayaran.

Nomor invoice, tanggal tagih, tanggal bayar, dan perubahan status harus dapat
ditelusuri.

## Perpanjangan dan Upgrade

- Perpanjangan membuat record kontrak baru untuk periode selanjutnya.
- Billing kontrak lama tidak diubah.
- Billing untuk periode perpanjangan dibuat sebagai record baru, memakai harga
  yang berlaku pada kontrak perpanjangan.
- Upgrade memotong kontrak lama sampai sehari sebelum tanggal upgrade dan
  membuat record kontrak baru mulai tanggal upgrade.
- Billing sejak tanggal mulai upgrade menggunakan kontrak/paket baru.
- Billing bulan perubahan dihitung prorata menurut jumlah hari pada kontrak lama
  dan kontrak baru.
- Billing bulan berikutnya menggunakan harga baru secara penuh.
- Billing yang sudah dibuat, ditagihkan, atau dibayar tidak boleh dihapus atau
  diubah secara diam-diam. Koreksi harus menghasilkan jejak audit.

Contoh upgrade pada 16 Juni, dengan harga lama Rp1.000.000 dan harga baru
Rp1.500.000 dalam bulan 30 hari:

```text
(1.000.000 × 15/30) + (1.500.000 × 15/30) = Rp1.250.000
```

Dengan demikian, bulan Juni tetap ditampilkan sebagai satu total tagihan dengan
dua detail prorata. Tagihan Juli dan seterusnya dibuat dengan harga baru penuh.

## Struktur

```text
Billing
├─ id_billing
├─ id_kontrak/lokasi
├─ periode_tagihan
├─ bulan dan tanggal jatuh tempo
├─ nominal_tagihan
├─ harga_bulanan_snapshot
├─ invoice dan status pembayaran
└─ keterangan

Detail Billing
├─ id_billing
├─ id_kontrak/lokasi
├─ rentang layanan
├─ jumlah hari
├─ harga snapshot
└─ nominal prorata
```

Tampilan billing memperlihatkan seluruh tagihan sebuah kontrak. Jika tagihan
memiliki prorata upgrade, pengguna tetap melihat satu total tagihan dengan
rincian yang dapat diaudit.
