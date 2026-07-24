import { useRef, forwardRef, useImperativeHandle, useState, useCallback, useEffect } from "react";
import { Search } from "lucide-react";
import DataTable from "../../components/DataTable";
import { listContracts } from "../../lib/rust-api";
import { monitoringColumns, setActionButtonsComponent } from "./columns.jsx";
import ActionButtons from "../kontrak/ActionButtons";
import EditKontrakModal from "../kontrak/EditKontrakModal";
import DeleteKontrakModal from "../kontrak/DeleteKontrakModal";
import ExtendKontrakModal from "../kontrak/ExtendKontrakModal";
import UpgradeKontrakModal from "../kontrak/UpgradeKontrakModal";

/**
 * Monitoring Kontrak Aktif page component
 */
const MonitoringKontrakPage = forwardRef(function MonitoringKontrakPage({ session }, ref) {
  const tableRef = useRef(null);
  const [search, setSearch] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingContract, setDeletingContract] = useState(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendingContract, setExtendingContract] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradingContract, setUpgradingContract] = useState(null);

  // Set ActionButtons component for columns
  useEffect(() => {
    setActionButtonsComponent(ActionButtons);
  }, []);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (tableRef.current?.refresh) {
        tableRef.current.refresh();
      }
    },
  }));

  const handleSuccess = useCallback(() => {
    if (tableRef.current?.refresh) {
      tableRef.current.refresh();
    }
  }, []);

  const handleEdit = useCallback((row) => {
    setEditingContract(row);
    setIsEditModalOpen(true);
  }, []);

  const handleDelete = useCallback((row) => {
    setDeletingContract(row);
    setIsDeleteModalOpen(true);
  }, []);

  const handleExtend = useCallback((row) => {
    setExtendingContract(row);
    setIsExtendModalOpen(true);
  }, []);

  const handleUpgrade = useCallback((row) => {
    setUpgradingContract(row);
    setIsUpgradeModalOpen(true);
  }, []);

  const columns = monitoringColumns.map((col) => {
    if (col.label === "Aksi") {
      return {
        ...col,
        render: (row) => (
          <ActionButtons
            row={row}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onExtend={handleExtend}
            onUpgrade={handleUpgrade}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">
              Monitoring
            </p>
          </div>
          <h1 className="text-3xl font-black text-white">
            Monitoring Kontrak <span className="text-gold-accent italic">Aktif</span>
          </h1>
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kontrak..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all backdrop-blur-md"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden">
        <DataTable
          ref={tableRef}
          load={listContracts}
          columns={columns}
          session={session}
          focus={false}
          search={search}
          activeOnly={true}
        />
      </div>

      {/* Edit Modal */}
      <EditKontrakModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={editingContract}
        session={session}
      />

      {/* Delete Modal */}
      <DeleteKontrakModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={deletingContract}
        session={session}
      />

      {/* Extend Modal */}
      <ExtendKontrakModal
        isOpen={isExtendModalOpen}
        onClose={() => {
          setIsExtendModalOpen(false);
          setExtendingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={extendingContract}
        session={session}
      />

      {/* Upgrade Modal */}
      <UpgradeKontrakModal
        isOpen={isUpgradeModalOpen}
        onClose={() => {
          setIsUpgradeModalOpen(false);
          setUpgradingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={upgradingContract}
        session={session}
      />
    </div>
  );
});

export default MonitoringKontrakPage;
