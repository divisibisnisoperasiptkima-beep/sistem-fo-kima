-- Dokumen PO atau surat permintaan sambungan yang dikirim pelanggan.
-- Record dokumen tetap berada di ruang dokumen pelanggan dan ditautkan ke
-- permohonan agar dapat diverifikasi Admin KIMA.
ALTER TABLE portal_registrations
    ADD COLUMN po_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER po_catatan,
    ADD KEY idx_portal_registrations_po_dokumen (po_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_po_dokumen
        FOREIGN KEY (po_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
