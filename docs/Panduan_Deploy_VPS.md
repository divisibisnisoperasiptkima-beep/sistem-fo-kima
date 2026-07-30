# Panduan Deploy Sistem FO KIMA di VPS

Panduan ini menjelaskan deployment produksi Sistem FO KIMA menggunakan:

- Ubuntu 24.04 LTS;
- React/Vite sebagai frontend statis;
- Rust/Axum sebagai backend API;
- MySQL pada VPS yang sama;
- Nginx sebagai reverse proxy dan web server;
- `systemd` untuk menjalankan backend;
- HTTPS dari Let's Encrypt;
- Google Drive OAuth untuk penyimpanan dokumen.

Deployment di bawah ini tidak menggunakan Docker. Sesuaikan nama domain, URL repository, password, dan nilai secret dengan environment Anda.

## 1. Arsitektur dan asumsi

Contoh domain:

| Komponen | Domain | Arah koneksi |
|---|---|---|
| Frontend | `app.example.com` | Browser → Nginx → file `frontend/dist` |
| Backend | `api.example.com` | Browser → Nginx → `127.0.0.1:8080` |
| MySQL | tidak diekspos ke internet | Backend → `127.0.0.1:3306` |

Nilai contoh yang dipakai di seluruh panduan:

```text
User aplikasi : fo-kima
Direktori     : /opt/fo-kima
Database      : fo_kima
API internal  : 127.0.0.1:8080
```

Ganti `app.example.com`, `api.example.com`, dan `<REPO_URL>` sebelum menjalankan perintah.

## 2. Prasyarat

Siapkan hal berikut sebelum mulai:

1. VPS dengan IP publik dan akses SSH menggunakan user yang memiliki `sudo`.
2. Dua DNS record tipe A:

   ```text
   app.example.com  → IP_PUBLIK_VPS
   api.example.com  → IP_PUBLIK_VPS
   ```

3. Repository aplikasi dan akses untuk melakukan clone di VPS.
4. Kredensial Google Drive OAuth yang sudah diuji:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, dan ID folder root Drive.
5. Baseline schema/data MySQL yang kompatibel. Jika deployment ini memindahkan environment yang sudah berjalan, gunakan dump database dari environment tersebut.

Pastikan DNS sudah mengarah ke VPS sebelum meminta sertifikat HTTPS.

## 3. Persiapan VPS

Login melalui SSH, lalu pasang paket dasar:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential pkg-config libssl-dev git curl nginx mysql-server certbot python3-certbot-nginx
```

Frontend menggunakan Vite 8, sehingga gunakan Node.js `20.19+` atau `22.12+`. Contoh berikut memasang Node.js 22 dari NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Pasang Rust stable untuk user aplikasi. User ini juga menjadi pemilik source dan hasil build:

```bash
sudo adduser --system --group --home /home/fo-kima --shell /usr/sbin/nologin fo-kima
sudo install -d -o fo-kima -g fo-kima -m 755 /opt/fo-kima
sudo -u fo-kima -H sh -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
sudo -u fo-kima -H /home/fo-kima/.cargo/bin/rustup default stable
sudo -u fo-kima -H /home/fo-kima/.cargo/bin/rustc --version
```

Home Rust berada di `/home/fo-kima`; source aplikasi tetap berada di `/opt/fo-kima`.

## 4. Konfigurasi MySQL

Pastikan MySQL aktif:

```bash
sudo systemctl enable --now mysql
sudo systemctl status mysql --no-pager
```

Buka client MySQL sebagai administrator:

```bash
sudo mysql
```

Jalankan SQL berikut. Gunakan password database yang kuat dan simpan nilainya untuk konfigurasi backend. Jangan memakai password yang sama dengan password SSH atau akun Google.

```sql
CREATE DATABASE fo_kima CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fo_kima_user'@'127.0.0.1' IDENTIFIED BY 'PASSWORD_DATABASE_KUAT';
GRANT ALL PRIVILEGES ON fo_kima.* TO 'fo_kima_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

User MySQL dibuat untuk `127.0.0.1` karena URL koneksi backend menggunakan alamat tersebut. Jangan membuka port `3306` ke internet jika database hanya dipakai oleh backend di VPS.

> **Penting:** migration pada repository ini dimulai dari `000017` dan merupakan migration incremental. Migration tersebut mengacu pada tabel inti seperti `users`, `pelanggan`, `lokasi`, `billing`, dan `titik_pelanggan`; migration ini bukan bootstrap untuk database kosong. Untuk deployment baru, siapkan dan restore baseline schema/data yang disetujui pemilik sistem sebelum menyalakan backend.

Backend memakai migrator SQLx dan mencatat migration yang berhasil pada tabel
`_sqlx_migrations`. Pada upgrade pertama dari versi lama, migration `000017`–`000026`
yang sebelumnya belum tercatat akan dijalankan satu kali. Startup berikutnya tidak
mengulang DDL tersebut; SQLx hanya menjalankan migration baru yang belum tercatat.
Karena upgrade pertama dapat mengubah constraint dan kolom, buat backup database
sebelum menyalakan versi backend baru.

Jika memiliki dump database terkompresi, restore setelah database dibuat:

```bash
sudo gunzip -c /path/ke/fo_kima-baseline.sql.gz | sudo mysql fo_kima
```

Untuk dump SQL yang tidak terkompresi, gunakan `sudo mysql fo_kima < /path/ke/fo_kima-baseline.sql`. Setelah restore, pastikan tabel inti tersedia:

```bash
sudo mysql fo_kima -e "SHOW TABLES;"
```

Minimal tabel `users`, `pelanggan`, `lokasi`, `billing`, `titik_pelanggan`, dan `rute_fo` harus sudah ada sebelum service backend dijalankan. Baseline juga perlu menyediakan minimal satu akun administrator aktif untuk login pertama; aplikasi tidak memiliki seed admin otomatis.

Jika database atau user sudah ada, jangan menjalankan blok di atas secara membabi buta. Periksa terlebih dahulu dengan `SHOW DATABASES;` dan `SELECT User, Host FROM mysql.user;`, lalu gunakan `ALTER USER` hanya bila memang perlu mengganti password.

## 5. Deploy source code

Clone repository sebagai user aplikasi:

```bash
sudo -u fo-kima -H git clone <REPO_URL> /opt/fo-kima
```

Untuk repository privat, siapkan deploy key atau checkout source melalui pipeline CI. Pastikan direktori berikut dimiliki user aplikasi:

```bash
sudo chown -R fo-kima:fo-kima /opt/fo-kima
```

Jika source sudah dikirim ke VPS sebagai arsip, ekstrak isinya langsung ke `/opt/fo-kima` dan pastikan struktur berikut tersedia:

```text
/opt/fo-kima/backend/Cargo.toml
/opt/fo-kima/backend/src/
/opt/fo-kima/backend/migrations/
/opt/fo-kima/frontend/package.json
/opt/fo-kima/frontend/src/
```

## 6. Konfigurasi secret backend

Buat file environment yang hanya dapat dibaca oleh root:

```bash
sudo install -d -m 750 /etc/fo-kima
sudo install -o root -g root -m 600 /dev/null /etc/fo-kima/backend.env
sudoedit /etc/fo-kima/backend.env
```

Isi file tersebut dengan konfigurasi berikut, lalu ganti semua placeholder:

```env
DATABASE_URL=mysql://fo_kima_user:PASSWORD_DATABASE_URL_ENCODED@127.0.0.1:3306/fo_kima
JWT_SECRET=SECRET_ACAK_PANJANG_UNTUK_ENVIRONMENT_INI
BIND_ADDR=127.0.0.1:8080
CORS_ALLOWED_ORIGIN=https://app.example.com
TRUST_PROXY_HEADERS=true
LOGIN_RATE_LIMIT=5
LOGIN_RATE_WINDOW_SECS=60
LOGIN_RATE_MAX_IPS=10000
RUST_LOG=info,tower_http=info

# Google Drive OAuth server-side
GOOGLE_CLIENT_ID=CLIENT_ID_GOOGLE
GOOGLE_CLIENT_SECRET=CLIENT_SECRET_GOOGLE
GOOGLE_REFRESH_TOKEN=REFRESH_TOKEN_GOOGLE
GOOGLE_DRIVE_LINK_SHARING=false
PELANGGAN_ROOT_FOLDER_ID=ID_FOLDER_ROOT_GOOGLE_DRIVE

# Backup database terenkripsi ke Root/Backup/Database
BACKUP_ENABLED=false
BACKUP_TIMEZONE=Asia/Makassar
BACKUP_SCHEDULE_HOUR=2
BACKUP_SCHEDULE_MINUTE=0
BACKUP_FOLDER_NAME=Backup
BACKUP_DATABASE_FOLDER_NAME=Database
BACKUP_RETENTION_DAILY=7
BACKUP_ENCRYPTION_KEY=BASE64_32_BYTE_KEY
# Wajib hanya untuk pengujian restore; gunakan user MySQL terpisah dari produksi
BACKUP_RESTORE_DATABASE_URL=mysql://fo_kima_restore_user:PASSWORD@127.0.0.1:3306/fo_kima_restore_admin
BACKUP_MAX_RESTORE_BYTES=2147483648
```

Buat secret JWT, misalnya:

```bash
openssl rand -hex 32
```

Password yang dipakai di `DATABASE_URL` harus URL-encoded jika mengandung karakter khusus seperti `@`, `#`, `/`, `:` atau spasi. File environment ini berisi secret dan tidak boleh dimasukkan ke Git atau dikirim ke browser.

Backend memang memerlukan empat konfigurasi Google Drive tersebut saat startup. Pastikan refresh token masih valid dan akun OAuth memiliki akses ke folder root yang dipakai aplikasi.

Untuk menyiapkan konfigurasi backup, buat kunci enkripsi di server dan jangan
menyimpannya di repository:

```bash
openssl rand -base64 32
```

Masukkan hasilnya ke `BACKUP_ENCRYPTION_KEY`. Backup akan ditempatkan di folder
`Backup/Database` di bawah `PELANGGAN_ROOT_FOLDER_ID` dalam bentuk
`*.sql.gz.enc`. Isi dump dikompresi lalu dienkripsi AES-256-GCM sebelum upload;
kunci tidak pernah dikirim ke browser atau disimpan di Google Drive. Scheduler
menjalankan backup pada jam yang ditentukan. `BACKUP_RETENTION_DAILY=7` berarti tujuh tanggal backup terbaru
dipertahankan; file dari tanggal yang lebih lama akan dihapus dari folder
`Backup/Database`.

Sistem hanya menerima timezone tetap yang didukung: `UTC`, `Asia/Jakarta`,
`Asia/Makassar`, dan `Asia/Jayapura`.

Pengujian manual satu kali dapat dilakukan oleh admin melalui endpoint
`POST /api/admin/backup/run` dengan Bearer token. Endpoint ini tidak membuat link
publik dan mengembalikan checksum file hasil upload.

Riwayat 20 proses backup terakhir dapat diperiksa oleh admin melalui
`GET /api/admin/backup/jobs`. Status `succeeded` berarti file sudah berhasil
diunggah dan dicatat; status `failed` menyimpan alasan kegagalan tanpa menyimpan
kunci enkripsi.

Untuk pengujian restore, buat user MySQL khusus yang memiliki izin membuat dan
menghapus database sementara. Jangan gunakan URL credential produksi sebagai
`BACKUP_RESTORE_DATABASE_URL`. Jalankan:

```http
POST /api/admin/backup/restore
Content-Type: application/json

{"backup_job_id": 123}
```

Sistem mengunduh backup melalui backend, mencocokkan checksum, mendekripsi dan
memvalidasi gzip, merestore ke database dengan prefix `fo_kima_restore_`,
memastikan ada tabel, lalu menghapus database sementara. Restore tidak pernah
menulis ke database produksi.

## 7. Build dan jalankan backend

Build release menggunakan lockfile repository:

```bash
sudo -u fo-kima -H /home/fo-kima/.cargo/bin/cargo build \
  --manifest-path /opt/fo-kima/backend/Cargo.toml \
  --release --locked --bin fo-kima-backend
```

Path `cargo` pada instalasi ini adalah `/home/fo-kima/.cargo/bin/cargo`.

Buat unit `systemd`:

```bash
sudoedit /etc/systemd/system/fo-kima-backend.service
```

Isi dengan:

```ini
[Unit]
Description=FO KIMA Rust Backend
Wants=network-online.target
After=network-online.target mysql.service

[Service]
Type=simple
User=fo-kima
Group=fo-kima
WorkingDirectory=/opt/fo-kima/backend
EnvironmentFile=/etc/fo-kima/backend.env
ExecStart=/opt/fo-kima/backend/target/release/fo-kima-backend
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

> `ExecStart` harus menunjuk ke binary release yang benar. Jika Rust berada di home lain, itu tidak memengaruhi `ExecStart`; binary hasil build tetap berada di `backend/target/release/`.

Aktifkan dan jalankan service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fo-kima-backend
sudo systemctl status fo-kima-backend --no-pager
```

Periksa endpoint internal sebelum memasang Nginx:

```bash
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

Respons yang diharapkan adalah status `ok` dan `ready`. Setelah baseline schema tersedia, backend menjalankan pemeriksaan dan migration incremental yang dibundel ke database. Tunggu sampai log menampilkan `FO KIMA backend listening`.

Jika service gagal:

```bash
sudo journalctl -u fo-kima-backend -n 100 --no-pager
```

## 8. Build frontend produksi

API URL frontend ditentukan saat proses build. Buat file environment produksi di direktori frontend:

```bash
sudo -u fo-kima -H sh -c 'printf "%s\n" "VITE_API_BASE_URL=https://api.example.com" > /opt/fo-kima/frontend/.env.production'
```

`VITE_API_BASE_URL` adalah URL publik dan akan masuk ke bundle browser. Jangan menaruh `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `DATABASE_URL`, atau secret lain di file `VITE_*`.

Install dependency dan build:

```bash
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend ci
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend run lint
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend run build
```

Hasil build harus tersedia di `/opt/fo-kima/frontend/dist`. Nginx hanya perlu membaca direktori tersebut; frontend tidak membutuhkan proses Node.js yang berjalan terus-menerus.

## 9. Konfigurasi Nginx

Buat konfigurasi site:

```bash
sudoedit /etc/nginx/sites-available/fo-kima
```

Isi dengan konfigurasi HTTP berikut:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    root /opt/fo-kima/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Aktifkan site dan periksa konfigurasi:

```bash
sudo ln -s /etc/nginx/sites-available/fo-kima /etc/nginx/sites-enabled/fo-kima
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

> Jika file symlink sudah ada, jangan membuat symlink kedua. Cukup jalankan `nginx -t` dan reload setelah konfigurasi diperbarui.

Pastikan user web dapat membaca hasil build. Biasanya permission default dari `npm run build` sudah cukup karena direktori `/opt/fo-kima` dibuat dengan mode baca/eksekusi untuk user lain. Verifikasi dengan:

```bash
sudo -u www-data test -r /opt/fo-kima/frontend/dist/index.html
```

## 10. Aktifkan HTTPS

Setelah kedua domain dapat dijangkau melalui HTTP, minta sertifikat:

```bash
sudo certbot --nginx -d app.example.com -d api.example.com
```

Pilih pengalihan HTTP ke HTTPS ketika diminta. Uji perpanjangan otomatis:

```bash
sudo certbot renew --dry-run
```

Setelah HTTPS aktif, pastikan nilai berikut konsisten:

```env
# /etc/fo-kima/backend.env
CORS_ALLOWED_ORIGIN=https://app.example.com
```

Jika file environment diubah, restart backend:

```bash
sudo systemctl restart fo-kima-backend
```

## 11. Firewall dan verifikasi publik

Jika UFW digunakan, buka hanya SSH, HTTP, dan HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

Jangan membuka port `8080` atau `3306` ke internet. Backend harus tetap listen di `127.0.0.1:8080` dan MySQL di koneksi lokal.

Lakukan pemeriksaan akhir:

```bash
curl -fsS https://api.example.com/healthz
curl -fsS https://api.example.com/readyz
```

Kemudian buka `https://app.example.com` dan uji:

1. Login dengan akun yang sudah ada atau dibuat oleh administrator.
2. Membuka dashboard dan daftar pelanggan.
3. Membuat atau membaca data sesuai role.
4. Mengunggah satu dokumen uji, lalu menguji preview dan download dari aplikasi.
5. Menghapus data uji bila tidak diperlukan.

## 12. Update versi berikutnya

Sebelum update yang mengubah struktur data, buat backup MySQL dan pastikan ada cara rollback source. Contoh alur update:

```bash
sudo mysqldump --single-transaction --routines --triggers fo_kima \
  | sudo gzip \
  | sudo tee "/var/backups/fo_kima-$(date +%F-%H%M).sql.gz" >/dev/null

sudo -u fo-kima -H git -C /opt/fo-kima pull --ff-only
sudo -u fo-kima -H /home/fo-kima/.cargo/bin/cargo build \
  --manifest-path /opt/fo-kima/backend/Cargo.toml \
  --release --locked --bin fo-kima-backend
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend ci
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend run lint
sudo -u fo-kima -H npm --prefix /opt/fo-kima/frontend run build

sudo systemctl restart fo-kima-backend
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:8080/readyz
```

Restart backend akan menjalankan pemeriksaan/penyiapan skema yang diperlukan oleh source baru. Jangan menghapus folder `backend/migrations` dari source karena file tersebut digunakan saat build backend.

Backup database tidak mencakup file yang tersimpan di Google Drive. Pastikan kebijakan backup Google Drive dan retensi file organisasi juga sudah tersedia.

## 13. Troubleshooting

| Gejala | Pemeriksaan |
|---|---|
| `502 Bad Gateway` dari API | Jalankan `sudo systemctl status fo-kima-backend` dan `curl http://127.0.0.1:8080/healthz`. Periksa `journalctl` bila backend tidak aktif. |
| `/readyz` mengembalikan `503` | Periksa MySQL aktif, database/user benar, dan password pada `DATABASE_URL` sudah URL-encoded. |
| Login gagal dengan error CORS | `CORS_ALLOWED_ORIGIN` harus sama persis dengan origin browser, termasuk `https://` dan tanpa slash di akhir. Restart backend setelah mengubahnya. |
| Halaman frontend blank atau refresh menghasilkan 404 | Pastikan `try_files $uri $uri/ /index.html;` ada dan `npm run build` berhasil menghasilkan `dist/index.html`. |
| Upload mengembalikan `413 Request Entity Too Large` | Nginx dibatasi `10m`, dan backend juga memiliki batas body request. Gunakan file di bawah 10 MB atau ubah kedua batas secara sengaja lalu rebuild/restart. |
| Service berhenti saat startup karena Google Drive | Lengkapi empat variable Google Drive dan cek akses refresh token ke folder root. |
| Nginx tidak dapat membaca `index.html` | Periksa permission seluruh path `/opt/fo-kima` dan jalankan `sudo -u www-data test -r /opt/fo-kima/frontend/dist/index.html`. |
| Build frontend gagal karena versi Node | Jalankan `node --version`; gunakan Node `20.19+` atau `22.12+`. |
| Build backend gagal karena Rust | Pastikan `rustup default stable`, jalankan `cargo --version`, dan gunakan `Cargo.lock` dengan flag `--locked`. |

Log yang paling berguna:

```bash
sudo journalctl -u fo-kima-backend -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

## 14. Checklist keamanan pascadeploy

- [ ] SSH menggunakan key dan akses root langsung dibatasi sesuai kebijakan server.
- [ ] UFW hanya membuka port yang diperlukan.
- [ ] Port `8080` dan `3306` tidak terbuka publik.
- [ ] File `/etc/fo-kima/backend.env` mode `600` dan tidak terlacak Git.
- [ ] `JWT_SECRET` unik untuk environment produksi.
- [ ] `CORS_ALLOWED_ORIGIN` memakai domain HTTPS produksi.
- [ ] Sertifikat HTTPS aktif dan `certbot renew --dry-run` berhasil.
- [ ] Backup MySQL terjadwal dan pernah diuji proses restore-nya.
- [ ] Kredensial Google Drive tidak pernah dimasukkan ke frontend atau bundle Vite.
- [ ] Login, role admin/teknisi/ISP, dashboard, dan upload dokumen sudah diuji setelah deploy.
