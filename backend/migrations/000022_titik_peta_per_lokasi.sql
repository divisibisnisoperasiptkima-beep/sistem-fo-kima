-- Adjust titik_pelanggan table to reference lokasi_id (per-contract) instead of pelanggan_id.
-- This enables one map point per contract location, supporting multiple points for a single customer.

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'titik_pelanggan'
    AND column_name = 'lokasi_id'
);
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE titik_pelanggan ADD COLUMN lokasi_id BIGINT UNSIGNED NULL AFTER pelanggan_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@column_exists = 0,
  'UPDATE titik_pelanggan t SET t.lokasi_id = (SELECT l.id FROM lokasi l WHERE l.pelanggan_id = t.pelanggan_id LIMIT 1)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @primary_is_lokasi = (
  SELECT COUNT(*) FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'titik_pelanggan'
    AND constraint_name = 'PRIMARY'
    AND column_name = 'lokasi_id'
);
SET @sql = IF(@primary_is_lokasi = 0,
  'ALTER TABLE titik_pelanggan DROP PRIMARY KEY, ADD PRIMARY KEY (lokasi_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @lokasi_nullable = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'titik_pelanggan'
    AND column_name = 'lokasi_id'
    AND is_nullable = 'YES'
);
SET @sql = IF(@lokasi_nullable > 0,
  'ALTER TABLE titik_pelanggan MODIFY lokasi_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @foreign_key_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'titik_pelanggan'
    AND constraint_name = 'fk_titik_pelanggan_lokasi'
);
SET @sql = IF(@foreign_key_exists = 0,
  'ALTER TABLE titik_pelanggan ADD CONSTRAINT fk_titik_pelanggan_lokasi FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
