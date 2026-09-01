-- Master data ISP KIMA dipisahkan dari akun login.
-- ISP dapat dipilih dalam survei meskipun belum memiliki user account.
CREATE TABLE IF NOT EXISTS isp_directory (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nama_isp            VARCHAR(200) NOT NULL,
    pic_nama            VARCHAR(150) DEFAULT NULL,
    email               VARCHAR(150) DEFAULT NULL,
    telepon             VARCHAR(50) DEFAULT NULL,
    wilayah             VARCHAR(200) DEFAULT NULL,
    catatan             TEXT DEFAULT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'aktif',
    user_id             BIGINT UNSIGNED DEFAULT NULL,
    created_by_user_id  BIGINT UNSIGNED DEFAULT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_isp_directory_nama (nama_isp),
    UNIQUE KEY uq_isp_directory_user (user_id),
    KEY idx_isp_directory_status (status),
    CONSTRAINT chk_isp_directory_status CHECK (status IN ('aktif', 'nonaktif')),
    CONSTRAINT fk_isp_directory_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_isp_directory_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE portal_registrations
    ADD COLUMN isp_directory_id BIGINT UNSIGNED DEFAULT NULL AFTER isp_user_id,
    ADD KEY idx_portal_registrations_isp_directory (isp_directory_id),
    ADD CONSTRAINT fk_portal_registrations_isp_directory
        FOREIGN KEY (isp_directory_id) REFERENCES isp_directory(id) ON DELETE SET NULL;

-- Backfill ISP yang sudah memiliki akun agar histori lama langsung terbaca
-- sebagai master ISP, tanpa mengubah relasi akun legacy.
INSERT INTO isp_directory (nama_isp, email, user_id)
SELECT u.email, u.email, u.id
FROM users u
WHERE u.role = 'isp'
  AND NOT EXISTS (SELECT 1 FROM isp_directory d WHERE d.user_id = u.id);

UPDATE portal_registrations pr
JOIN isp_directory d ON d.user_id = pr.isp_user_id
SET pr.isp_directory_id = d.id
WHERE pr.isp_directory_id IS NULL;
