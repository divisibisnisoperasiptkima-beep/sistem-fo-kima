-- Salinan BAK/PKS yang telah ditandatangani pelanggan diunggah kembali
-- oleh pelanggan dan menunggu verifikasi Admin KIMA.
ALTER TABLE portal_registrations
    ADD COLUMN bak_pelanggan_signed_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER bak_dokumen_id,
    ADD COLUMN pks_pelanggan_signed_dokumen_id BIGINT UNSIGNED DEFAULT NULL AFTER pks_dokumen_id,
    ADD KEY idx_portal_registrations_bak_pelanggan_signed (bak_pelanggan_signed_dokumen_id),
    ADD KEY idx_portal_registrations_pks_pelanggan_signed (pks_pelanggan_signed_dokumen_id),
    ADD CONSTRAINT fk_portal_registrations_bak_pelanggan_signed
        FOREIGN KEY (bak_pelanggan_signed_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_portal_registrations_pks_pelanggan_signed
        FOREIGN KEY (pks_pelanggan_signed_dokumen_id) REFERENCES dokumen(id) ON DELETE SET NULL;

-- Status verifikasi dokumen pelanggan membutuhkan nama status yang lebih
-- panjang dari batas lama 32 karakter.
ALTER TABLE portal_registrations
    MODIFY COLUMN pks_status VARCHAR(64) NOT NULL DEFAULT 'belum_disusun';

-- Baris lama yang belum memiliki dokumen final dikembalikan ke tahap
-- penyusunan. Admin perlu mengonfirmasi ulang bahwa dokumen yang tersedia
-- sudah ditandatangani pejabat yang benar sebelum dikirim ke pelanggan.
UPDATE portal_registrations
SET pks_status = 'belum_disusun',
    pks_lokasi_signed_at = NULL,
    bak_pelanggan_signed_dokumen_id = NULL,
    pks_pelanggan_signed_dokumen_id = NULL
WHERE pks_status IN ('menunggu_tanda_tangan', 'menunggu_dokumen_final')
  AND pks_signed_dokumen_id IS NULL;
