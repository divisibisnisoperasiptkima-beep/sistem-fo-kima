import { useState, useRef, useEffect } from "react";
import { Filter, ChevronDown, Check, X, RotateCcw } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "Beroperasi",       color: "emerald", label: "Beroperasi" },
  { value: "Belum Beroperasi", color: "amber",   label: "Belum Beroperasi" },
  { value: "Proses Perpanjangan",         color: "rose",     label: "Proses Perpanjangan" },
  { value: "Diperpanjang",     color: "sky",      label: "Diperpanjang" },
  { value: "Di-upgrade",       color: "violet",   label: "Di-upgrade" },
  { value: "Berhenti",         color: "slate",    label: "Berhenti" },
];

const BADGE_COLOR_MAP = {
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  amber:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  rose:    "bg-rose-500/15 text-rose-400 border-rose-500/30",
  sky:     "bg-sky-500/15 text-sky-400 border-sky-500/30",
  violet:  "bg-violet-500/15 text-violet-400 border-violet-500/30",
  slate:   "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export default function StatusFilterBar({ selected = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on Escape key press
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleStatus = (value) => {
    const next = selected.includes(value)
      ? selected.filter((s) => s !== value)
      : [...selected, value];
    onChange(next);
  };

  const isAllSelected = selected.length === STATUS_OPTIONS.length;

  const selectAll = () => {
    onChange(STATUS_OPTIONS.map((opt) => opt.value));
  };

  const clearAll = () => {
    onChange([]);
  };

  const activeCount = selected.length;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold backdrop-blur-md transition-all cursor-pointer border ${
          activeCount > 0
            ? "bg-gold-accent/15 border-gold-accent/50 text-gold-accent shadow-md shadow-gold-accent/5"
            : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10 hover:border-white/25 hover:text-white"
        }`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Filter className={`w-3.5 h-3.5 ${activeCount > 0 ? "text-gold-accent" : "text-white/60"}`} />
        <span>Filter Status</span>
        {activeCount > 0 ? (
          <span className="flex items-center justify-center h-5 px-1.5 min-w-[20px] text-[10px] font-black rounded-full bg-gold-accent text-black">
            {activeCount}
          </span>
        ) : (
          <span className="text-[10px] text-white/40 font-medium">(Semua)</span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-gold-accent" : "text-white/40"
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/15 bg-[#0e1626]/95 backdrop-blur-xl shadow-2xl p-3 text-xs z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
              Filter Status Kontrak
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Action: Select All / Reset */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={isAllSelected}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" />
              <span>Pilih Semua</span>
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={activeCount === 0}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/5 border border-white/10 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="my-1.5 h-[1px] bg-white/10" />

          {/* Status Options */}
          <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = selected.includes(opt.value);
              const badgeStyle = BADGE_COLOR_MAP[opt.color];

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all cursor-pointer text-left ${
                    isSelected ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                        isSelected
                          ? "bg-gold-accent border-gold-accent text-black"
                          : "border-white/30 bg-white/5"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${badgeStyle}`}
                    >
                      {opt.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer summary */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-white/40">
            <span>
              {activeCount === 0
                ? "Menampilkan semua data"
                : `${activeCount} dari ${STATUS_OPTIONS.length} dipilih`}
            </span>
            {activeCount > 0 && (
              <span className="text-gold-accent font-bold">Filter aktif</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

