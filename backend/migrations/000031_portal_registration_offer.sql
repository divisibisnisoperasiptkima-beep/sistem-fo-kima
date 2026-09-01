-- Tahap 3: penawaran dan negosiasi setelah survei selesai serta ISP ditetapkan.
ALTER TABLE portal_registrations
    ADD COLUMN penawaran_status VARCHAR(20) NOT NULL DEFAULT 'belum_dibuat' AFTER isp_ditetapkan_at,
    ADD COLUMN penawaran_nomor VARCHAR(100) DEFAULT NULL AFTER penawaran_status,
    ADD COLUMN penawaran_nilai DECIMAL(18,2) DEFAULT NULL AFTER penawaran_nomor,
    ADD COLUMN penawaran_catatan TEXT DEFAULT NULL AFTER penawaran_nilai,
    ADD COLUMN penawaran_dikirim_at DATETIME DEFAULT NULL AFTER penawaran_catatan,
    ADD COLUMN respons_pemohon_catatan TEXT DEFAULT NULL AFTER penawaran_dikirim_at,
    ADD COLUMN respons_pemohon_at DATETIME DEFAULT NULL AFTER respons_pemohon_catatan,
    ADD KEY idx_portal_registrations_penawaran_status (penawaran_status);
