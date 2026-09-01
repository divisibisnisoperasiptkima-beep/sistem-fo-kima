-- Nota dinas adalah surat internal KIMA yang menjadi lampiran pengajuan ke Direksi.
-- Ringkasan teks pada kolom nota_dinas tetap dipertahankan sebagai pelengkap.
ALTER TABLE portal_registrations
    ADD COLUMN nota_dinas_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER nota_dinas,
    ADD KEY idx_portal_registrations_nota_dinas_dokumen (nota_dinas_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_nota_dinas_dokumen
        FOREIGN KEY (nota_dinas_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
