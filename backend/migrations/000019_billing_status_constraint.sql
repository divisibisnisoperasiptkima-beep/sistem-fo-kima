-- Update billing status constraint sesuai dokumentasi PRD (idempotent)
-- Status sebelumnya: Belum Lunas, Lunas
-- Status baru: Belum Ditagih, Sudah Ditagih, Belum Lunas, Sudah Dibayar

-- Drop constraint lama jika ada
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'billing'
    AND constraint_name = 'chk_billing_status'
);
SET @sql = IF(@constraint_exists > 0,
  'ALTER TABLE billing DROP CHECK chk_billing_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Buat constraint baru dengan status sesuai dokumentasi
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'billing'
    AND constraint_name = 'chk_billing_status'
);
SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE billing ADD CONSTRAINT chk_billing_status CHECK (status_pembayaran IN (''Belum Ditagih'', ''Sudah Ditagih'', ''Belum Lunas'', ''Sudah Dibayar''))',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
