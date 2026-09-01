CREATE TABLE IF NOT EXISTS portal_registrations (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    kode_registrasi     VARCHAR(50) NOT NULL,

    nama_perusahaan     VARCHAR(200) NOT NULL,
    email_perusahaan    VARCHAR(150) NOT NULL,
    telepon_perusahaan  VARCHAR(50) NOT NULL,
    npwp                VARCHAR(50) DEFAULT NULL,

    pic_nama            VARCHAR(150) NOT NULL,
    pic_email           VARCHAR(150) NOT NULL,
    pic_telepon         VARCHAR(50) NOT NULL,
    pic_jabatan         VARCHAR(100) DEFAULT NULL,

    lokasi_nama         VARCHAR(200) NOT NULL,
    lokasi_alamat       TEXT NOT NULL,
    lokasi_kota         VARCHAR(100) DEFAULT NULL,
    lokasi_provinsi     VARCHAR(100) DEFAULT NULL,
    lokasi_kode_pos     VARCHAR(20) DEFAULT NULL,
    core_dedicated      INT NOT NULL DEFAULT 0,
    sharing_core        VARCHAR(10) DEFAULT NULL,

    status              VARCHAR(20) NOT NULL DEFAULT 'menunggu',
    rejection_reason    TEXT DEFAULT NULL,

    -- Password acak dibuat saat approve, disimpan plaintext sementara agar admin bisa
    -- menyalin & menyampaikan manual ke pelanggan (belum ada mesin email/SMTP).
    -- Ini trade-off sementara sampai mailer nyata dibangun; jangan pakai pola ini
    -- untuk data password permanen lain.
    generated_password  VARCHAR(100) DEFAULT NULL,

    pelanggan_id        BIGINT UNSIGNED DEFAULT NULL,
    user_id             BIGINT UNSIGNED DEFAULT NULL,
    lokasi_id           BIGINT UNSIGNED DEFAULT NULL,
    workflow_id         BIGINT UNSIGNED DEFAULT NULL,

    processed_by_user_id BIGINT UNSIGNED DEFAULT NULL,
    processed_at        DATETIME DEFAULT NULL,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_portal_registrations_kode (kode_registrasi),
    KEY idx_portal_registrations_status (status),
    KEY idx_portal_registrations_email (email_perusahaan),
    CONSTRAINT chk_portal_registrations_status
        CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
    CONSTRAINT fk_portal_registrations_pelanggan
        FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE SET NULL,
    CONSTRAINT fk_portal_registrations_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_portal_registrations_lokasi
        FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE SET NULL,
    CONSTRAINT fk_portal_registrations_workflow
        FOREIGN KEY (workflow_id) REFERENCES sop_workflows(id) ON DELETE SET NULL,
    CONSTRAINT fk_portal_registrations_processed_by
        FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
