CREATE TABLE IF NOT EXISTS sop2_notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    request_id BIGINT UNSIGNED NOT NULL,
    recipient_role VARCHAR(30) NOT NULL,
    recipient_user_id BIGINT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sop2_notifications_recipient (recipient_role, recipient_user_id, read_at, created_at),
    KEY idx_sop2_notifications_request (request_id),
    CONSTRAINT fk_sop2_notifications_request FOREIGN KEY (request_id) REFERENCES sop2_service_change_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_sop2_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
