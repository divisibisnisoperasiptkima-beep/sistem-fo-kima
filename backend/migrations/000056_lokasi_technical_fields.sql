-- Detail teknis per kontrak/lokasi.
-- Semua kolom bersifat opsional agar kontrak lama tetap kompatibel dan dapat
-- dilengkapi secara bertahap melalui menu Kontrak.
ALTER TABLE lokasi
    ADD COLUMN tanggal_aktivasi DATE NULL AFTER periode_berakhir,
    ADD COLUMN latitude DECIMAL(10,7) NULL AFTER tanggal_aktivasi,
    ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude,
    ADD COLUMN power DECIMAL(8,2) NULL AFTER longitude,
    ADD COLUMN vlan_id INT UNSIGNED NULL AFTER power,
    ADD COLUMN mac_modem VARCHAR(17) NULL AFTER vlan_id,
    ADD COLUMN alamat_user TEXT NULL AFTER mac_modem;
