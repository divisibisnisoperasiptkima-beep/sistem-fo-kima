-- Penyesuaian idempoten untuk aturan bisnis terbaru.

-- Constraint lama sudah dilepas oleh backend sebelum script ini dijalankan.
-- Gunakan constraint transisional saat memigrasikan data, lalu pasang kembali
-- constraint dengan istilah baru.

ALTER TABLE lokasi
    ADD CONSTRAINT chk_lokasi_status_transitional
    CHECK (status_kontrak IN (
        'Aktif', 'Beroperasi', 'Belum Beroperasi', 'Proses Perpanjangan',
        'Diperpanjang', 'Di-upgrade', 'Nonaktif', 'Berhenti'
    ));

UPDATE lokasi SET status_kontrak = 'Beroperasi' WHERE status_kontrak = 'Aktif';
UPDATE lokasi SET status_kontrak = 'Berhenti' WHERE status_kontrak = 'Nonaktif';
UPDATE lokasi SET status_kontrak = 'Proses Perpanjangan' WHERE status_kontrak = 'Berakhir';

ALTER TABLE lokasi DROP CHECK chk_lokasi_status_transitional;
ALTER TABLE lokasi
    ADD CONSTRAINT chk_lokasi_status
    CHECK (status_kontrak IN (
        'Beroperasi', 'Belum Beroperasi', 'Proses Perpanjangan',
        'Diperpanjang', 'Di-upgrade', 'Berhenti'
    ));

CREATE TABLE IF NOT EXISTS billing_details (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    billing_id BIGINT UNSIGNED NOT NULL,
    lokasi_id BIGINT UNSIGNED NOT NULL,
    periode_mulai_layanan DATE NOT NULL,
    periode_akhir_layanan DATE NOT NULL,
    jumlah_hari INT UNSIGNED NOT NULL,
    harga_bulanan_snapshot DECIMAL(18,2) NOT NULL,
    nominal_prorata DECIMAL(18,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_billing_details_billing_id (billing_id),
    KEY idx_billing_details_lokasi_id (lokasi_id),
    CONSTRAINT fk_billing_details_billing
        FOREIGN KEY (billing_id) REFERENCES billing(id) ON DELETE CASCADE,
    CONSTRAINT fk_billing_details_lokasi
        FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS dokumen (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pelanggan_id BIGINT UNSIGNED NULL,
    lokasi_id BIGINT UNSIGNED NULL,
    billing_id BIGINT UNSIGNED NULL,
    uploaded_by_user_id BIGINT UNSIGNED NULL,
    kategori VARCHAR(50) NOT NULL,
    nama_file VARCHAR(255) NOT NULL,
    drive_file_id VARCHAR(255) NULL,
    drive_folder_id VARCHAR(255) NULL,
    drive_url VARCHAR(1000) NULL,
    ukuran_byte BIGINT UNSIGNED NULL,
    mime_type VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dokumen_drive_file_id (drive_file_id),
    KEY idx_dokumen_pelanggan_id (pelanggan_id),
    KEY idx_dokumen_lokasi_id (lokasi_id),
    KEY idx_dokumen_billing_id (billing_id),
    CONSTRAINT fk_dokumen_pelanggan
        FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
    CONSTRAINT fk_dokumen_lokasi
        FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE CASCADE,
    CONSTRAINT fk_dokumen_billing
        FOREIGN KEY (billing_id) REFERENCES billing(id) ON DELETE CASCADE,
    CONSTRAINT fk_dokumen_uploader
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

UPDATE titik_pelanggan
SET approval_status = CASE approval_status
    WHEN 'approved' THEN 'disetujui'
    WHEN 'pending' THEN 'menunggu_persetujuan'
    ELSE approval_status
END;

UPDATE rute_fo
SET approval_status = CASE approval_status
    WHEN 'approved' THEN 'disetujui'
    WHEN 'pending' THEN 'menunggu_persetujuan'
    ELSE approval_status
END;
