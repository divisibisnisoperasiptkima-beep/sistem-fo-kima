-- Tahap 7: Berita Acara Aktivasi/serah-terima layanan.
ALTER TABLE portal_registrations
    ADD COLUMN baa_nomor VARCHAR(100) DEFAULT NULL AFTER aktivasi_aktif_at,
    ADD COLUMN baa_catatan TEXT DEFAULT NULL AFTER baa_nomor,
    ADD COLUMN baa_status VARCHAR(32) NOT NULL DEFAULT 'belum_dibuat' AFTER baa_catatan,
    ADD COLUMN baa_dibuat_at DATETIME DEFAULT NULL AFTER baa_status,
    ADD COLUMN baa_lokasi_accepted_at DATETIME DEFAULT NULL AFTER baa_dibuat_at,
    ADD KEY idx_portal_registrations_baa_status (baa_status);
