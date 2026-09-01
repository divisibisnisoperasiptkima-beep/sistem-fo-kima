-- Tahap 6: penjadwalan, progres, dan konfirmasi aktivasi layanan.
ALTER TABLE portal_registrations
    ADD COLUMN aktivasi_status VARCHAR(32) NOT NULL DEFAULT 'belum_dijadwalkan' AFTER pks_kima_signed_at,
    ADD COLUMN aktivasi_jadwal_at DATETIME DEFAULT NULL AFTER aktivasi_status,
    ADD COLUMN aktivasi_catatan TEXT DEFAULT NULL AFTER aktivasi_jadwal_at,
    ADD COLUMN aktivasi_aktif_at DATETIME DEFAULT NULL AFTER aktivasi_catatan,
    ADD KEY idx_portal_registrations_aktivasi_status (aktivasi_status);
