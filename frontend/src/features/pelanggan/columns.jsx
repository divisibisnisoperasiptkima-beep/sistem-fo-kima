/**
 * Column definitions for Pelanggan page
 */
import { FolderOpen } from "lucide-react";

const value = (item) => item == null || item === "" ? "—" : String(item);

// Dynamic ActionButtons import
let ActionButtons = null;
export const setActionButtonsComponent = (component) => {
  ActionButtons = component;
};

export const pelangganColumns = [
  { label: "No", render: (_row, idx) => (idx ?? 0) + 1 },
  { label: "Kode", render: (row) => value(row.kode_pelanggan) },
  { label: "Nama Pelanggan (ISP)", render: (row) => value(row.nama_pelanggan) },
  { label: "PIC", render: (row) => value(row.pic) },
  { label: "Telepon", render: (row) => value(row.telepon) },
  { label: "Email", render: (row) => value(row.email) },
  { label: "Beroperasi", cellClassName: "text-center text-sm", render: (row) => value(row.lokasi_beroperasi ?? 0) },
  { label: "Belum Beroperasi", cellClassName: "text-center text-sm", render: (row) => value(row.lokasi_belum_beroperasi ?? 0) },
  { label: "Proses Perpanjangan", cellClassName: "text-center text-sm", render: (row) => value(row.lokasi_proses_perpanjangan ?? 0) },
  { label: "Folder", render: (row) => (
    row.link_folder_berkas ? (
      <a
        href={row.link_folder_berkas}
        target="_blank"
        rel="noopener noreferrer"
        title="Buka folder Google Drive"
        className="inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-400 transition-colors"
      >
        <FolderOpen size={16} />
      </a>
    ) : (
      <span className="text-slate-600">—</span>
    )
  ) },
  { label: "Aksi", render: (row, _idx, { onEdit, onDelete }) => (
    ActionButtons ? (
      <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} />
    ) : null
  ) },
];

export default pelangganColumns;
