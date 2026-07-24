import { Pencil, Trash2, CalendarPlus, ArrowUp } from "lucide-react";

/**
 * Action buttons for contract rows
 * - Edit: Full implementation
 * - Delete, Extend, Upgrade: Button placeholders (disabled)
 */
export function ActionButtons({ row, onEdit, onDelete, onExtend, onUpgrade }) {
  return (
    <div className="flex items-center gap-1">
      {/* Edit Button */}
      <button
        onClick={() => onEdit(row)}
        title="Edit Kontrak"
        className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
      >
        <Pencil size={16} />
      </button>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(row)}
        title="Hapus Kontrak"
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
      >
        <Trash2 size={16} />
      </button>

      {/* Extend Button */}
      <button
        onClick={() => onExtend(row)}
        title="Perpanjang Kontrak"
        className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-400 transition-colors"
      >
        <CalendarPlus size={16} />
      </button>

      {/* Upgrade Button */}
      <button
        onClick={() => onUpgrade(row)}
        title="Upgrade Paket Kontrak"
        className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-colors"
      >
        <ArrowUp size={16} />
      </button>
    </div>
  );
}

export default ActionButtons;
