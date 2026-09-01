-- Dokumen formal SOP 1. Rekam internal seperti Surat Minat, checklist Legal,
-- Nota Internal, keputusan Direksi, dan tanda terima tetap disimpan sebagai
-- aktivitas digital; berkas hanya diwajibkan untuk artefak formal.
ALTER TABLE portal_registrations
    ADD COLUMN survey_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER survey_hasil,
    ADD COLUMN pks_signed_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER pks_dokumen_id,
    ADD COLUMN baa_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER baa_catatan,
    ADD COLUMN invoice_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER invoice_jatuh_tempo,
    ADD COLUMN faktur_pajak_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER invoice_dokumen_id,
    ADD COLUMN pembayaran_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER pembayaran_catatan,
    ADD KEY idx_portal_registrations_survey_dokumen (survey_dokumen_id),
    ADD KEY idx_portal_registrations_pks_signed_dokumen (pks_signed_dokumen_id),
    ADD KEY idx_portal_registrations_baa_dokumen (baa_dokumen_id),
    ADD KEY idx_portal_registrations_invoice_dokumen (invoice_dokumen_id),
    ADD KEY idx_portal_registrations_faktur_pajak_dokumen (faktur_pajak_dokumen_id),
    ADD KEY idx_portal_registrations_pembayaran_dokumen (pembayaran_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_survey_dokumen FOREIGN KEY (survey_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_pks_signed_dokumen FOREIGN KEY (pks_signed_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_baa_dokumen FOREIGN KEY (baa_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_invoice_dokumen FOREIGN KEY (invoice_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_faktur_pajak_dokumen FOREIGN KEY (faktur_pajak_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_pembayaran_dokumen FOREIGN KEY (pembayaran_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
