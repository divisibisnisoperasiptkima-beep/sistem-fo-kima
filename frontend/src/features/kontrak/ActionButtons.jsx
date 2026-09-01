import { CalendarPlus, Download, Eye, FileCheck2, Loader2, MapPin, Pencil, Trash2, ArrowUp } from "lucide-react";

/**
 * Action buttons for contract rows
 * - Edit: Full implementation
 * - Delete, Extend, Upgrade: Button placeholders (disabled)
 */
export function ActionButtons({
  row,
  onEdit,
  onDelete,
  onExtend,
  onUpgrade,
  onMap,
  showBaaActions = false,
  onBaaEdit,
  onBaaPreview,
  onBaaDownload,
  baaAction = null,
}) {
  const hasBaa = Boolean(row?.baa_document_id);
  const baaBusy = baaAction === row?.baa_document_id;

  return (
    <div className="flex max-w-[620px] min-w-[220px] flex-wrap items-center gap-1">
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

      {/* Map point button (available on the full contract table) */}
      {onMap && (
        <button
          onClick={() => onMap(row)}
          title="Atur titik peta kontrak"
          aria-label="Atur titik peta kontrak"
          className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-300 transition-colors"
        >
          <MapPin size={16} />
        </button>
      )}

      {showBaaActions && (
        <>
          {hasBaa ? (
            <>
              <button
                type="button"
                onClick={() => onBaaEdit?.(row)}
                title="Edit data BAA"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20"
              >
                <Pencil size={14} />
                <span>BAA</span>
              </button>
              {row.baa_document_mime_type === "application/pdf" && (
                <>
                  <button
                    type="button"
                    onClick={() => onBaaPreview?.(row)}
                    disabled={baaBusy}
                    title="Buka PDF BAA"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-sky-200 transition-colors hover:bg-sky-500/20 disabled:cursor-wait disabled:opacity-50"
                  >
                    {baaBusy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    <span>Buka BAA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onBaaDownload?.(row)}
                    disabled={baaBusy}
                    title="Unduh PDF BAA"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50"
                  >
                    <Download size={14} />
                    <span>Unduh BAA</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onBaaEdit?.(row)}
              title="Isi form BAA"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              <FileCheck2 size={14} />
              <span>Isi BAA</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default ActionButtons;
