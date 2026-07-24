-- Normalisasi format kolom core di tabel lokasi
-- Format yang benar: "X Core" (contoh: "16 Core", "2 Core")
-- Data existing ada yang tanpa suffix " Core" perlu dinormalisasi

-- Normalisasi: tambahkan " Core" suffix untuk nilai yang belum ada
UPDATE lokasi
SET core = CONCAT(core, ' Core')
WHERE core IS NOT NULL
  AND core != ''
  AND core NOT LIKE '% Core';

-- Tambah constraint untuk enforce format di masa depan (idempotent)
-- Nilai harus NULL, empty string, atau diakhiri dengan " Core"
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'lokasi'
    AND constraint_name = 'chk_lokasi_core_format'
);
SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE lokasi ADD CONSTRAINT chk_lokasi_core_format CHECK (core IS NULL OR core = \"\" OR core LIKE \"% Core\")',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
