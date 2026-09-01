-- Tambahkan constraint role yang konsisten untuk tabel users
-- Data sudah divalidasi sebelumnya, semua role sudah valid

-- Tambahkan constraint baru langsung (MySQL akan error jika sudah ada, yang tidak masalah)
ALTER TABLE users
  ADD CONSTRAINT chk_users_role_supported
  CHECK (role IN (
    'admin', 'teknisi', 'isp', 'pelanggan',
    'dbo', 'legal', 'direksi', 'keuangan'
  ));
