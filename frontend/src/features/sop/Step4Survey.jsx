import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

// Catatan: integrasi upload Google Drive nyata belum tersedia (lihat known issues).
// Sementara foto menghasilkan placeholder drive_file_id lokal agar alur Step 4
// tetap dapat diuji end-to-end. Ganti generator ini saat upload Drive aktif.
const makePlaceholderDriveId = (type) =>
  `local-${type}-${Math.random().toString(36).slice(2, 10)}`;

const Step4Survey = ({ workflowId, workflow, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    hasil_survey: '',
    foto_lokasi: [],
    foto_jalur: [],
    koordinat_lat: null,
    koordinat_lng: null,
    kesiapan_jalur: 'ready',
    catatan_teknis: '',
    rekomendasi_jalur: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addPhotos = (fileList, type) => {
    const ids = Array.from(fileList).map(() =>
      makePlaceholderDriveId(type === 'location' ? 'lokasi' : 'jalur'),
    );
    setFormData((prev) =>
      type === 'location'
        ? { ...prev, foto_lokasi: [...prev.foto_lokasi, ...ids] }
        : { ...prev, foto_jalur: [...prev.foto_jalur, ...ids] },
    );
  };

  const handleGeoLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation tidak didukung browser ini.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          koordinat_lat: position.coords.latitude,
          koordinat_lng: position.coords.longitude,
        }));
      },
      () => setError('Gagal mengambil lokasi. Silakan masukkan manual.'),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.foto_lokasi.length === 0 && formData.foto_jalur.length === 0) {
      setError('Minimal satu foto harus dipilih (foto lokasi atau jalur).');
      return;
    }
    if (!formData.hasil_survey.trim()) {
      setError('Deskripsi hasil survey wajib diisi.');
      return;
    }
    if (formData.kesiapan_jalur === 'not_ready' && !formData.rekomendasi_jalur.trim()) {
      setError('Alasan ketidaksiapan & rekomendasi wajib diisi.');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 4, formData);
      onDone?.(formData.kesiapan_jalur);
    } catch (err) {
      setError(err?.message || 'Gagal mengirim survey.');
    } finally {
      setLoading(false);
    }
  };

  const kesiapanClass =
    formData.kesiapan_jalur === 'ready'
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-red-50 border-red-200 text-red-800';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 4: Survey Teknis</h2>
          <p className="text-sm text-gray-600 mt-1">
            Workflow: {workflow?.nama_lokasi || `#${workflowId}`}
            {workflow?.kode_lokasi ? ` | Kode: ${workflow.kode_lokasi}` : ''}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Hasil Survey Lapangan</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto Lokasi *</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => addPhotos(e.target.files, 'location')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.foto_lokasi.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{formData.foto_lokasi.length} foto dipilih</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto Jalur FO *</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => addPhotos(e.target.files, 'route')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.foto_jalur.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{formData.foto_jalur.length} foto dipilih</p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Koordinat Lokasi (Auto-detect via GPS)
              </label>
              <div className="flex space-x-4">
                <input
                  type="number"
                  step="0.000001"
                  value={formData.koordinat_lat ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, koordinat_lat: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="Latitude"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  step="0.000001"
                  value={formData.koordinat_lng ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, koordinat_lng: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="Longitude"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleGeoLocation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Auto GPS
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Hasil Survey *</label>
              <textarea
                value={formData.hasil_survey}
                onChange={(e) => setFormData({ ...formData, hasil_survey: e.target.value })}
                rows={4}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jelaskan kondisi lokasi, jalur FO yang tersedia, aksesibilitas, dan hambatan teknis lainnya..."
              />
            </div>
          </div>

          <div className={`border-l-4 p-4 ${kesiapanClass}`}>
            <h3 className="text-lg font-semibold mb-3">Keputusan Kesiapan Jalur</h3>

            <div className="space-y-3 mb-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="kesiapan_jalur"
                  value="ready"
                  checked={formData.kesiapan_jalur === 'ready'}
                  onChange={(e) => setFormData({ ...formData, kesiapan_jalur: e.target.value })}
                  className="w-5 h-5"
                />
                <span className="font-medium">Jalur Siap - Dapat melanjutkan ke tahap proposal</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="kesiapan_jalur"
                  value="not_ready"
                  checked={formData.kesiapan_jalur === 'not_ready'}
                  onChange={(e) => setFormData({ ...formData, kesiapan_jalur: e.target.value })}
                  className="w-5 h-5"
                />
                <span className="font-medium">Jalur Tidak Siap - Perlu revisi lokasi/penyesuaian</span>
              </label>
            </div>

            {formData.kesiapan_jalur === 'not_ready' && (
              <div>
                <label className="block text-sm font-medium mb-1">Alasan Ketidaksiapan & Rekomendasi *</label>
                <textarea
                  value={formData.rekomendasi_jalur}
                  onChange={(e) => setFormData({ ...formData, rekomendasi_jalur: e.target.value })}
                  rows={3}
                  placeholder="Jelaskan mengapa jalur tidak siap dan berikan rekomendasi perbaikan..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Teknis Tambahan</label>
            <textarea
              value={formData.catatan_teknis}
              onChange={(e) => setFormData({ ...formData, catatan_teknis: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Catatan lain yang perlu diperhatikan (misal: risiko lingkungan, izin setempat, dll)..."
            />
          </div>

          <div className="flex space-x-4 pt-4 border-t">
            <button
              type="submit"
              disabled={loading || !formData.hasil_survey.trim()}
              className={`flex-1 py-3 px-6 rounded-md font-medium text-white transition-colors ${
                loading || !formData.hasil_survey.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : formData.kesiapan_jalur === 'ready'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Submit Survey'}
            </button>
            <button
              type="button"
              onClick={() => onBack?.()}
              className="px-6 py-3 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Step4Survey;
