import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

const Step5Proposal = ({ workflowId, workflow, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    judul_proposal: '',
    nomor_proposal: '',
    tanggal_proposal: '',
    nilai_penawaran: 0,
    biaya_instalasi: 0,
    biaya_bulanan: 0,
    durasi_kontrak_bulan: 12,
    garansi_sla: '',
    terms_conditions: '',
    proposal_file_id: null,
    catatan_dbo: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposalFile, setProposalFile] = useState(null);

  const generateNomorProposal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `PROP-${year}${month}${day}-${String(workflowId).padStart(3, '0')}`;
  };

  // Integrasi upload Google Drive nyata belum tersedia (lihat known issues).
  // Sementara file proposal menghasilkan placeholder drive_file_id lokal.
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProposalFile(file);
    setFormData((prev) => ({
      ...prev,
      proposal_file_id: `local-proposal-${Math.random().toString(36).slice(2, 10)}`,
    }));
  };

  const calculateTotal = () => {
    const total =
      formData.nilai_penawaran +
      formData.biaya_instalasi +
      formData.biaya_bulanan * formData.durasi_kontrak_bulan;
    return total.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' });
  };

  const isFormValid = () =>
    formData.judul_proposal.trim() &&
    formData.nomor_proposal.trim() &&
    formData.tanggal_proposal &&
    formData.nilai_penawaran > 0 &&
    formData.biaya_instalasi > 0 &&
    formData.biaya_bulanan > 0 &&
    formData.durasi_kontrak_bulan > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isFormValid()) {
      setError('Lengkapi semua field wajib (judul, nomor, tanggal, dan biaya).');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 5, formData);
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan proposal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 5: Penyusunan Proposal</h2>
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
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Informasi Proposal</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Proposal *</label>
                <input
                  type="text"
                  value={formData.judul_proposal}
                  onChange={(e) => setFormData({ ...formData, judul_proposal: e.target.value })}
                  placeholder="Contoh: Penawaran Layanan Fiber Optic untuk PT XYZ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Proposal *</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.nomor_proposal}
                    onChange={(e) => setFormData({ ...formData, nomor_proposal: e.target.value })}
                    placeholder="PROP-2025-001"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, nomor_proposal: generateNomorProposal() })}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Proposal *</label>
                <input
                  type="date"
                  value={formData.tanggal_proposal}
                  onChange={(e) => setFormData({ ...formData, tanggal_proposal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Struktur Biaya</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nilai Penawaran (Total) *</label>
                <input
                  type="number"
                  value={formData.nilai_penawaran}
                  onChange={(e) => setFormData({ ...formData, nilai_penawaran: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biaya Instalasi *</label>
                <input
                  type="number"
                  value={formData.biaya_instalasi}
                  onChange={(e) => setFormData({ ...formData, biaya_instalasi: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biaya Bulanan *</label>
                <input
                  type="number"
                  value={formData.biaya_bulanan}
                  onChange={(e) => setFormData({ ...formData, biaya_bulanan: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durasi Kontrak (bulan) *</label>
                <input
                  type="number"
                  value={formData.durasi_kontrak_bulan}
                  onChange={(e) => setFormData({ ...formData, durasi_kontrak_bulan: parseInt(e.target.value, 10) || 0 })}
                  placeholder="12"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Garansi SLA</label>
                <input
                  type="text"
                  value={formData.garansi_sla}
                  onChange={(e) => setFormData({ ...formData, garansi_sla: e.target.value })}
                  placeholder="Contoh: 99.5% uptime"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Total Nilai Kontrak:</span>
                <span className="text-2xl font-bold text-blue-600">{calculateTotal()}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Termasuk instalasi +{' '}
                {(formData.durasi_kontrak_bulan * formData.biaya_bulanan).toLocaleString('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                })}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
            <textarea
              value={formData.terms_conditions}
              onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
              rows={4}
              placeholder="Syarat dan ketentuan kontrak, jadwal pembayaran, klausul penting lainnya..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border-b pb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload File Proposal (PDF)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {proposalFile && (
              <p className="text-xs text-green-600 mt-2">
                File dipilih: {proposalFile.name} ({(proposalFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Internal DBO</label>
            <textarea
              value={formData.catatan_dbo}
              onChange={(e) => setFormData({ ...formData, catatan_dbo: e.target.value })}
              rows={3}
              placeholder="Catatan untuk tim internal (tidak ditampilkan ke customer)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex space-x-4 pt-4 border-t">
            <button
              type="submit"
              disabled={loading || !isFormValid()}
              className={`flex-1 py-3 px-6 rounded-md font-medium text-white transition-colors ${
                loading || !isFormValid() ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Simpan & Lanjut ke Presentasi'}
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

export default Step5Proposal;
