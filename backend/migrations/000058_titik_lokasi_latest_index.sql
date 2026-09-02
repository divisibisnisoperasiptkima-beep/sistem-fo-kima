-- Mengoptimalkan pemilihan titik lokasi terakhir yang diatur untuk tabel
-- kontrak, Titik Peta, dan pengisian BAA.
CREATE INDEX idx_titik_lokasi_detail_lokasi_updated
    ON titik_lokasi_detail (lokasi_id, updated_at, id);
