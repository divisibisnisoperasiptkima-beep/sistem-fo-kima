CREATE TABLE IF NOT EXISTS sop2_step_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    request_id BIGINT UNSIGNED NOT NULL,
    step_nomor TINYINT UNSIGNED NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    action_type VARCHAR(50) NOT NULL,
    detail_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sop2_history_request (request_id, created_at),
    CONSTRAINT fk_sop2_history_request FOREIGN KEY (request_id) REFERENCES sop2_service_change_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_sop2_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
