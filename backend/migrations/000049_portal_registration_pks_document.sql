-- Dokumen BAK/PKS yang disusun KIMA harus ditautkan ke permohonan
-- sebelum dokumen dikirim untuk ditandatangani oleh para pihak.
ALTER TABLE portal_registrations
    ADD COLUMN pks_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER pks_catatan,
    ADD KEY idx_portal_registrations_pks_dokumen (pks_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_pks_dokumen
        FOREIGN KEY (pks_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
