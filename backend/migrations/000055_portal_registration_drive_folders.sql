-- Struktur penyimpanan dokumen SOP 1 berdasarkan ISP terpilih KIMA,
-- perusahaan/lokasi pemohon, dan kode permohonan.
--
-- Kolom folder pada permohonan menyimpan folder final yang menjadi rumah
-- seluruh dokumen SOP. Relasi langsung pada dokumen membuat file dapat
-- dilacak ke permohonan walaupun pelanggan/lokasi legacy berubah.
ALTER TABLE portal_registrations
    ADD COLUMN drive_folder_id VARCHAR(255) DEFAULT NULL AFTER workflow_id,
    ADD COLUMN drive_folder_url VARCHAR(1000) DEFAULT NULL AFTER drive_folder_id,
    ADD KEY idx_portal_registrations_drive_folder (drive_folder_id);

ALTER TABLE dokumen
    ADD COLUMN portal_registration_id BIGINT UNSIGNED DEFAULT NULL AFTER billing_id,
    ADD KEY idx_dokumen_portal_registration (portal_registration_id),
    ADD CONSTRAINT fk_dokumen_portal_registration
        FOREIGN KEY (portal_registration_id) REFERENCES portal_registrations(id) ON DELETE SET NULL;
