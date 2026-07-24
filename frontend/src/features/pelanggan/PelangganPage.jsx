import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import DataTable from "../../components/DataTable";
import { listCustomers } from "../../lib/rust-api";
import { pelangganColumns, setActionButtonsComponent } from "./columns.jsx";
import ActionButtons from "./ActionButtons.jsx";
import AddPelangganModal from "./AddPelangganModal.jsx";
import EditPelangganModal from "./EditPelangganModal.jsx";
import DeletePelangganModal from "./DeletePelangganModal.jsx";

/**
 * Pelanggan page component
 */
function PelangganPage({ session }) {
  const tableRef = useRef(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Set ActionButtons component for columns
  useEffect(() => {
    setActionButtonsComponent(ActionButtons);
  }, []);

  // Handler to refresh table after successful operations
  const handleSuccess = useCallback(() => {
    if (tableRef.current?.refresh) {
      tableRef.current.refresh();
    }
  }, []);

  // Edit handler
  const handleEdit = useCallback((row) => {
    setEditingCustomer(row);
    setIsEditModalOpen(true);
  }, []);

  // Delete handler
  const handleDelete = useCallback((row) => {
    setDeletingCustomer(row);
    setIsDeleteModalOpen(true);
  }, []);

  // Create columns with handlers
  const columns = pelangganColumns.map((col) => {
    if (col.label === "Aksi") {
      return {
        ...col,
        render: (row) => (
          <ActionButtons row={row} onEdit={handleEdit} onDelete={handleDelete} />
        ),
      };
    }
    return col;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Eyebrow, Title, Search & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">
              Manajemen Data
            </p>
          </div>
          <h1 className="text-3xl font-black text-white">
            Daftar Pelanggan <span className="text-gold-accent italic">FO KIMA</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Cari pelanggan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all w-64"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/60 transition-all backdrop-blur-md shadow-lg shrink-0"
          >
            <Plus size={16} />
            <span>Tambah Pelanggan</span>
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden">
        <DataTable
          ref={tableRef}
          load={listCustomers}
          columns={columns}
          session={session}
          focus={false}
          search={debouncedSearch}
        />
      </div>

      {/* Add Modal */}
      <AddPelangganModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleSuccess}
        session={session}
      />

      {/* Edit Modal */}
      <EditPelangganModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCustomer(null);
        }}
        onSuccess={handleSuccess}
        customer={editingCustomer}
        session={session}
      />

      {/* Delete Modal */}
      <DeletePelangganModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingCustomer(null);
        }}
        onSuccess={handleSuccess}
        customer={deletingCustomer}
        session={session}
      />
    </div>
  );
}

export default PelangganPage;
