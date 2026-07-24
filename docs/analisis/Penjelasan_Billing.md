# Penjelasan Billing

## Prinsip Data

- Satu record billing adalah satu tagihan untuk satu periode.
- Satu kontrak dapat memiliki banyak tagihan.
- Billing menyimpan snapshot harga agar histori tidak berubah ketika kontrak
  berikutnya memiliki harga baru.

## Bulan Jatuh Tempo Pertama

| Periode awal kontrak | Bulan jatuh tempo pertama |
| --- | --- |
| Tanggal 1–15 | Bulan yang sama |
| Tanggal 16–akhir bulan | Bulan berikutnya |

Hari jatuh tempo dalam bulan tersebut perlu ditetapkan sebagai kebijakan bisnis.

## Perpanjangan dan Upgrade

- Perpanjangan memakai harga baru mulai periode kontrak perpanjangan berlaku.
- Upgrade di tengah periode memotong kontrak lama dan membuat kontrak baru.
- Billing bulan upgrade dihitung prorata menurut jumlah hari pada masing-masing
  kontrak.

Contoh upgrade pada 16 Juni, dengan harga lama Rp1.000.000 dan harga baru
Rp1.500.000 dalam bulan 30 hari:

```text
(1.000.000 × 15/30) + (1.500.000 × 15/30) = Rp1.250.000
```

## Struktur

```text
Billing
├─ id_billing
├─ id_kontrak
├─ periode_tagihan
├─ bulan dan tanggal jatuh tempo
├─ nominal_tagihan
├─ harga_bulanan_snapshot
├─ invoice dan status pembayaran
└─ keterangan

Detail Billing
├─ id_billing
├─ id_kontrak
├─ rentang layanan
├─ jumlah hari
├─ harga snapshot
└─ nominal prorata
```

Tampilan billing memperlihatkan seluruh tagihan sebuah kontrak. Jika tagihan
memiliki prorata upgrade, pengguna tetap melihat satu total tagihan dengan
rincian yang dapat diaudit.
