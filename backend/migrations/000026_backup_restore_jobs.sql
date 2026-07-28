CREATE TABLE IF NOT EXISTS backup_restore_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    backup_job_id BIGINT UNSIGNED NOT NULL,
    temporary_database VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    table_count BIGINT UNSIGNED NULL,
    error_message TEXT NULL,
    PRIMARY KEY (id),
    KEY idx_backup_restore_jobs_backup_job_id (backup_job_id),
    KEY idx_backup_restore_jobs_status (status),
    CONSTRAINT fk_backup_restore_jobs_backup
        FOREIGN KEY (backup_job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE
);
