import { useState, useEffect } from 'react';
import { getSession, listWorkflows, getWorkflowStatus, submitStep } from '../../lib/rust-api';

const PortalDashboard = ({ onRegister }) => {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentStepData, setCurrentStepData] = useState({});

  // Fetch workflows from API
  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const session = getSession();
      if (!session || !session.token) {
        setLoading(false);
        return;
      }

      const data = await listWorkflows(session.token, { assigned_to_role: 'pelanggan' });

      // Transform API response
      const transformed = data.map(wf => ({
        id: wf.id,
        kode_lokasi: wf.kode_lokasi || wf.lokasi_code || '',
        nama_lokasi: wf.nama_lokasi_diajukan || wf.nama_lokasi || '',
        pelanggan_nama: wf.nama_pelanggan || '',
        current_step: wf.current_step || 1,
        total_steps: 18,
        status: wf.status || 'in_progress',
        assigned_to_role: wf.assigned_to_role || 'customer',
        created_at: wf.started_at,
        updated_at: wf.updated_at,
        back_to_step: wf.back_to_step || null,
        rejection_reason: wf.rejection_reason || null,
        step_history: [], // Will be fetched separately when clicking on workflow
        documents: [], // Will be fetched separately
      }));

      setWorkflows(transformed);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      alert('Gagal memuat daftar workflow Anda. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowClick = async (workflow) => {
    try {
      const session = getSession();
      if (!session || !session.token) return;

      const data = await getWorkflowStatus(session.token, workflow.id);

      setSelectedWorkflow({
        ...workflow,
        ...data,
        step_history: data.step_history || [],
        documents: data.documents || [],
      });
    } catch (error) {
      console.error('Error fetching workflow details:', error);
      alert('Gagal memuat detail workflow. Silakan coba lagi.');
    }
  };

  const handleStepSubmit = async (stepNumber) => {
    if (!selectedWorkflow) return;

    try {
      const session = getSession();
      if (!session || !session.token) return;

      await submitStep(session.token, selectedWorkflow.id, stepNumber, currentStepData);

      alert(`Step ${stepNumber} berhasil disubmit!`);

      // Refresh workflow data
      fetchWorkflows();
      setCurrentStepData({});
      setSelectedWorkflow(null);
    } catch (error) {
      alert(`Error: ${error?.message || 'Gagal submit step.'}`);
    }
  };

  const getStatusBadge = (status) => {
    switch(status?.toLowerCase()) {
      case 'completed':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">✅ Selesai</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">❌ Ditolak</span>;
      case 'cancelled':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">⚠️ Dibatalkan</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">🟢 Sedang Berjalan</span>;
    }
  };

  const getSLAIndicator = (createdAt) => {
    if (!createdAt) return null;

    const createdAtDate = new Date(createdAt);
    const now = new Date();
    const diffDays = Math.floor((now - createdAtDate) / (1000 * 60 * 60 * 24));

    let color, label;
    if (diffDays <= 5) {
      color = 'bg-green-500';
      label = `${diffDays}d`;
    } else if (diffDays <= 10) {
      color = 'bg-yellow-500';
      label = `${diffDays}d ⚠️`;
    } else {
      color = 'bg-red-500';
      label = `${diffDays}d 🔴`;
    }

    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-xs font-bold ${color}`} title={`Aktif selama ${diffDays} hari`}>
        {label}
      </div>
    );
  };

  const getStepStatus = (stepNum, currentStep) => {
    if (stepNum < currentStep) return 'completed';
    if (stepNum === currentStep) return 'current';
    return 'pending';
  };

  const getStepColor = (status) => {
    switch(status) {
      case 'completed': return 'bg-green-500 text-white';
      case 'current': return 'bg-blue-600 text-white';
      case 'pending': return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-600">Memuat data workflow Anda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Portal Mitra</h1>
        <p className="text-sm text-gray-600 mt-1">Selamat datang, {workflows[0]?.pelanggan_nama || 'Pelanggan'}!</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Permohonan</h3>
          <p className="text-2xl font-bold text-blue-600">{workflows.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Sedang Berjalan</h3>
          <p className="text-2xl font-bold text-blue-600">{workflows.filter(w => w.status === 'in_progress').length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Selesai</h3>
          <p className="text-2xl font-bold text-green-600">{workflows.filter(w => w.status === 'completed').length}</p>
        </div>
      </div>

      {/* Workflow List */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Daftar Permohonan Anda ({workflows.length})</h2>
        </div>

        {workflows.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">Anda belum memiliki permohonan yang sedang berjalan.</p>
            <button
              type="button"
              onClick={() => onRegister?.()}
              className="mt-3 inline-block text-blue-600 hover:text-blue-800 font-medium"
            >
              + Ajukan Permohonan Baru
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                onClick={() => handleWorkflowClick(workflow)}
                className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedWorkflow?.id === workflow.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-semibold text-gray-900">{workflow.kode_lokasi}</h3>
                      {getStatusBadge(workflow.status)}
                      {getSLAIndicator(workflow.created_at)}
                    </div>

                    <p className="text-sm text-gray-700 mt-1">{workflow.nama_lokasi}</p>
                    <p className="text-sm text-gray-500">Kode: {workflow.kode_lokasi}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <span className="font-medium">Langkah:</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-bold">
                        {workflow.current_step}/18
                      </span>
                      <span>•</span>
                      <span className="text-green-600 font-medium">
                        {workflow.status?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 w-full max-w-md bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          workflow.status === 'rejected' ? 'bg-red-500' :
                          workflow.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${(workflow.current_step / 18) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Status Column */}
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">
                      Dimulai: {new Date(workflow.created_at).toLocaleDateString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500">
                      Update terakhir: {new Date(workflow.updated_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow Detail View (when clicked) */}
      {selectedWorkflow && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-l-4 border-blue-500">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-900">{selectedWorkflow.nama_lokasi}</h2>
            {getStatusBadge(selectedWorkflow.status)}
          </div>

          <p className="text-sm text-gray-600 mb-4">Kode: {selectedWorkflow.kode_lokasi} | Langkah {selectedWorkflow.current_step}/18</p>

          {/* Current Step Form (for Step 3 - Customer Confirmation) */}
          {selectedWorkflow.current_step === 3 && selectedWorkflow.assigned_to_role === 'customer' && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Langkah 3: Konfirmasi Kebutuhan</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Core Dedicated *</label>
                  <input
                    type="number"
                    value={currentStepData.core_dedicated || ''}
                    onChange={(e) => setCurrentStepData({...currentStepData, core_dedicated: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Masukkan jumlah core yang dibutuhkan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sharing Core *</label>
                  <select
                    value={currentStepData.sharing_core || 'Tidak'}
                    onChange={(e) => setCurrentStepData({...currentStepData, sharing_core: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Tidak">Tidak (Dedicated)</option>
                    <option value="Ya">Ya (Sharing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan</label>
                  <textarea
                    value={currentStepData.keterangan || ''}
                    onChange={(e) => setCurrentStepData({...currentStepData, keterangan: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Jelaskan kebutuhan khusus atau catatan tambahan..."
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => handleStepSubmit(3)}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Konfirmasi & Lanjut ke Survey
                  </button>
                  <button
                    onClick={() => setSelectedWorkflow(null)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step History */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Riwayat Langkah</h3>
            <div className="space-y-2">
              {selectedWorkflow.step_history.map((step, index) => (
                <div key={index} className="flex items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${getStepColor(getStepStatus(step.step_nomor, selectedWorkflow.current_step))}`}>
                    {step.step_nomor}
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="font-medium text-gray-900">Step {step.step_nomor}</p>
                    <p className="text-sm text-gray-600">{step.actor_role}</p>
                    <p className="text-xs text-gray-500">{new Date(step.created_at).toLocaleString('id-ID')}</p>
                    {step.description && <p className="text-sm text-gray-700 mt-1">{step.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          {selectedWorkflow.documents && selectedWorkflow.documents.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Dokumen</h3>
              <div className="space-y-2">
                {selectedWorkflow.documents.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{doc.nama_file}</p>
                        <p className="text-xs text-gray-600">{doc.kategori}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      doc.upload_status === 'verified' ? 'bg-green-100 text-green-800' :
                      doc.upload_status === 'uploaded' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {doc.upload_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Action Button */}
      {workflows.length > 0 && workflows.some(w => w.assigned_to_role === 'customer') && (
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={() => onRegister?.()}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajukan Permohonan Baru
          </button>
        </div>
      )}
    </div>
  );
};

export default PortalDashboard;
