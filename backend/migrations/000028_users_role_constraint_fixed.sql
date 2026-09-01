-- Selaraskan role aplikasi dengan actor SOP. Migrasi berhenti bila ada role
-- lama/tidak dikenal agar data tidak diubah secara diam-diam.

-- Cek dulu apakah ada role yang tidak dikenal
SET @unknown_roles = (
  SELECT COUNT(*)
  FROM users
  WHERE role NOT IN (
    'admin', 'teknisi', 'isp', 'pelanggan',
    'dbo', 'legal', 'direksi', 'keuangan'
  )
);

-- Jika ada role tidak dikenal, hentikan migrasi
SET @sql = IF(
  @unknown_roles = 0,
  'SELECT "✓ Semua role valid, melanjutkan migrasi..." as status',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''users.role contains unsupported values; normalize them manually before migration 27'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Hapus constraint role yang lama jika ada (handle berbagai nama constraint)
-- Pendekatan lebih aman: hapus constraint dengan nama yang mungkin ada
SET @constraint_name = NULL;

-- Cari constraint CHECK yang mereferensikan kolom role
SELECT constraint_name INTO @constraint_name
FROM information_schema.table_constraints
WHERE constraint_schema = DATABASE()
  AND table_name = 'users'
  AND constraint_type = 'CHECK'
  AND constraint_name LIKE '%role%'
LIMIT 1;

-- Hapus constraint lama jika ditemukan
SET @sql = IF(
  @constraint_name IS NOT NULL,
  CONCAT('ALTER TABLE users DROP CHECK `', @constraint_name, '`'),
  'SELECT "Tidak ada constraint role lama yang perlu dihapus" as status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tambahkan constraint baru dengan nama yang konsisten
ALTER TABLE users
  ADD CONSTRAINT chk_users_role_supported
  CHECK (role IN (
    'admin', 'teknisi', 'isp', 'pelanggan',
    'dbo', 'legal', 'direksi', 'keuangan'
  ));

-- Verifikasi constraint berhasil dibuat
SELECT 'Constraint chk_users_role_supported berhasil ditambahkan' as result;