-- Revisi SOP1: BAK/PKS diunggah DBO dalam bentuk final dan sudah ditandatangani
-- lengkap. Status lama yang masih menunggu tanda tangan pelanggan dikembalikan
-- ke tahap penyusunan agar DBO mengunggah berkas final yang benar.
UPDATE portal_registrations
SET pks_status = 'belum_disusun',
    pks_lokasi_signed_at = NULL,
    bak_pelanggan_signed_dokumen_id = NULL,
    pks_pelanggan_signed_dokumen_id = NULL,
    pks_signed_dokumen_id = NULL
WHERE pks_status IN (
    'menunggu_tanda_tangan',
    'menunggu_tanda_tangan_pelanggan',
    'menunggu_verifikasi_dokumen_pelanggan',
    'menunggu_dokumen_final'
);
