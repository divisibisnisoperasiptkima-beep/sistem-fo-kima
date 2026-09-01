CREATE TABLE IF NOT EXISTS admin_notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source VARCHAR(20) NOT NULL,
    reference_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_notifications_reference (source, reference_id),
    KEY idx_admin_notifications_read (read_at, created_at),
    KEY idx_admin_notifications_source_reference (source, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pendaftaran yang sudah ada sebelum fitur notifikasi diaktifkan tetap muncul
-- sebagai notifikasi awal selama masih menunggu tinjauan Admin.
INSERT IGNORE INTO admin_notifications (source, reference_id, title, message)
SELECT 'sop1', id, 'Permohonan layanan baru',
       CONCAT('Permohonan ', kode_registrasi, ' dari ', nama_perusahaan,
              ' menunggu tinjauan Admin.')
FROM portal_registrations
WHERE status = 'menunggu';
