-- Data awal ISP pada instalasi lama berada di tabel pelanggan.
-- Impor satu kali agar ISP tersebut tersedia pada pilihan survei, tanpa
-- menjadikan setiap pelanggan baru sebagai ISP secara otomatis.
ALTER TABLE isp_directory
    ADD COLUMN pelanggan_id BIGINT UNSIGNED DEFAULT NULL AFTER id,
    ADD UNIQUE KEY uq_isp_directory_pelanggan (pelanggan_id),
    ADD CONSTRAINT fk_isp_directory_pelanggan
        FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE SET NULL;

INSERT INTO isp_directory
    (pelanggan_id, nama_isp, pic_nama, email, telepon, catatan, status)
SELECT p.id, p.nama_pelanggan, p.pic, p.email, p.telepon,
       'Diimpor dari data Pelanggan lama; verifikasi oleh Admin KIMA.', 'aktif'
FROM pelanggan p
WHERE NOT EXISTS (
    SELECT 1 FROM isp_directory d WHERE d.pelanggan_id = p.id
)
AND NOT EXISTS (
    SELECT 1 FROM isp_directory d WHERE LOWER(d.nama_isp) = LOWER(p.nama_pelanggan)
);
