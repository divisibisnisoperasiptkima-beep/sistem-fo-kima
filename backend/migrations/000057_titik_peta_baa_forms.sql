-- Data form BAA disimpan terpisah dari berkas agar dokumen dapat diedit
-- dan dibuat ulang tanpa mengandalkan isi PDF/DOCX sebagai sumber data.
CREATE TABLE IF NOT EXISTS titik_peta_baa_forms (
    lokasi_id BIGINT UNSIGNED NOT NULL,
    document_id BIGINT UNSIGNED NULL,
    form_data JSON NOT NULL,
    updated_by_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (lokasi_id),
    KEY idx_titik_peta_baa_document (document_id),
    KEY idx_titik_peta_baa_updated_by (updated_by_user_id),
    CONSTRAINT fk_titik_peta_baa_lokasi
        FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE CASCADE,
    CONSTRAINT fk_titik_peta_baa_document
        FOREIGN KEY (document_id) REFERENCES dokumen(id) ON DELETE SET NULL
);
