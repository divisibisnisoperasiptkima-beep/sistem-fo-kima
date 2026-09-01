-- Tahap 4: PO/legalitas, nota dinas, dan persetujuan Direksi.
ALTER TABLE portal_registrations
    ADD COLUMN po_nomor VARCHAR(100) DEFAULT NULL AFTER respons_pemohon_at,
    ADD COLUMN po_catatan TEXT DEFAULT NULL AFTER po_nomor,
    ADD COLUMN po_submitted_at DATETIME DEFAULT NULL AFTER po_catatan,
    ADD COLUMN legal_status VARCHAR(24) NOT NULL DEFAULT 'belum_diminta' AFTER po_submitted_at,
    ADD COLUMN legal_catatan TEXT DEFAULT NULL AFTER legal_status,
    ADD COLUMN nota_dinas TEXT DEFAULT NULL AFTER legal_catatan,
    ADD COLUMN direksi_status VARCHAR(24) NOT NULL DEFAULT 'belum_diajukan' AFTER nota_dinas,
    ADD COLUMN direksi_catatan TEXT DEFAULT NULL AFTER direksi_status,
    ADD COLUMN direksi_decided_at DATETIME DEFAULT NULL AFTER direksi_catatan,
    ADD KEY idx_portal_registrations_legal_status (legal_status),
    ADD KEY idx_portal_registrations_direksi_status (direksi_status);
