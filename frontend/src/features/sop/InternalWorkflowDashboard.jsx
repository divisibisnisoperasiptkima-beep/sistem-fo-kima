import { useState, useEffect } from 'react';
import { getSession, listWorkflows } from '../../lib/rust-api';

const InternalWorkflowDashboard = ({ onNavigateStep }) => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', assigned: 'all' });
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

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

      const data = await listWorkflows(session.token);

      // Transform API response to match our UI format
      const transformed = data.map(wf => ({
        id: wf.id,
        kode_lokasi: wf.kode_lokasi || wf.lokasi_code || '',
        nama_lokasi: wf.nama_lokasi_diajukan || wf.nama_lokasi || '',
        pelanggan_nama: wf.nama_pelanggan || '',
        current_step: wf.current_step || 1,
        total_steps: 18,
        status: wf.status || 'in_progress',
        assigned_to_role: wf.assigned_to_role || '',
        created_at: wf.started_at,
        updated_at: wf.updated_at,
        back_to_step: wf.back_to_step || null,
        rejection_reason: wf.rejection_reason || null,
      }));

      setWorkflows(transformed);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      alert('Gagal memuat daftar workflow. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch(status.toLowerCase()) {
      case 'completed':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">✅ Completed</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">❌ Rejected</span>;
      case 'cancelled':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">⚠️ Cancelled</span>;
      case 'draft':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">📝 Draft</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">🟢 In Progress</span>;
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
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-xs font-bold ${color}`} title={`Active for ${diffDays} days`}>
        {label}
      </div>
    );
  };

  const handleNavigateToStep = (workflowId, stepNumber) => {
    setSelectedWorkflow(workflowId);
    if (onNavigateStep) {
      onNavigateStep(workflowId, stepNumber);
    } else {
      // Fallback: update state and route in parent
      window.dispatchEvent(new CustomEvent('navigate-to-sop-step', {
        detail: { workflowId, step: stepNumber }
      }));
    }
  };

  const handleWorkflowClick = (workflow) => {
    setSelectedWorkflow(workflow);
  };

  const filteredWorkflows = workflows.filter(wf => {
    if (filters.status !== 'all' && wf.status !== filters.status) return false;
    if (filters.assigned !== 'all' && wf.assigned_to_role !== filters.assigned) return false;
    return true;
  });

  const stats = {
    total: workflows.length,
    inProgress: workflows.filter(w => w.status === 'in_progress').length,
    completed: workflows.filter(w => w.status === 'completed').length,
    rejected: workflows.filter(w => w.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-600">Memuat workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">SOP Workflow Management</h1>
        <p className="text-sm text-gray-600 mt-1">Kelola dan pantau proses SOP 18 langkah</p>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <select
              value={filters.assigned}
              onChange={(e) => setFilters({...filters, assigned: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua</option>
              <option value="customer">Customer/Pelanggan</option>
              <option value="dbo">DBO</option>
              <option value="teknisi">Teknisi</option>
              <option value="legal">Legal</option>
              <option value="direksi">Direksi</option>
              <option value="keuangan">Keuangan</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex-1 min-w-[300px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Cari kode lokasi atau nama pelanggan..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Active</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">In Progress</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Completed</h3>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500">Rejected</h3>
          <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
        </div>
      </div>

      {/* Workflow List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Active Workflows ({filteredWorkflows.length})</h2>
        </div>

        {filteredWorkflows.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">Tidak ada workflow ditemukan.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredWorkflows.map((workflow) => (
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
                    <p className="text-sm text-gray-500">{workflow.pelanggan_nama}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <span className="font-medium">Step:</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-bold">
                        {workflow.current_step}/18
                      </span>
                      <span>•</span>
                      <span className={`${workflow.assigned_to_role === 'customer' ? 'text-green-600' : workflow.assigned_to_role === 'dbo' ? 'text-blue-600' : ''}`}>
                        {workflow.assigned_to_role?.toUpperCase()}
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

                    {/* Quick Actions */}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToStep(workflow.id, workflow.current_step + 1);
                        }}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Lanjut ke Step →
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement view details modal/page
                          alert(`View Details untuk workflow ID: ${workflow.id}\nCurrent Step: ${workflow.current_step}`);
                        }}
                        className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Assign workflow to user\nCurrently assigned to: ${workflow.assigned_to_role || 'Unassigned'}`);
                        }}
                        className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Assign
                      </button>
                    </div>
                  </div>

                  {/* Status Column */}
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">
                      Created: {new Date(workflow.created_at).toLocaleDateString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500">
                      Updated: {new Date(workflow.updated_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refresh Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={fetchWorkflows}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh List
        </button>
      </div>
    </div>
  );
};

export default InternalWorkflowDashboard;
