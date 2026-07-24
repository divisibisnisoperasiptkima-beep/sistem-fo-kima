-- Membatasi data pelanggan yang dapat dibaca oleh akun dengan role ISP.
-- Admin dan teknisi tetap memiliki akses sesuai kebijakan backend.
CREATE TABLE IF NOT EXISTS user_pelanggan_access (
    user_id BIGINT UNSIGNED NOT NULL,
    pelanggan_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, pelanggan_id),
    CONSTRAINT fk_user_pelanggan_access_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_pelanggan_access_pelanggan
        FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE
);
