-- Preserve microsecond ordering when a technician edits multiple location
-- points in quick succession. The latest edited point must be deterministic
-- for contract and map listings.
ALTER TABLE titik_lokasi_detail
    MODIFY COLUMN updated_at DATETIME(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6);
