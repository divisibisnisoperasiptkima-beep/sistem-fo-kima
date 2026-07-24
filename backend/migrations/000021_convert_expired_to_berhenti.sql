-- Ubah semua kontrak dengan status 'Proses Perpanjangan' (dulu 'Berakhir') menjadi 'Berhenti'
-- Status 'Berhenti' sudah valid secara aplikasi (termasuk dalam STATUS_OPTIONS frontend)
UPDATE lokasi
SET status_kontrak = 'Berhenti'
WHERE status_kontrak = 'Proses Perpanjangan';
