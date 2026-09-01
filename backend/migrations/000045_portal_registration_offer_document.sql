-- Surat penawaran resmi yang dikirim KIMA wajib ditautkan ke permohonan.
-- Dokumen tetap disimpan pada ruang dokumen pelanggan agar dapat dilihat
-- kembali oleh pelanggan dari portalnya.
ALTER TABLE portal_registrations
    ADD COLUMN penawaran_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER penawaran_catatan,
    ADD KEY idx_portal_registrations_penawaran_dokumen (penawaran_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_penawaran_dokumen
        FOREIGN KEY (penawaran_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
