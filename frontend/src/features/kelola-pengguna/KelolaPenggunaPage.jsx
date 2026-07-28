import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import DataTable from "../../components/DataTable";
import { listUsers } from "../../lib/rust-api";
import { userColumns } from "./columns.jsx";
import ActionButtons from "./ActionButtons.jsx";
import AddUserModal from "./AddUserModal.jsx";
import EditUserModal from "./EditUserModal.jsx";
import DeleteUserModal from "./DeleteUserModal.jsx";
import ResetPasswordModal from "./ResetPasswordModal.jsx";

export default function KelolaPenggunaPage({ session }) {
  const tableRef = useRef(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userStatus, setUserStatus] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSuccess = useCallback(() => {
    if (tableRef.current?.refresh) {
      tableRef.current.refresh();
    }
  }, []);

  const handleEdit = useCallback((row) => {
    setEditingUser(row);
    setIsEditModalOpen(true);
  }, []);

  const handleDelete = useCallback((row) => {
    setDeletingUser(row);
    setIsDeleteModalOpen(true);
  }, []);

  const handleResetPassword = useCallback((row) => {
    setResettingUser(row);
    setIsResetModalOpen(true);
  }, []);

  const columns = userColumns.map((col) => {
    if (col.label === "Aksi") {
      return {
        ...col,
        render: (row) => (
          <ActionButtons
            row={row}
            onEdit={handleEdit}
            onResetPassword={handleResetPassword}
            onDelete={handleDelete}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">
              Manajemen Sistem
            </p>
          </div>
          <h1 className="text-3xl font-black text-white">
            Kelola Pengguna <span className="text-gold-accent italic">FO KIMA</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Cari pengguna..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all w-64"
            />
          </div>
          <div className="flex items-center rounded-xl border border-white/15 bg-white/5 p-1" role="group" aria-label="Filter status akun">
            {[
              { value: "", label: "Semua" },
              { value: "active", label: "Aktif saja" },
              { value: "inactive", label: "Nonaktif saja" },
            ].map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                onClick={() => setUserStatus(option.value)}
                aria-pressed={userStatus === option.value}
                className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${userStatus === option.value ? "bg-gold-accent text-slate-950 shadow-lg" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/60 transition-all backdrop-blur-md shadow-lg shrink-0"
          >
            <Plus size={16} />
            <span>Tambah Pengguna</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <DataTable
          ref={tableRef}
          load={listUsers}
          columns={columns}
          session={session}
          focus={false}
          search={debouncedSearch}
          status={userStatus}
        />
      </div>

      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleSuccess}
        session={session}
      />

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
        }}
        onSuccess={handleSuccess}
        user={editingUser}
        session={session}
      />

      <DeleteUserModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingUser(null);
        }}
        onSuccess={handleSuccess}
        user={deletingUser}
        session={session}
      />

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => {
          setIsResetModalOpen(false);
          setResettingUser(null);
        }}
        onSuccess={handleSuccess}
        user={resettingUser}
        session={session}
      />
    </div>
  );
}
