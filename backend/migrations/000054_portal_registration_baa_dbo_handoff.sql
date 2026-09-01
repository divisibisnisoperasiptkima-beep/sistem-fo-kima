-- Tahap BAA: DBO/Admin menerima hasil kerja Teknisi, memverifikasi,
-- lalu meneruskan dokumen BAA kepada pelanggan.
ALTER TABLE portal_registrations
    ADD COLUMN baa_dbo_verified_at DATETIME DEFAULT NULL AFTER baa_dibuat_at,
    ADD COLUMN baa_dikirim_at DATETIME DEFAULT NULL AFTER baa_dbo_verified_at,
    ADD KEY idx_portal_registrations_baa_dbo_handoff (baa_dbo_verified_at, baa_dikirim_at);

-- BAA yang sudah dibuat sebelum handoff DBO ditambahkan tetap dianggap sudah
-- dikirim apabila statusnya sedang menunggu konfirmasi lokasi.
UPDATE portal_registrations
SET baa_dikirim_at = COALESCE(baa_dikirim_at, baa_dibuat_at)
WHERE baa_status = 'menunggu_konfirmasi_lokasi'
  AND baa_dikirim_at IS NULL;
