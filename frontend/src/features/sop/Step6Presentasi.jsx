import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

const Step6Presentasi = ({ workflowId, workflow, userRole, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    tanggal_presentasi: '',
    metode_presentasi: 'online', // 'online', 'offline', 'hybrid'
    peserta_presentasi: '',
    hasil_presentasi: '',
    keputusan_pelanggan: 'setuju', // 'setuju', 'negosiasi', 'tolak'
    alasan_negosiasi: '',
    permintaan_revisi: '',
    notulen_file_id: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notulenFile, setNotulenFile] = useState(null);

  // User role: 'dbo' (presenter) atau 'customer' (decision maker)
  const isDBO = userRole === 'dbo' || userRole === 'admin';
  const isCustomer = userRole === 'pelanggan' || userRole === 'isp';

  // Integrasi upload Google Drive nyata belum tersedia (lihat known issues).
  // Sementara notulen menghasilkan placeholder drive_file_id lokal.
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotulenFile(file);
      setFormData({ ...formData, notulen_file_id: `local-notulen-${Math.random().toString(36).slice(2, 10)}` });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isCustomer && formData.keputusan_pelanggan === 'negosiasi' && !formData.permintaan_revisi.trim()) {
      setError('Jelaskan apa yang perlu direvisi.');
      return;
    }
    if (isCustomer && formData.keputusan_pelanggan === 'tolak' && !formData.alasan_negosiasi.trim()) {
      setError('Alasan penolakan wajib diisi.');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 6, formData);
      onDone?.(formData.keputusan_pelanggan);
    } catch (err) {
      setError(err?.message || 'Gagal mengirim presentasi.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    const baseValid = formData.tanggal_presentasi &&
                      formData.hasil_presentasi.trim();

    if (isCustomer) {
      // Customer juga harus pilih keputusan
      return baseValid && formData.keputusan_pelanggan;
    }

    return baseValid;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 6: Presentasi Proposal</h2>
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
          {/* Info Presentasi */}
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {isDBO ? '📊 Detail Presentasi' : '📋 Ringkasan Presentasi'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal Presentasi *
                </label>
                <input
                  type="date"
                  value={formData.tanggal_presentasi}
                  onChange={(e) => setFormData({ ...formData, tanggal_presentasi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metode Presentasi *
                </label>
                <select
                  value={formData.metode_presentasi}
                  onChange={(e) => setFormData({ ...formData, metode_presentasi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="online">Online (Zoom/Meet/Teams)</option>
                  <option value="offline">Offline (Tatap Muka)</option>
                  <option value="hybrid">Hybrid (Kombinasi)</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Peserta Presentasi
                </label>
                <textarea
                  value={formData.peserta_presentasi}
                  onChange={(e) => setFormData({ ...formData, peserta_presentasi: e.target.value })}
                  rows={2}
                  placeholder="Daftar nama peserta dari kedua belah pihak..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hasil Presentasi / Ringkasan Diskusi *
                </label>
                <textarea
                  value={formData.hasil_presentasi}
                  onChange={(e) => setFormData({ ...formData, hasil_presentasi: e.target.value })}
                  rows={4}
                  placeholder="Jelaskan poin-poin penting yang dibahas, feedback dari customer, dan kesimpulan diskusi..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Keputusan Pelanggan (Only visible to customer) */}
          {isCustomer && (
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">🤝 Keputusan Anda</h3>

              <div className="space-y-3 mb-4">
                <label className="flex items-start space-x-3 cursor-pointer p-4 border-2 rounded-lg hover:bg-green-50 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="setuju"
                    checked={formData.keputusan_pelanggan === 'setuju'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-green-700">✅ Setuju</span>
                    <p className="text-sm text-gray-600">Terima proposal dan lanjut ke tahap selanjutnya (Upload PO & Dokumen Legalitas)</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer p-4 border-2 rounded-lg hover:bg-yellow-50 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="negosiasi"
                    checked={formData.keputusan_pelanggan === 'negosiasi'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-yellow-700">💬 Negosiasi</span>
                    <p className="text-sm text-gray-600">Perlu revisi proposal (harga, terms, atau fitur layanan)</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer p-4 border-2 rounded-lg hover:bg-red-50 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="tolak"
                    checked={formData.keputusan_pelanggan === 'tolak'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-red-700">❌ Tolak</span>
                    <p className="text-sm text-gray-600">Batalkan permohonan (workflow berhenti)</p>
                  </div>
                </label>
              </div>

              {formData.keputusan_pelanggan === 'negosiasi' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apa yang perlu direvisi? *
                  </label>
                  <textarea
                    value={formData.permintaan_revisi}
                    onChange={(e) => setFormData({ ...formData, permintaan_revisi: e.target.value })}
                    rows={3}
                    placeholder="Jelaskan apa yang perlu direvisi dalam proposal (misal: harga terlalu tinggi, durasi kontrak terlalu pendek, dll)..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formData.keputusan_pelanggan === 'tolak' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alasan Penolakan *
                  </label>
                  <textarea
                    value={formData.alasan_negosiasi}
                    onChange={(e) => setFormData({ ...formData, alasan_negosiasi: e.target.value })}
                    rows={3}
                    placeholder="Jelaskan alasan penolakan untuk dokumentasi..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Upload Notulen */}
          <div className="border-b pb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload Notulen Meeting (PDF/Image)
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {notulenFile && (
              <p className="text-xs text-green-600 mt-1">✓ File ter-upload: {notulenFile.name}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4 border-t">
            <button
              type="submit"
              disabled={loading || !isFormValid()}
              className={`flex-1 py-3 px-6 rounded-md font-medium text-white transition-colors ${
                loading || !isFormValid()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isDBO
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : formData.keputusan_pelanggan === 'setuju'
                  ? 'bg-green-600 hover:bg-green-700'
                  : formData.keputusan_pelanggan === 'negosiasi'
                  ? 'bg-yellow-600 hover:bg-yellow-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Submit Presentasi'}
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

export default Step6Presentasi;
