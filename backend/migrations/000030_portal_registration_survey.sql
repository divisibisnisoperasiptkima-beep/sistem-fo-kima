-- Tahap 2 permohonan layanan: KIMA mengonfirmasi kebutuhan, melakukan survei
-- jalur, lalu menetapkan ISP. Kontrak/lokasi operasional sengaja belum dibuat.
ALTER TABLE portal_registrations
    ADD COLUMN kebutuhan_terkonfirmasi TEXT DEFAULT NULL AFTER rejection_reason,
    ADD COLUMN survey_status VARCHAR(20) NOT NULL DEFAULT 'belum_dijadwalkan' AFTER kebutuhan_terkonfirmasi,
    ADD COLUMN survey_jadwal_at DATETIME DEFAULT NULL AFTER survey_status,
    ADD COLUMN survey_hasil TEXT DEFAULT NULL AFTER survey_jadwal_at,
    ADD COLUMN survey_completed_at DATETIME DEFAULT NULL AFTER survey_hasil,
    ADD COLUMN isp_user_id BIGINT UNSIGNED DEFAULT NULL AFTER survey_completed_at,
    ADD COLUMN isp_ditetapkan_at DATETIME DEFAULT NULL AFTER isp_user_id,
    ADD KEY idx_portal_registrations_survey_status (survey_status),
    ADD KEY idx_portal_registrations_isp_user (isp_user_id),
    ADD CONSTRAINT fk_portal_registrations_isp_user
        FOREIGN KEY (isp_user_id) REFERENCES users(id) ON DELETE SET NULL;
