# Validasi Excel "MONITORING UPDATE 21 JUNI 2026" vs Database Sistem

**Tanggal validasi:** 21 Juli 2026  
**File sumber:** `14. MONITORING UPDATE 21 JUNI 2026 - BARU.xlsx`  
**Sheet:** NOV (CORE + SHARING CORE)

> Ini adalah hasil rekonsiliasi historis pada 21 Juli 2026, bukan sumber angka
> dashboard saat ini. Dashboard yang telah divalidasi pada 23 Juli 2026 memakai
> kontrak `Beroperasi` + `Belum Beroperasi`: kapasitas 384, Core tersewa 145,
> dan Core tersedia 239. Lihat
> [`../uat/Laporan_UAT_2026-07-23.md`](../uat/Laporan_UAT_2026-07-23.md).

---

## CORE — Perbandingan

| Excel ISP | Excel Core | Excel Harga/Unit | Excel Total | System Core (Active) | System Harga/Unit | System Total | Status |
|-----------|-----------|------------------|-------------|---------------------|-------------------|-------------|--------|
| XL | 134 | Rp 1.500.000 | Rp 201.000.000 | **0** | — | — | ❌ EXPIRED (2025-06-30, "Berhenti") |
| XL 2 | 2 | Rp 1.500.000 | Rp 3.000.000 | **0** | — | — | ❌ TIDAK DITEMUKAN |
| XL 3 | 2 | Rp 1.500.000 | Rp 3.000.000 | **0** | — | — | ❌ TIDAK DITEMUKAN |
| **Indosat** | **50** | Rp 2.100.000 | Rp 105.000.000 | **50** (15+35) | **Rp 2.225.000** | Rp 111.175.000 | ⚠️ Harga naik 6% |
| **Indosat** | **1** | Rp 2.100.000 | Rp 2.100.000 | **1** | **Rp 2.100.000** | Rp 2.100.000 | ✓ COCOK |
| **Telkom** | **60** | Rp 1.500.000 | Rp 90.000.000 | **60** (48+12) | **Rp 1.550.000** | Rp 93.000.000 | ⚠️ Harga naik 3.3% |
| **Icon 1** | **16** | Rp 4.000.000 | Rp 64.000.000 | **16** | **Rp 5.000.000** | Rp 80.000.000 | ⚠️ Harga naik 25% |
| **Icon 2** | **2** | Rp 5.000.000 | Rp 10.000.000 | **2** | **Rp 5.000.000** | Rp 10.000.000 | ✓ COCOK |
| **Icon 3** | **2** | Rp 4.000.000 | Rp 8.000.000 | **2** | **Rp 5.000.000** | Rp 10.000.000 | ⚠️ Harga naik 25% |
| Fiber | 1 | Rp 6.000.000 | Rp 6.000.000 | **0** | — | — | ❌ EXPIRED (2025-09-30) |
| **LA** | **6** | Rp 4.900.000 | Rp 29.400.000 | **6** | **Rp 5.500.000** | Rp 33.000.000 | ⚠️ Harga naik 12% |
| CGS | 1 | Rp 4.000.000 | Rp 4.000.000 | **0** | — | — | ❌ DIHENTIKAN (expired 2026-05-19, "Berhenti") |
| aktivasi | 6 | Rp 2.500.000 | Rp 15.000.000 | — | — | — | ❓ Biaya aktivasi |

| **Total Excel** | **283** | | **Rp 540.500.000** | | | | |
| **Total System (active only)** | | | | **139** | | **Rp 431.285.000** | |

---

## SHARING CORE — Perbandingan

| Paket | Excel (Jumlah) | Excel Harga/Unit | Excel Total | System (Active) | System Total/Bulan |
|-------|---------------|------------------|-------------|-----------------|-------------------|
| 1/32 | 44 | Rp 250.000 | Rp 11.000.000 | 19 | Rp 4.945.000 |
| 1/16 | 16 | Rp 500.000 | Rp 8.000.000 | 12 | Rp 6.310.000 |
| 1/8 | 2 | Rp 1.000.000 | Rp 2.000.000 | 12 | Rp 6.200.000 |
| 1/4 | 1 | Rp 1.800.000 | Rp 1.800.000 | 1 | Rp 1.800.000 |

**Catatan:** Excel kemungkinan menghitung SEMUA kontrak (termasuk non-aktif), bukan hanya yang sedang berjalan.

---

## Detail Kenaikan Harga per ISP (Active Core)

### Indosat Tbk (50 core aktif)

| Kontrak | Core | Harga/Bulan (Excel) | Harga/Bulan (System) | Selisih |
|---------|------|--------------------|--------------------|---------|
| Core 15C (PERU-030) | 15 | Rp 31.500.000 | Rp 33.375.000 | +Rp 1.875.000 (6%) |
| Core 35C (PERU-029) | 35 | Rp 73.500.000 | Rp 77.875.000 | +Rp 4.375.000 (6%) |
| PT Paragon | 1 | Rp 2.100.000 | Rp 2.100.000 | — |

### Telkom Indonesia (60 core aktif)

| Kontrak | Core | Harga/Bulan (Excel) | Harga/Bulan (System) | Selisih |
|---------|------|--------------------|--------------------|---------|
| 48 ODP | 48 | Rp 72.000.000 | Rp 74.400.000 | +Rp 2.400.000 (3.3%) |
| 12 Core | 12 | Rp 18.000.000 | Rp 18.600.000 | +Rp 600.000 (3.3%) |

### PT Indonesia Comnets Plus (ICON+, 20 core aktif)

| Kontrak | Core | Harga/Bulan (Excel) | Harga/Bulan (System) | Selisih |
|---------|------|--------------------|--------------------|---------|
| Core (KIMA) | 16 | Rp 64.000.000 | Rp 80.000.000 | +Rp 16.000.000 (25%) |
| Indosat KIMA | 2 | Rp 8.000.000 | Rp 10.000.000 | +Rp 2.000.000 (25%) |
| Indosat Kendari | 2 | Rp 8.000.000 | Rp 10.000.000 | +Rp 2.000.000 (25%) |

### PT Aplikanusa Lintasarta (LA, 6 core aktif)

| Kontrak | Core | Harga/Bulan (Excel) | Harga/Bulan (System) | Selisih |
|---------|------|--------------------|--------------------|---------|
| Core | 6 | Rp 29.400.000 | Rp 33.000.000 | +Rp 3.600.000 (12%) |

---

## Kontrak Tidak Ditemukan / Tidak Aktif

| ISP | Core | Keterangan |
|-----|------|-----------|
| XL | 134 Core | **Expired** 2025-06-30. Status: "Berhenti". Harga terakhir: Rp 167.500.000/bulan |
| XL 2 | 2 Core | Tidak ditemukan di database |
| XL 3 | 2 Core | Tidak ditemukan di database |
| Fiber (PT Fiber Network Indonesia) | 1 Core | **Expired** 2025-09-30. Status: "Diperpanjang" (tapi tidak ada kontrak baru) |
| CGS (PT Cendikia Global Solusi) | 1 Core | **Berhenti**, expired 2026-05-19. Harga: Rp 4.000.000/bulan |

---

## Kesimpulan

1. **Core Count:** 7 dari 13 entri Excel valid (core count cocok). 4 entri expired/tidak ditemukan, 2 entri bukan data core (aktivasi + ?).

2. **Harga:** 4 ISP mengalami kenaikan harga di kontrak extension (Juni 2026):
   - Indosat: +6%
   - Telkom: +3.3%
   - ICON+: +25%
   - LA: +12%

3. **Sharing Core:** Jumlah di Excel (63) vs system active (44) — selisih kemungkinan besar karena Excel menghitung semua kontrak termasuk non-aktif.

4. **Missing contracts (XL 2, XL 3):** Perlu investigasi apakah kontrak ini belum diinput atau sudah berakhir dan dihapus.
