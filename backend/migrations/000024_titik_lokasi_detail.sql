CREATE TABLE IF NOT EXISTS titik_lokasi_detail (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lokasi_id BIGINT UNSIGNED NOT NULL,
    legacy_titik_pelanggan_id BIGINT UNSIGNED NULL,
    label VARCHAR(255) NOT NULL DEFAULT '',
    latitude DECIMAL(10,6) NOT NULL,
    longitude DECIMAL(10,6) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_titik_lokasi_detail_legacy (legacy_titik_pelanggan_id),
    KEY idx_titik_lokasi_detail_lokasi_id (lokasi_id),
    CONSTRAINT fk_titik_lokasi_detail_lokasi
        FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE CASCADE
);

INSERT IGNORE INTO titik_lokasi_detail
    (lokasi_id, legacy_titik_pelanggan_id, label, latitude, longitude)
SELECT
    tp.lokasi_id,
    tp.pelanggan_id,
    COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(tp.points, '$.label')), ''), l.nama_lokasi),
    CAST(JSON_UNQUOTE(JSON_EXTRACT(tp.points, '$.latitude')) AS DECIMAL(10,6)),
    CAST(JSON_UNQUOTE(JSON_EXTRACT(tp.points, '$.longitude')) AS DECIMAL(10,6))
FROM titik_pelanggan tp
JOIN lokasi l ON l.id = tp.lokasi_id
WHERE tp.lokasi_id IS NOT NULL
  AND tp.points IS NOT NULL
  AND JSON_EXTRACT(tp.points, '$.latitude') IS NOT NULL
  AND JSON_EXTRACT(tp.points, '$.longitude') IS NOT NULL;
