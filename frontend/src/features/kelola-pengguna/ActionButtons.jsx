import { Pencil, Trash2, Key } from "lucide-react";

export default function ActionButtons({ row, onEdit, onResetPassword, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onEdit(row)}
        title="Edit Pengguna"
        className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
      >
        <Pencil size={16} />
      </button>

      <button
        onClick={() => onResetPassword(row)}
        title="Reset Password"
        className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors"
      >
        <Key size={16} />
      </button>

      <button
        onClick={() => onDelete(row)}
        title="Nonaktifkan Pengguna"
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
