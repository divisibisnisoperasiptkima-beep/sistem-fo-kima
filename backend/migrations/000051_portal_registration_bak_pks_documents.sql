-- BAK dan PKS dapat dikirim sebagai dua dokumen terpisah.
-- Minimal satu dari keduanya wajib tersedia; kolom tetap nullable agar
-- permohonan yang hanya memerlukan salah satu dokumen dapat diproses.
ALTER TABLE portal_registrations
    ADD COLUMN bak_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER pks_dokumen_id,
    ADD COLUMN bak_direktur_bidang_signed_at DATETIME DEFAULT NULL AFTER pks_lokasi_signed_at,
    ADD COLUMN pks_direktur_utama_signed_at DATETIME DEFAULT NULL AFTER bak_direktur_bidang_signed_at,
    ADD KEY idx_portal_registrations_bak_dokumen (bak_dokumen_id),
    ADD KEY idx_portal_registrations_bak_direktur_signed (bak_direktur_bidang_signed_at),
    ADD KEY idx_portal_registrations_pks_direktur_signed (pks_direktur_utama_signed_at),
    ADD CONSTRAINT fk_portal_registrations_bak_dokumen
        FOREIGN KEY (bak_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;
