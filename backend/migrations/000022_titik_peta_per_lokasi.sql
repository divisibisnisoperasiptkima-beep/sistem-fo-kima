-- Adjust titik_pelanggan table to reference lokasi_id (per-contract) instead of pelanggan_id.
-- This enables one map point per contract location, supporting multiple points for a single customer.

ALTER TABLE titik_pelanggan
    ADD COLUMN lokasi_id BIGINT UNSIGNED NULL AFTER pelanggan_id;

UPDATE titik_pelanggan t
SET t.lokasi_id = (
    SELECT l.id FROM lokasi l WHERE l.pelanggan_id = t.pelanggan_id LIMIT 1
);

ALTER TABLE titik_pelanggan DROP PRIMARY KEY;
ALTER TABLE titik_pelanggan ADD PRIMARY KEY (lokasi_id);

ALTER TABLE titik_pelanggan
    MODIFY lokasi_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE titik_pelanggan
    ADD CONSTRAINT fk_titik_pelanggan_lokasi
    FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE CASCADE;
