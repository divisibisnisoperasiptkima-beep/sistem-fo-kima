import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { rowsFrom, totalFrom } from "../lib/rust-api";

/**
 * Reusable DataTable component with glass premium styling
 * Uses forwardRef to expose refresh function to parent
 * @param {string} title - Table title
 * @param {function} load - API function to fetch data
 * @param {Array} columns - Column definitions [{label, render, sticky?}]
 *   sticky: { left: string, width: string, isLast?: boolean }
 * @param {object} session - Auth session
 * @param {boolean} focus - Fullscreen mode
 * @param {function} filterRow - Optional row filter function
 * @param {function} sortRows - Optional row sort function (receives filtered rows, returns sorted array)
 * @param {string} search - Optional search term
 * @param {string} status - Optional status filter for backend filtering
 * @param {boolean} activeOnly - Only return contracts in active date period
 * @param {ref} ref - Forwarded ref for imperative methods (refresh)
 */
const DataTable = forwardRef(function DataTable({ title, load, columns, session, focus, filterRow, sortRows, search = "", status = "", activeOnly = false, onRowClick = null, selectedRowId = null }, ref) {
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const currentPageSize = focus ? 10000 : pageSize;

  const refresh = useCallback(async () => {
    setState((old) => ({ ...old, loading: true, error: "" }));
    try {
      const data = await load(session.token, focus ? 1 : page, currentPageSize, search, status, activeOnly);
      const rows = rowsFrom(data);
      setState({ loading: false, rows, total: totalFrom(data, rows.length), error: "" });
    } catch (err) {
      setState({ loading: false, rows: [], total: 0, error: err.message });
    }
  }, [focus, load, page, currentPageSize, session.token, search, status, activeOnly]);

  // Expose refresh function to parent via ref
  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await refresh();
    },
  }), [refresh]);

  // Reset page when search term or status filter changes
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPage(1);
  }
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    setPage(1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Solid background color for table cells (#0e1626)
  const BG_COLOR = '#0e1626';

  const getStickyStyle = (column, isHeader) => {
    if (!column.sticky) {
      if (isHeader) return { position: 'sticky', top: 0, zIndex: 30, backgroundColor: BG_COLOR };
      return { backgroundColor: BG_COLOR };
    }
    const base = {
      position: 'sticky',
      left: column.sticky.left,
      zIndex: isHeader ? 40 : 20,
      backgroundColor: BG_COLOR,
    };
    if (isHeader) { base.top = 0; }
    if (column.sticky.width) {
      base.width = column.sticky.width;
      base.minWidth = column.sticky.width;
    }
    return base;
  };

  // Extra classNames for frozen columns (border/shadow only — no background)
  const getStickyClassName = (column) => {
    if (!column.sticky) return '';
    let cls = '';
    if (column.sticky.isLast) {
      cls += ' border-r border-white/15 shadow-[4px_0_12px_rgba(0,0,0,0.5)]';
    }
    return cls;
  };

  // Keep locally filtered tables (for example, the negotiation queue) in sync
  // with the visible count and empty state while still using the API total for
  // server-side pagination when no local filter is supplied.
  const visibleRows = state.rows.filter(filterRow ? filterRow : () => true);
  const displayRows = sortRows ? sortRows(visibleRows) : visibleRows;
  const displayTotal = filterRow ? visibleRows.length : state.total;

  return (
    <section className={focus ? "fixed inset-0 z-50 w-full overflow-auto bg-premium-dark/95 p-3 backdrop-blur-2xl sm:p-5" : "w-full"}>
      {/* Header */}
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">{title}</h2>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/50 sm:text-xs">{displayTotal} data</p>
        </div>
        <button
          onClick={refresh}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white/70 backdrop-blur-md hover:border-white/25 hover:bg-white/10 hover:text-white anim-surface sm:w-auto sm:px-4 sm:text-xs"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Muat ulang
        </button>
      </div>

      {/* Error state */}
      {state.error && (
        <div className="mb-4 rounded-xl bg-red-500/15 border border-red-500/30 p-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs font-bold text-red-300">{state.error}</span>
          </div>
        </div>
      )}

      {/* Table container - scrollable both X and Y for freeze pane */}
      <div className="custom-scrollbar max-h-[calc(100dvh-15rem)] overflow-auto rounded-xl border border-white/10 bg-black/20 backdrop-blur-md sm:max-h-[calc(100vh-220px)]">
        <table className="w-full border-separate border-spacing-0 text-left min-w-max">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((column) => (
                <th
                  key={column.label}
                  style={getStickyStyle(column, true)}
                  className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-white/40 whitespace-nowrap ${getStickyClassName(column)}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {state.loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-gold-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Memuat...</span>
                  </div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Tidak ada data</span>
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => {
                const rowId = row.lokasi_id ?? row.id ?? index;
                const isSelected = selectedRowId != null && (row.lokasi_id === selectedRowId || row.id === selectedRowId);
                return (
                  <tr
                    key={rowId}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-all ${onRowClick ? 'cursor-pointer' : ''} ${
                      isSelected
                        ? 'bg-amber-500/25 border-l-4 border-amber-400 font-semibold'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {columns.map((column) => {
                      // Hitung nomor urut keseluruhan (untuk kolom #)
                      const isNumberColumn = column.label === "#";
                      const rowNumber = isNumberColumn ? (page - 1) * currentPageSize + index + 1 : null;

                      const stickyBodyStyle = getStickyStyle(column, false);

                      return (
                        <td
                          key={column.label}
                          style={{ ...stickyBodyStyle, width: column.width || stickyBodyStyle.width || 'auto', minWidth: column.width || stickyBodyStyle.minWidth || 'auto' }}
                          className={`px-3 py-2.5 text-[11px] text-white/80 font-medium whitespace-nowrap ${column.cellClassName || ''}${getStickyClassName(column)}`}
                        >
                          {isNumberColumn ? rowNumber : column.render(row, index, page, currentPageSize)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!focus && displayTotal > 0 && (
        <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:gap-4">
          {/* Data Summary */}
          <div className="w-full text-center text-[10px] font-black uppercase tracking-wider text-white/40 sm:w-auto sm:text-left">
            Menampilkan{" "}
            <span className="text-gold-accent font-black">
              {visibleRows.length === 0 ? 0 : (page - 1) * currentPageSize + 1}
            </span>{" "}
            -{" "}
            <span className="text-gold-accent font-black">
              {Math.min(page * currentPageSize, displayTotal)}
            </span>{" "}
            dari{" "}
              <span className="text-white font-black">{displayTotal}</span> data
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
            {/* Page Size Select */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
                Tampilkan:
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  setPageSize(size);
                  setPage(1);
                }}
                className="bg-white/5 border border-white/15 text-white/80 rounded-lg px-2.5 py-1.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all cursor-pointer backdrop-blur-md"
              >
                <option value={10} className="bg-[#0e1626] text-white">10</option>
                <option value={20} className="bg-[#0e1626] text-white">20</option>
                <option value={50} className="bg-[#0e1626] text-white">50</option>
                <option value={100} className="bg-[#0e1626] text-white">100</option>
              </select>
            </div>

            {/* Navigation buttons */}
            {displayTotal > currentPageSize && (
              <div className="flex items-center gap-1.5">
                {/* First Page */}
                <button
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  title="Halaman Pertama"
                  className="flex items-center justify-center rounded-lg border border-white/15 bg-white/5 w-8 h-8 text-white/70 backdrop-blur-md hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="11 17 6 12 11 7" />
                    <polyline points="18 17 13 12 18 7" />
                  </svg>
                </button>

                {/* Previous Page */}
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  title="Halaman Sebelumnya"
                  className="flex items-center justify-center rounded-lg border border-white/15 bg-white/5 w-8 h-8 text-white/70 backdrop-blur-md hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {/* Page Numbers */}
                {(() => {
                  const totalPages = Math.ceil(displayTotal / currentPageSize) || 1;
                  const pages = [];
                  if (totalPages <= 5) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (page > 3) {
                      pages.push("...");
                    }
                    const start = Math.max(2, page - 1);
                    const end = Math.min(totalPages - 1, page + 1);
                    for (let i = start; i <= end; i++) {
                      pages.push(i);
                    }
                    if (page < totalPages - 2) {
                      pages.push("...");
                    }
                    pages.push(totalPages);
                  }

                  return pages.map((item, idx) => {
                    if (item === "...") {
                      return (
                        <span key={`dots-${idx}`} className="px-1 text-white/40 text-[10px] font-black">
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={item}
                        onClick={() => setPage(item)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border text-[10px] font-black transition-all ${
                          page === item
                            ? "border-gold-accent bg-gold-accent/20 text-gold-accent"
                            : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  });
                })()}

                {/* Next Page */}
                <button
                  disabled={page === Math.ceil(displayTotal / currentPageSize)}
                  onClick={() => setPage(page + 1)}
                  title="Halaman Berikutnya"
                  className="flex items-center justify-center rounded-lg border border-white/15 bg-white/5 w-8 h-8 text-white/70 backdrop-blur-md hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Last Page */}
                <button
                  disabled={page === Math.ceil(displayTotal / currentPageSize)}
                  onClick={() => setPage(Math.ceil(displayTotal / currentPageSize))}
                  title="Halaman Terakhir"
                  className="flex items-center justify-center rounded-lg border border-white/15 bg-white/5 w-8 h-8 text-white/70 backdrop-blur-md hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 17 18 12 13 7" />
                    <polyline points="6 17 11 12 6 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
});

export default DataTable;
