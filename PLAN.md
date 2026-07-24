# Plan: Actions Column for Kontrak - Phase 1: Edit & Button Placeholders

## Ringkasan
Menambahkan kolom "Aksi" dengan:
- **Full implementation**: Edit (modal form lengkap)
- **Button placeholders**: Delete, Extend, Upgrade (buttons visible, modals di fase berikutnya)

---

## Perubahan File

### Backend
| File | Aksi | Tujuan |
|------|------|--------|
| `backend/src/kontrak.rs` | Modifikasi | Tambah `update_contract` |
| `backend/src/models.rs` | Modifikasi | Tambah `UpdateContractRequest` struct |
| `backend/src/main.rs` | Modifikasi | Tambah route PUT `/api/kontrak-lengkap/{id}` |

### Frontend
| File | Aksi | Tujuan |
|------|------|--------|
| `frontend/src/lib/rust-api.js` | Modifikasi | Tambah `updateContract` |
| `frontend/src/features/kontrak/columns.js` | Modifikasi | Ganti "—" dengan action buttons |
| `frontend/src/features/kontrak/ActionButtons.jsx` | Buat | Component action buttons |
| `frontend/src/features/kontrak/EditKontrakModal.jsx` | Buat | Modal edit kontrak |
| `frontend/src/features/kontrak/KontrakPage.jsx` | Modifikasi | Integrasi Edit modal + button placeholders |

---

## Backend Implementation

### PUT `/api/kontrak-lengkap/{id}` - Update Contract

**Request struct:**
```rust
#[derive(Deserialize)]
pub struct UpdateContractRequest {
    pub pelanggan_id: Option<u64>,
    pub kode_kontrak: Option<String>,
    pub nama_lokasi: Option<String>,
    pub periode_awal: Option<String>,
    pub periode_berakhir: Option<String>,
    pub status_kontrak: Option<String>,
    pub kategori: Option<String>,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
    pub no_kontrak: Option<String>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub durasi_kontrak_bulan: Option<u32>,
    pub keterangan: Option<String>,
}
```

**Validations:**
- Jika `kode_kontrak` diubah → pastikan tidak duplikat
- Jika `pelanggan_id` diubah → pastikan pelanggan ada
- Validasi tanggal (jika diubah): `periode_berakhir >= periode_awal`
- Validasi status: harus salah satu dari VALID_STATUS
- Validasi core/sharing: tidak boleh bersamaan

---

## Frontend Implementation

### ActionButtons Component
```jsx
export function ActionButtons({ row, onEdit, onDelete, onExtend, onUpgrade }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400">
        <Pencil size={16} />
      </button>
      <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400" disabled>
        <Trash2 size={16} />
      </button>
      <button onClick={onExtend} title="Extend" className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-400" disabled>
        <CalendarPlus size={16} />
      </button>
      <button onClick={onUpgrade} title="Upgrade" className="p-1.5 rounded-lg hover:bg-violet-500/20 text-violet-400" disabled>
        <ArrowUp size={16} />
      </button>
    </div>
  );
}
```

### EditKontrakModal
- Form sama dengan AddKontrakModal
- Pre-filled dengan data kontrak saat ini
- Dua-way binding untuk durasi/tanggal
- Submit → PUT request

---

## Verification Steps

### 1. Backend Verification
```bash
# Test update endpoint
curl -X PUT http://127.0.0.1:8080/api/kontrak-lengkap/{id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nama_lokasi": "Updated Name", "status_kontrak": "Beroperasi"}'
```

### 2. Frontend Lint & Build
```bash
npm run lint
npm run build
```

### 3. E2E Testing (Playwright)
| Step | Test |
|------|------|
| 1 | Buka halaman Kontrak |
| 2 | Klik tombol Edit pada baris pertama |
| 3 | Modal edit terbuka dengan data terisi |
| 4 | Ubah nama lokasi |
| 5 | Klik Simpan |
| 6 | Verifikasi data di table berubah |
| 7 | Verifikasi tidak ada error di console |

### 4. Edge Case Testing
| Case | Expected |
|------|----------|
| Edit dengan kode duplikat | Error: "Kode kontrak sudah ada" |
| Tanggal berakhir < tanggal mulai | Error: "Tanggal tidak valid" |
| Core dan Sharing Core bersamaan | Error: "Tidak boleh bersamaan" |
| Edit tanpa perubahan | Berhasil, data tetap sama |

---

## Estimasi Effort

| Task | Backend | Frontend | Testing |
|------|---------|----------|---------|
| Update Contract API | 30 min | - | 10 min |
| API Functions | - | 10 min | - |
| Edit Modal | - | 45 min | - |
| Action Buttons | - | 15 min | - |
| Integration | - | 15 min | - |
| E2E Test | - | - | 20 min |
| **Total** | **30 min** | **85 min** | **30 min** |

---

## Fase Berikutnya (Belum Termasuk)
- Delete kontrak (modal + API)
- Extend kontrak (modal + API)
- Upgrade kontrak (modal + API)
