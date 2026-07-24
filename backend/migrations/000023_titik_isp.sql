CREATE TABLE IF NOT EXISTS titik_isp (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pelanggan_id  BIGINT UNSIGNED NOT NULL,
    label         VARCHAR(255) NOT NULL DEFAULT '',
    latitude      DECIMAL(10,6) NOT NULL,
    longitude     DECIMAL(10,6) NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_titik_isp_pelanggan_id (pelanggan_id),
    CONSTRAINT fk_titik_isp_pelanggan
        FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE
);
