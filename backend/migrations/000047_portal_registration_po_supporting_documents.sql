-- Dokumen pendukung yang wajib menyertai PO/permintaan sambungan pelanggan.
-- po_dokumen_id (migration 000046) tetap menjadi surat PO/permintaan utama.
ALTER TABLE portal_registrations
    ADD COLUMN po_akte_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER po_dokumen_id,
    ADD COLUMN po_izin_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER po_akte_dokumen_id,
    ADD KEY idx_portal_registrations_po_akte_dokumen (po_akte_dokumen_id),
    ADD KEY idx_portal_registrations_po_izin_dokumen (po_izin_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_po_akte_dokumen
        FOREIGN KEY (po_akte_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_po_izin_dokumen
        FOREIGN KEY (po_izin_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
