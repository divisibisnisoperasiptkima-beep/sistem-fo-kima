-- Allow a service applicant to cancel a request that KIMA has not processed yet.
-- The row is retained so the request history and audit trail remain available.
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'portal_registrations'
    AND constraint_name = 'chk_portal_registrations_status'
);
SET @sql = IF(@constraint_exists > 0,
  'ALTER TABLE portal_registrations DROP CHECK chk_portal_registrations_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'portal_registrations'
    AND constraint_name = 'chk_portal_registrations_status'
);
SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE portal_registrations ADD CONSTRAINT chk_portal_registrations_status CHECK (status IN (''menunggu'', ''disetujui'', ''ditolak'', ''dibatalkan''))',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE portal_registrations
    ADD COLUMN cancellation_reason TEXT DEFAULT NULL AFTER rejection_reason,
    ADD COLUMN cancelled_at DATETIME DEFAULT NULL AFTER cancellation_reason,
    ADD COLUMN cancelled_by_email VARCHAR(150) DEFAULT NULL AFTER cancelled_at,
    ADD KEY idx_portal_registrations_cancelled_at (cancelled_at);
