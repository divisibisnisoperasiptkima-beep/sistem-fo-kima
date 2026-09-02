-- Data awal ISP pada instalasi lama berada di tabel pelanggan.
-- Impor satu kali agar ISP tersebut tersedia pada pilihan survei, tanpa
-- menjadikan setiap pelanggan baru sebagai ISP secara otomatis.
-- Migration 44 pernah berhenti setelah ALTER tetapi sebelum INSERT pada
-- database dengan collation legacy. Setiap perubahan skema dibuat idempoten
-- agar baris migrasi yang gagal dapat dihapus lalu dijalankan ulang dengan aman.
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'isp_directory'
    AND column_name = 'pelanggan_id'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE isp_directory ADD COLUMN pelanggan_id BIGINT UNSIGNED DEFAULT NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'isp_directory'
    AND index_name = 'uq_isp_directory_pelanggan'
);
SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE isp_directory ADD UNIQUE KEY uq_isp_directory_pelanggan (pelanggan_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'isp_directory'
    AND constraint_name = 'fk_isp_directory_pelanggan'
);
SET @sql = IF(
  @fk_exists = 0,
  'ALTER TABLE isp_directory ADD CONSTRAINT fk_isp_directory_pelanggan FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO isp_directory
    (pelanggan_id, nama_isp, pic_nama, email, telepon, catatan, status)
SELECT p.id, p.nama_pelanggan, p.pic, p.email, p.telepon,
       'Diimpor dari data Pelanggan lama; verifikasi oleh Admin KIMA.', 'aktif'
FROM pelanggan p
WHERE NOT EXISTS (
    SELECT 1 FROM isp_directory d WHERE d.pelanggan_id = p.id
)
AND NOT EXISTS (
    SELECT 1 FROM isp_directory d
    WHERE d.nama_isp COLLATE utf8mb4_unicode_ci
        = p.nama_pelanggan COLLATE utf8mb4_unicode_ci
);
