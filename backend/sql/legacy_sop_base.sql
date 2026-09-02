-- Bootstrap idempoten untuk empat tabel SOP yang dahulu dibuat di luar
-- direktori migrasi SQLx backend. ID tetap mengikuti definisi legacy (signed)
-- dan segera diselaraskan menjadi UNSIGNED oleh schema::reconcile_sop_id_types.

CREATE TABLE IF NOT EXISTS sop_workflows (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    pelanggan_id BIGINT UNSIGNED NOT NULL,
    lokasi_id BIGINT UNSIGNED NULL,
    nama_lokasi_diajukan VARCHAR(200) NOT NULL,
    alamat_lokasi_diajukan TEXT,
    core_diajukan INT DEFAULT 0,
    sharing_core_diajukan VARCHAR(10) DEFAULT 'Tidak',
    kota VARCHAR(100),
    provinsi VARCHAR(100),
    current_step INT DEFAULT 1,
    total_steps INT DEFAULT 18,
    status ENUM('draft', 'in_progress', 'completed', 'cancelled', 'rejected') DEFAULT 'draft',
    back_to_step INT NULL,
    rejection_reason TEXT NULL,
    assigned_to_role VARCHAR(50),
    assigned_to_user_id BIGINT UNSIGNED NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    expired_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pelanggan (pelanggan_id),
    INDEX idx_lokasi (lokasi_id),
    INDEX idx_status (status),
    INDEX idx_current_step (current_step),
    INDEX idx_assigned (assigned_to_role, assigned_to_user_id),
    FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
    FOREIGN KEY (lokasi_id) REFERENCES lokasi(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sop_step_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_id BIGINT NOT NULL,
    step_nomor INT NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    action_type VARCHAR(100) NOT NULL,
    description TEXT,
    back_to_step INT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_workflow_step (workflow_id, step_nomor),
    INDEX idx_actor (actor_role, actor_user_id),
    INDEX idx_created (created_at),
    FOREIGN KEY (workflow_id) REFERENCES sop_workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sop_documents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_id BIGINT NOT NULL,
    step_nomor INT NULL,
    kategori VARCHAR(100) NOT NULL,
    nama_file VARCHAR(255) NOT NULL,
    deskripsi TEXT,
    drive_file_id VARCHAR(255),
    drive_folder_id VARCHAR(255),
    ukuran_byte BIGINT,
    mime_type VARCHAR(100),
    upload_status ENUM('pending', 'uploaded', 'verified', 'rejected', 'expired') DEFAULT 'pending',
    uploaded_by_user_id BIGINT UNSIGNED NULL,
    uploaded_by_role VARCHAR(50),
    verified_by_user_id BIGINT UNSIGNED NULL,
    verified_by_role VARCHAR(50),
    verified_at TIMESTAMP NULL,
    verification_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_workflow_doc (workflow_id, step_nomor),
    INDEX idx_status (upload_status),
    INDEX idx_kategori (kategori),
    FOREIGN KEY (workflow_id) REFERENCES sop_workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registration_tokens (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    pelanggan_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_pelanggan (pelanggan_id),
    FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @add_email_verified := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'
);
PREPARE stmt FROM @add_email_verified;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_verif_token := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(64) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verification_token'
);
PREPARE stmt FROM @add_verif_token;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_phone := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_number'
);
PREPARE stmt FROM @add_phone;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
