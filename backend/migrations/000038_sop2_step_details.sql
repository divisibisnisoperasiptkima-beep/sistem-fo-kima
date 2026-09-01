ALTER TABLE sop2_service_change_requests
    ADD COLUMN detail_json JSON NULL AFTER rejection_reason,
    ADD COLUMN last_action VARCHAR(50) NULL AFTER detail_json;
