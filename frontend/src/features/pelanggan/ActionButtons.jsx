import { Pencil, Trash2 } from "lucide-react";

/**
 * Action buttons for pelanggan rows
 */
export function ActionButtons({ row, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      {/* Edit Button */}
      <button
        onClick={() => onEdit(row)}
        title="Edit Pelanggan"
        className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
      >
        <Pencil size={16} />
      </button>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(row)}
        title="Hapus Pelanggan"
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export default ActionButtons;
