-- Tahap 8-10: invoice, pengiriman, dan pembayaran.
ALTER TABLE portal_registrations
    ADD COLUMN invoice_nomor VARCHAR(100) DEFAULT NULL AFTER baa_lokasi_accepted_at,
    ADD COLUMN invoice_nilai DECIMAL(18,2) DEFAULT NULL AFTER invoice_nomor,
    ADD COLUMN invoice_jatuh_tempo DATE DEFAULT NULL AFTER invoice_nilai,
    ADD COLUMN invoice_status VARCHAR(32) NOT NULL DEFAULT 'belum_dibuat' AFTER invoice_jatuh_tempo,
    ADD COLUMN invoice_dikirim_at DATETIME DEFAULT NULL AFTER invoice_status,
    ADD COLUMN pembayaran_status VARCHAR(32) NOT NULL DEFAULT 'belum_dibayar' AFTER invoice_dikirim_at,
    ADD COLUMN pembayaran_catatan TEXT DEFAULT NULL AFTER pembayaran_status,
    ADD COLUMN pembayaran_dikonfirmasi_at DATETIME DEFAULT NULL AFTER pembayaran_catatan,
    ADD KEY idx_portal_registrations_invoice_status (invoice_status),
    ADD KEY idx_portal_registrations_pembayaran_status (pembayaran_status);
