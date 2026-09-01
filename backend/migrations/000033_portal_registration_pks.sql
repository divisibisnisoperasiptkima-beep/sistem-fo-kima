-- Tahap 5: BAK/PKS dan tanda tangan para pihak.
ALTER TABLE portal_registrations
    ADD COLUMN pks_nomor VARCHAR(100) DEFAULT NULL AFTER direksi_decided_at,
    ADD COLUMN pks_catatan TEXT DEFAULT NULL AFTER pks_nomor,
    ADD COLUMN pks_status VARCHAR(32) NOT NULL DEFAULT 'belum_disusun' AFTER pks_catatan,
    ADD COLUMN pks_disusun_at DATETIME DEFAULT NULL AFTER pks_status,
    ADD COLUMN pks_lokasi_signed_at DATETIME DEFAULT NULL AFTER pks_disusun_at,
    ADD COLUMN pks_isp_signed_at DATETIME DEFAULT NULL AFTER pks_lokasi_signed_at,
    ADD COLUMN pks_kima_signed_at DATETIME DEFAULT NULL AFTER pks_isp_signed_at,
    ADD KEY idx_portal_registrations_pks_status (pks_status);
