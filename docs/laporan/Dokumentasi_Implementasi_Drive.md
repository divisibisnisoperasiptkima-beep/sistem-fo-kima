# Dokumentasi Implementasi Google Drive & Modul Backend

**Tanggal snapshot:** 18 Juli 2026  
**Status snapshot:** `cargo build` OK, server listen `127.0.0.1:8080`

> Dokumen ini adalah laporan implementasi awal Drive. Kondisi terbaru dan
> hasil UAT admin/teknisi tercatat pada
> [`../uat/Laporan_UAT_2026-07-23.md`](../uat/Laporan_UAT_2026-07-23.md).
> Angka modul/baris kode, daftar endpoint, dan daftar pekerjaan lanjutan di
> bawah tidak boleh dipakai sebagai inventaris implementasi terkini.

---

## 1. Ringkasan

Monolit `main.rs` (~582 baris) dipecah menjadi 12 modul Rust. Fitur Google Drive diintegrasikan ke `POST pelanggan`, `POST kontrak-lengkap`, dan endpoint `dokumen` (upload/list/delete). Semua panggilan Google Drive API melalui OAuth refresh token di sisi server; browser tidak pernah menyentuh token Drive.

### Modul baru

| Modul | Baris | Tanggung jawab |
|---|---|---|
| `drive/client.rs` | 306 | OAuth token refresh + cache, find/create/ensure folder, upload/delete file, link sharing |
| `drive/folders.rs` | 123 | `ensure_pelanggan_tree`, `ensure_kontrak_tree`, sanitasi nama, parsing URL → ID, format periode |
| `drive/mod.rs` | 8 | Re-export `client.rs` + `folders.rs` |
| `pelanggan.rs` | 149 | `list` + `create` pelanggan (dengan ensure folder ke Drive) |
| `kontrak.rs` | 245 | `list` + `create` kontrak (dengan ensure folder periode ke Drive) |
| `dokumen.rs` | 504 | `GET / POST multipart / DELETE` dokumen (resolusi pemilik + folder, upload, metadata) |
| `error.rs` | 71 | `ApiError` dengan helper `bad_request`, `conflict`, `not_found`, `database`, `drive` |
| `models.rs` | 140 | Semua struct request/response |
| `access.rs` | 66 | Pengecekan role ISP + resolusi relasi pemilik |
| `state.rs` | 12 | `AppState` (DB + JWT + `DriveClient`) |
| `auth.rs` | 131 | Login + `require_auth` middleware |
| `schema.rs` | 118 | `ensure_application_schema` startup |
| `util.rs` | 41 | Helper pagination, env, role |
| `main.rs` | 121 | Bootstrap, router, health/ready |

**Total: 2,035 baris** Rust.

### Dependensi baru (`Cargo.toml`)

```toml
reqwest  = { version = "0.12", features = ["json", "multipart", "rustls-tls"] }
chrono   = { version = "0.4", features = ["clock", "std", "alloc"] }
urlencoding = "2"
axum     = { version = "0.8", features = ["multipart"] }
tokio    = { features = [... "sync"] }
```

---

## 2. Struktur Modul Backend

```
backend/src/
├── main.rs              ← bootstrap, router, health/ready
├── state.rs             ← AppState { database, jwt_secret, drive: DriveClient }
├── error.rs             ← ApiError + IntoResponse
├── models.rs            ← semua struct serde
├── util.rs              ← pagination, required_env, require_staff
├── auth.rs              ← login, require_auth (JWT + role)
├── schema.rs            ← ensure_application_schema (migrations)
├── access.rs            ← assert_pelanggan_access, resolve_*_id
├── pelanggan.rs         ← list_customers, create_customer
├── kontrak.rs           ← list_contracts, create_contract
├── dokumen.rs           ← list/upload/delete dokumen
└── drive/
    ├── mod.rs           ← pub use re-export
    ├── client.rs        ← DriveClient (OAuth, CRUD Drive)
    └── folders.rs       ← ensure tree, parse URL, format nama
```

Router di `main.rs`:

```text
GET   /healthz                     → healthz
GET   /readyz                      → readyz
POST  /api/auth/login              → login

-- protected (Bearer JWT, role admin|teknisi|isp) --
GET   /api/pelanggan               → list_customers
POST  /api/pelanggan               → create_customer
GET   /api/kontrak-lengkap         → list_contracts
POST  /api/kontrak-lengkap         → create_contract
GET   /api/dokumen?pelanggan_id=|lokasi_id=|billing_id=   → list_documents
POST  /api/dokumen                 → upload_document (multipart)
POST  /api/dokumen/sync            → start_drive_sync_job (admin; mulai job)
GET   /api/dokumen/sync/current     → get_current_drive_sync_status (admin)
GET   /api/dokumen/sync/{job_id}    → get_drive_sync_status (admin)
DELETE /api/dokumen/{id}           → delete_document
```

---

## 3. API Baru — Detail

### 3.1 Create Pelanggan

```http
POST /api/pelanggan
Authorization: Bearer <token>
Content-Type: application/json

{
  "nama_pelanggan": "PT Contoh",
  "kode_pelanggan": "PT-001",
  "pic": "Budi",
  "telepon": "0812xxxx",
  "email": "budi@contoh.com",
  "keterangan": "tes"
}
```

**Perilaku Drive:**  
Membuat `{PELANGGAN_ROOT}/PT Contoh/` → `{Bak-PKS, Kontrak, Dokumen Lain, Lokasi}/`.  
URL folder `PT Contoh` disimpan ke `pelanggan.link_folder_berkas`.

### 3.2 Create Kontrak

```http
POST /api/kontrak-lengkap
Authorization: Bearer <token>
Content-Type: application/json

{
  "pelanggan_id": 1,
  "kode_kontrak": "KTR-001",
  "nama_lokasi": "Kantor Pusat",
  "periode_awal": "2026-01-01",
  "periode_berakhir": "2026-12-31",
  "core": "100 Mbps",
  "nilai_kontrak": 12000000,
  "perbulan": 1000000
}
```

**Aturan validasi:**
- `kode_kontrak` wajib + unik
- Core & Sharing Core tidak boleh isi bersamaan
- Sharing Core hanya: `1/2`, `1/4`, `1/8`, `1/16`, `1/32`
- Status default: `Belum Beroperasi`

**Perilaku Drive:**  
Membuat `{PELANGGAN_ROOT}/PT Contoh/Lokasi/Kantor Pusat/01-01-2026 s.d. 31-12-2026/`.  
URL folder periode disimpan ke `lokasi.link_folder_berkas`.

### 3.3 List Dokumen

```http
GET /api/dokumen?pelanggan_id=1&page=1&page_size=20
GET /api/dokumen?lokasi_id=5
GET /api/dokumen?billing_id=10
```

Tepat **satu** filter wajib. Respons:

```json
{
  "data": [{
    "id": 1,
    "pelanggan_id": 1,
    "lokasi_id": null,
    "billing_id": null,
    "uploaded_by_user_id": 1,
    "kategori": "Kontrak",
    "nama_file": "kontrak.pdf",
    "drive_file_id": "1aBcD...",
    "drive_folder_id": "1xYz...",
    "drive_url": "https://drive.google.com/file/d/1aBcD.../view",
    "ukuran_byte": 123456,
    "mime_type": "application/pdf",
    "created_at": "2026-07-18 12:00:00"
  }],
  "total": 1, "page": 1, "page_size": 20
}
```

### 3.4 Upload Dokumen (multipart)

```bash
curl -X POST http://127.0.0.1:8080/api/dokumen \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@kontrak.pdf" \
  -F "kategori=Kontrak" \
  -F "pelanggan_id=1"
```

**Fields wajib:** `file`, `kategori`, **tepat satu** dari `pelanggan_id` / `lokasi_id` / `billing_id`.  
**Batas ukuran:** 25 MB.  
**Role:** admin atau teknisi.

**Perilaku:**
1. Resolve pemilik → ambil `link_folder_berkas` dari DB
2. Jika link ada → pakai folder ID dari URL
3. Jika link kosong → `ensure_*_tree` ke Drive → simpan URL ke kolom `link_folder_berkas`
4. `ensure` subfolder kategori (mis. `Kontrak/`) di bawah parent
5. Upload file ke Drive
6. INSERT metadata ke tabel `dokumen`

### 3.5 Hapus Dokumen

```http
DELETE /api/dokumen/1
Authorization: Bearer <token>
→ 204 No Content
```

Hapus file di Drive (abaikan 404), lalu DELETE baris `dokumen`.

---

## 4. Perilaku Google Drive

### OAuth & Token

- Refresh token disimpan di `.env` (`GOOGLE_REFRESH_TOKEN`)
- Saat akses pertama → refresh ke `https://oauth2.googleapis.com/token`
- Access token di-cache dengan expiry (`expires_in - 60 detik`)
- Semua request Drive memakai `Authorization: Bearer`

### Ensure Folder (idempoten)

```text
ensure_folder(parent_id, name):
  cari = find_child_folder(parent_id, name)
  jika ada → return id
  jika tidak → create_folder(parent_id, name) → return id
```

Race condition ditangani: jika create gagal (409), cari ulang.

### Struktur Folder Drive

```
{PELANGGAN_ROOT_FOLDER_ID}/
└── {Nama Pelanggan}/
    ├── Bak-PKS/
    ├── Kontrak/
    ├── Dokumen Lain/
    └── Lokasi/
        └── {Nama Lokasi}/
            └── {DD-MM-YYYY s.d. DD-MM-YYYY}/
                ├── BAK-PKS/
                ├── Kontrak/
                └── Dokumen Lain/
```

### Data Lama

Semua 16 pelanggan dan 269 kontrak **sudah** memiliki `link_folder_berkas` (URL Google Drive). Saat upload ke data lama:

1. `link_folder_berkas` di-parse → ambil folder ID (`folders/{id}` atau raw ID)
2. Parent = folder ID tersebut (tanpa membuat tree baru)
3. Hanya `ensure` subfolder kategori di bawah parent

Folder baru dibuat **hanya** untuk data baru (create pelanggan/kontrak via API ini).

### Link Sharing dan Akses Isi File

`GOOGLE_DRIVE_LINK_SHARING=false` adalah default. Folder dan file baru tidak diberi
permission publik `anyone`.

Portal ISP tidak membuka `drive_url` secara langsung. Preview dan download memakai
endpoint backend yang memeriksa JWT serta penugasan pelanggan ISP, kemudian backend
mengambil isi file melalui OAuth Google Drive. Preview dibatasi untuk PDF dan gambar;
format lain tersedia melalui download.

### Sinkronisasi Upload Langsung dari Drive

Admin dapat meng-upload file langsung ke folder kategori yang sudah dibuat sistem.
Backend membaca folder pelanggan dan folder periode kontrak yang tersimpan pada
`link_folder_berkas`, kemudian mencari file langsung di dalam subfolder `Kontrak`,
`BAK-PKS`, dan `Dokumen Lain`. File baru dicatat ke tabel `dokumen` menggunakan
`drive_file_id` sebagai kunci unik. Sinkronisasi juga dapat dijalankan dari tombol
`Sinkronkan Drive` pada halaman Kontrak atau endpoint `POST /api/dokumen/sync`.
Endpoint tersebut langsung mengembalikan `job_id`; progress dapat dibaca melalui
endpoint status. Job tetap berjalan di backend walaupun browser berpindah halaman
atau di-refresh.

Selain pemicu manual, backend menjalankan pemeriksaan berkala setiap 10 menit.
Sinkronisasi tidak membuat folder baru, tidak menghapus record database, dan hanya
menemukan file yang dapat dibaca oleh akun Google OAuth backend. Jika satu folder
lama tidak dapat dibaca, proses melaporkan jumlah error dan tetap melanjutkan folder
lainnya.

---

## 5. Penanganan Data Lama

| Situasi | Perilaku |
|---|---|
| Pelanggan lama, `link_folder_berkas` ada | Parse ID → pakai sebagai parent. Tidak buat tree baru. |
| Pelanggan lama, `link_folder_berkas` kosong | `ensure_pelanggan_tree` → simpan URL. |
| Kontrak lama, `link_folder_berkas` ada | Parse ID → pakai sebagai parent. |
| Kontrak lama, `link_folder_berkas` kosong | `ensure_kontrak_tree` → simpan URL. |
| Upload kategori `Kontrak` ke pelanggan | Parent = folder `Kontrak/` di dalam folder pelanggan |
| Upload kategori `Kontrak` ke kontrak | Parent = folder periode |

---

## 6. Catatan Startup

Setiap `cargo run`, backend menjalankan `ensure_application_schema`. Migrasi `000018` (idempoten) menjalankan:

- `ALTER TABLE lokasi ADD CONSTRAINT` (jika belum)
- `UPDATE lokasi SET status_kontrak = ...`
- `CREATE TABLE IF NOT EXISTS billing_details`
- `CREATE TABLE IF NOT EXISTS dokumen`
- `UPDATE titik_pelanggan` + `rute_fo`

Query ini menyentuh ~543 baris dan mungkin melewati ambang `slow_threshold=1s` SQLx. Ini **normal**, bukan error. Ke depannya bisa ditambahkan tracking migration agar tidak diulang tiap boot.

---

## 7. Environment

**File:** `backend/.env`

```env
DATABASE_URL=mysql://fo_kima_user:<pass>@127.0.0.1:3306/fo_kima
JWT_SECRET=<random-64-hex>
BIND_ADDR=127.0.0.1:8080
RUST_LOG=info,tower_http=info

GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REFRESH_TOKEN=<pre-generated>
GOOGLE_DRIVE_LINK_SHARING=false
PELANGGAN_ROOT_FOLDER_ID=<folder-id-root-drive>
EMAIL_PROVIDER=resend
EMAIL_FROM="KIMA Notification <notification@matics.space>"
RESEND_API_KEY=<resend-key>
```

**Template:** `backend/.env.example` (tanpa secret).

---

## 8. Uji Cepat (end-to-end)

```bash
# 1. Login
TOKEN=$(curl -sS http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"kevin@gmail.com","password":"..."}' | jq -r .access_token)

# 2. Create pelanggan
curl -sS http://127.0.0.1:8080/api/pelanggan \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"nama_pelanggan":"PT Test"}'

# 3. Create kontrak
curl -sS http://127.0.0.1:8080/api/kontrak-lengkap \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pelanggan_id":<id>,"kode_kontrak":"TST-001","nama_lokasi":"Lokasi A","periode_awal":"2026-07-01","periode_berakhir":"2026-12-31"}'

# 4. Upload dokumen ke pelanggan
curl -X POST http://127.0.0.1:8080/api/dokumen \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "kategori=Kontrak" \
  -F "pelanggan_id=<id>"

# 5. List dokumen
curl -sS "http://127.0.0.1:8080/api/dokumen?pelanggan_id=<id>" \
  -H "Authorization: Bearer $TOKEN"

# 6. Delete dokumen
curl -X DELETE http://127.0.0.1:8080/api/dokumen/<id> \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. Yang Belum Dikerjakan (fase berikutnya)

- Rename folder Drive saat ganti `nama_pelanggan`
- Perpanjangan/upgrade transaksi penuh + prorata billing
- Generator billing otomatis
- Peta jalur FO + workflow persetujuan (titik peta berlabel telah tersedia;
  workflow persetujuan belum diaktifkan)
- UI React untuk upload/list dokumen
- Tracking migration agar tidak diulang tiap startup
