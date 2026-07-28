import { memo, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getDashboardMetrics } from "../../lib/rust-api";

function StatCard({ label, value, sub, onDetail }) {
  return <div className="rounded-2xl p-4 bg-slate-900/40 border border-white/10"><div className="flex justify-between items-start mb-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>{onDetail && <button type="button" onClick={onDetail} className="rounded-md border border-gold-accent/40 bg-gold-accent/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-gold-accent hover:bg-gold-accent/20">Rincian</button>}</div><h3 className="text-xl font-black text-white mb-1">{value}</h3><p className="text-[10px] font-bold text-slate-400 uppercase">{sub}</p></div>;
}

function CoreRincianModal({ rows, onClose }) {
  const totals = rows.reduce((sum, row) => ({ sharing_32: sum.sharing_32 + row.sharing_32, sharing_16: sum.sharing_16 + row.sharing_16, sharing_8: sum.sharing_8 + row.sharing_8, sharing_4: sum.sharing_4 + row.sharing_4, core: sum.core + row.core }), { sharing_32: 0, sharing_16: 0, sharing_8: 0, sharing_4: 0, core: 0 });
  const cells = (row, cls = "") => <><td className={cls}>{row.sharing_32}</td><td className={cls}>{row.sharing_16}</td><td className={cls}>{row.sharing_8}</td><td className={cls}>{row.sharing_4}</td><td className={cls}>{row.core}</td></>;
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4"><button type="button" aria-label="Tutup rincian" onClick={onClose} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" /><div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-accent">Dashboard</p><h2 className="text-lg font-black text-white">Rincian Core Tersewa</h2></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white">Tutup</button></div><div className="max-h-[70vh] overflow-auto p-5"><table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Nama Pelanggan</th><th className="px-3 py-3 text-right">1/32</th><th className="px-3 py-3 text-right">1/16</th><th className="px-3 py-3 text-right">1/8</th><th className="px-3 py-3 text-right">1/4</th><th className="px-3 py-3 text-right">Core</th></tr></thead><tbody>{rows.map((row) => <tr key={row.nama_pelanggan} className="border-t border-white/10 text-white"><td className="px-3 py-3 font-bold">{row.nama_pelanggan}</td>{cells(row, "px-3 py-3 text-right font-mono")}</tr>)}{!rows.length && <tr><td colSpan="6" className="px-3 py-8 text-center text-white/45">Belum ada kontrak aktif.</td></tr>}</tbody><tfoot><tr className="border-t-2 border-gold-accent/40 bg-gold-accent/10 text-gold-accent"><td className="px-3 py-3 font-black uppercase">Total</td>{cells(totals, "px-3 py-3 text-right font-black font-mono")}</tr></tfoot></table></div></div></div>;
}

// Dropdown component using native select for better reliability
function NativeDropdown({ value, options, onChange, triggerClass = "text-[8px] font-black uppercase tracking-widest" }) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={`appearance-none bg-transparent cursor-pointer focus:outline-none ${triggerClass}`}
      style={{
        color: 'rgba(255,255,255,0.85)',
        paddingRight: '16px',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right center',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} style={{ background: '#1e293b', color: '#fff' }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ChartFilterSelector({ filter, setFilter, availableYears }) {
  const handleChange = (key, value) => setFilter(prev => ({ ...prev, [key]: value }));
  const yearOptions = availableYears.map(y => ({ value: y, label: String(y) }));

  const modeLabels = {
    "range_years": "Rentang",
    "specific_year": "Spesifik",
    "custom": "Kustom"
  };

  return (
    <div className="flex h-[24px] items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2 backdrop-blur-md">
      {filter.mode === "range_years" && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="1"
            max="20"
            value={filter.range}
            onChange={(e) => handleChange("range", e.target.value)}
            className="w-8 bg-transparent text-[10px] font-black text-gold-accent text-center focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]"
          />
          <span className="text-[8px] font-black text-white/50 uppercase">Thn</span>
        </div>
      )}
      {filter.mode === "specific_year" && (
        <NativeDropdown
          value={filter.year}
          options={yearOptions}
          onChange={(v) => handleChange("year", v)}
        />
      )}
      {filter.mode === "custom" && (
        <>
          <NativeDropdown value={filter.start} options={yearOptions} onChange={(v) => handleChange("start", v)} />
          <span className="text-[8px] text-white/40 font-black">-</span>
          <NativeDropdown value={filter.end} options={yearOptions} onChange={(v) => handleChange("end", v)} />
        </>
      )}
      <div className="h-4 w-px bg-white/20 mx-1" />
      <div className="flex items-center gap-0.5">
        {Object.entries(modeLabels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleChange("mode", key)}
            className={`px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider rounded transition-all ${
              filter.mode === key
                ? "bg-white/20 text-white"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const CHART_TOOLTIP = { contentStyle: { background: "rgba(15,20,30,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", padding: "10px", fontSize: "10px", fontWeight: 700, color: "#fff" }, itemStyle: { fontSize: "10px", fontWeight: 700 }, labelStyle: { fontSize: "10px", fontWeight: 800, marginBottom: "6px" } };

const SHARING_COLORS = { "1/2": "#d4a937", "1/4": "#00687b", "1/8": "#10b981", "1/16": "#8b5cf6", "1/32": "#f43f5e" };

/**
 * Dashboard page component
 */
const DashboardPage = memo(function DashboardPage({ session }) {
  const currentYear = String(new Date().getFullYear());
  const [availableYears] = useState([String(new Date().getFullYear() - 3), String(new Date().getFullYear() - 2), String(new Date().getFullYear() - 1), currentYear, String(new Date().getFullYear() + 1)]);
  const [stats, setStats] = useState({ pelanggan: 0, kontrakAktif: 0, kapasitasCore: "—", coreTersewa: "—", coreTersedia: "—", kontrakByStatus: {}, coreDedicatedCount: 0 });
  const [dashboardData, setDashboardData] = useState({ core_rincian: [], core_trend: [], core_trend_yearly: [], sharing_trend: [], sharing_trend_yearly: [], sharing_counts: {}, growth: { pelanggan: [], kontrak: [] } });
  const [coreRincianOpen, setCoreRincianOpen] = useState(false);
  const [timeMode, setTimeMode] = useState("yearly");
  const [chartType, setChartType] = useState("sharing");
  const [growthType, setGrowthType] = useState("kontrak");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const coreTrendModeOptions = useMemo(() => [
    { value: "range_years", label: "Rentang" },
    { value: "specific_year", label: "Tahun Spesifik" },
    { value: "custom", label: "Kustom Range" }
  ], []);
  const growthModeOptions = useMemo(() => [
    { value: "range_years", label: "Rentang" },
    { value: "specific_year", label: "Tahun Spesifik" },
    { value: "custom", label: "Kustom Range" }
  ], []);
  const [coreFilter, setCoreFilter] = useState({ mode: "range_years", year: currentYear, range: "5", start: String(new Date().getFullYear() - 2), end: currentYear });
  const [growthFilter, setGrowthFilter] = useState({ mode: "range_years", year: currentYear, range: "5", start: String(new Date().getFullYear() - 2), end: currentYear });
  const switchCoreTrendTimeMode = (mode) => {
    setTimeMode(mode);
    if (mode === "monthly") {
      setCoreFilter(prev => ({ ...prev, mode: "specific_year", year: prev.year || currentYear }));
      return;
    }
    setCoreFilter(prev => ({ ...prev, mode: "range_years", range: prev.range || "5" }));
  };
  const coreTrendDisplayYear = coreFilter.mode === "specific_year" ? coreFilter.year : coreFilter.mode === "custom" ? coreFilter.end : currentYear;
  const coreTrendYearOptions = availableYears.map(y => ({ value: y, label: String(y) }));
  const updateCoreTrendMonthlyYear = (yearValue) => {
    setCoreFilter(prev => ({ ...prev, mode: "specific_year", year: yearValue, start: yearValue, end: yearValue }));
  };
  useEffect(() => {
    const numYear = Number(currentYear);
    const params = {};
    if (timeMode === "monthly") {
      params.year = coreFilter.mode === "specific_year" ? coreFilter.year : currentYear;
    } else {
      let s, e;
      if (coreFilter.mode === "specific_year") { s = e = Number(coreFilter.year); }
      else if (coreFilter.mode === "custom") { s = Number(coreFilter.start); e = Number(coreFilter.end); }
      else { s = numYear - (Number(coreFilter.range) || 5) + 1; e = numYear; }
      params.core_trend_start_year = s; params.core_trend_end_year = e;
    }
    let gs, ge;
    if (growthFilter.mode === "specific_year") { gs = ge = Number(growthFilter.year); }
    else if (growthFilter.mode === "custom") { gs = Number(growthFilter.start); ge = Number(growthFilter.end); }
    else { gs = numYear - (Number(growthFilter.range) || 5) + 1; ge = numYear; }
    params.growth_start_year = gs; params.growth_end_year = ge;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getDashboardMetrics(session.token, params, { signal: controller.signal });
        if (!active) return;
        if (!data) return;
        setStats({
          pelanggan: data.stats?.total_pelanggan || 0,
          kontrakAktif: data.stats?.kontrak_aktif || 0,
          kapasitasCore: data.stats?.kapasitas_core || "—",
          coreTersewa: data.stats?.core_tersewa || "—",
          coreTersedia: data.stats?.core_tersedia || "—",
          kontrakByStatus: data.stats?.kontrak_by_status || {},
          coreDedicatedCount: data.stats?.core_dedicated_count || 0
        });
        setDashboardData({
          core_rincian: data.core_rincian || [],
          core_trend: data.core_trend || [],
          core_trend_yearly: data.core_trend_yearly || [],
          sharing_trend: data.sharing_trend || [],
          sharing_trend_yearly: data.sharing_trend_yearly || [],
          sharing_counts: data.sharing_counts || {},
          growth: data.growth || { pelanggan: [], kontrak: [] }
        });
        setLoading(false);
      } catch (err) {
        if (!active || err?.name === "AbortError") return;
        setError(err.message || "Gagal memuat data dashboard");
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    session.token,
    timeMode,
    coreFilter.mode,
    coreFilter.year,
    coreFilter.range,
    coreFilter.start,
    coreFilter.end,
    growthFilter.mode,
    growthFilter.year,
    growthFilter.range,
    growthFilter.start,
    growthFilter.end,
    currentYear,
  ]);

  const toggleBtn = "inline-flex h-[24px] items-center rounded-lg bg-white/10 p-0.5 border border-white/15 backdrop-blur-md";

  const sharingRowsData = useMemo(() => {
    return Object.entries(dashboardData.sharing_counts).map(([k, v]) => ({
      ratio: k,
      ratioDisplay: k.replace("/", ":"),
      count: v,
      color: SHARING_COLORS[k] || "#888"
    }));
  }, [dashboardData.sharing_counts]);

  const coreTrendChartData = useMemo(() => {
    if (timeMode === "monthly") {
      return chartType === "sharing" ? (dashboardData.sharing_trend || []) : dashboardData.core_trend;
    }
    return chartType === "sharing" ? (dashboardData.sharing_trend_yearly || []) : dashboardData.core_trend_yearly.map(d => ({ name: d.name, count: d.count }));
  }, [timeMode, chartType, dashboardData.core_trend, dashboardData.core_trend_yearly, dashboardData.sharing_trend, dashboardData.sharing_trend_yearly]);

  // Transform sharing data for chart (pivot to have name as key)
  const sharingChartData = useMemo(() => {
    const series = chartType === "sharing" ? (timeMode === "monthly" ? (dashboardData.sharing_trend || []) : (dashboardData.sharing_trend_yearly || [])) : [];
    if (!series || series.length === 0) return [];

    // Create a map of name -> { name, "1:32": count, "1:16": count, ... }
    const dataMap = {};
    for (const s of series) {
      const ratioKey = s.ratio.replace("/", ":"); // Convert 1/32 -> 1:32 for chart dataKey
      for (const point of s.data) {
        if (!dataMap[point.name]) {
          dataMap[point.name] = { name: point.name };
        }
        dataMap[point.name][ratioKey] = point.count;
      }
    }

    return Object.values(dataMap).sort((a, b) => {
      // Sort by name (for monthly: alphabetical, for yearly: numeric)
      if (timeMode === "monthly") {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months.indexOf(a.name) - months.indexOf(b.name);
      }
      return parseInt(a.name) - parseInt(b.name);
    });
  }, [chartType, timeMode, dashboardData.sharing_trend, dashboardData.sharing_trend_yearly]);

  // Get list of ratios for legend
  const sharingRatios = useMemo(() => {
    const series = chartType === "sharing" ? (timeMode === "monthly" ? (dashboardData.sharing_trend || []) : (dashboardData.sharing_trend_yearly || [])) : [];
    return series.map(s => ({
      ratio: s.ratio,
      ratioDisplay: s.ratio.replace("/", ":"),
      color: SHARING_COLORS[s.ratio] || "#888"
    }));
  }, [chartType, timeMode, dashboardData.sharing_trend, dashboardData.sharing_trend_yearly]);

  const growthChartData = useMemo(() => {
    const source = growthType === "kontrak" ? dashboardData.growth.kontrak : dashboardData.growth.pelanggan;
    return (source || []).map(d => ({ year: String(d.year), [growthType]: d.count }));
  }, [growthType, dashboardData.growth]);

  const sharingTotal = useMemo(() => sharingRowsData.reduce((a, b) => a + b.count, 0), [sharingRowsData]);

  return <>
    <div className="mb-4"><div className="flex items-center gap-3 mb-4"><span className="h-[2px] w-8 bg-gold-accent"></span><p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">Mesin Analitik</p></div><h1 className="text-3xl font-black text-white mb-4">Dashboard <span className="text-gold-accent italic">FO KIMA</span></h1>
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{[
        { label: "Pelanggan", val: stats.pelanggan, sub: "Total Provider" },
        { label: "Kontrak Aktif", val: stats.kontrakAktif, sub: "Beroperasi + Belum Beroperasi" },
        { label: "Kapasitas Core", val: stats.kapasitasCore, sub: "Total Core" },
        { label: "Core Tersewa", val: `${stats.coreTersewa} / ${stats.kapasitasCore}`, sub: `Dedicated ${stats.coreDedicatedCount} Lokasi` },
        { label: "Core Tersedia", val: stats.coreTersedia, sub: `${stats.kapasitasCore !== "—" ? Math.round((stats.coreTersedia / stats.kapasitasCore) * 100) : 0}% Available` }].map((s, i) => <StatCard key={i} label={s.label} value={s.val} sub={s.sub} onDetail={s.label === "Core Tersewa" ? () => setCoreRincianOpen(true) : undefined} />)}
      </section>

      {error && (
        <div className="mt-4 rounded-xl bg-red-500/15 border border-red-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <span className="text-xs font-bold text-red-300">Gagal Memuat Data</span>
          </div>
          <p className="text-xs text-red-200/80">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/30 transition-colors">
            Muat Ulang Halaman
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-6 text-center">
          <div className="inline-block w-6 h-6 border-2 border-gold-accent border-t-transparent rounded-full animate-spin mb-2"></div>
          <p className="text-xs text-slate-400">Memuat dashboard...</p>
        </div>
      )}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
      <div className="glass-card rounded-2xl p-4 lg:col-span-2 flex flex-col">
        <div className="shrink-0"><div className="flex items-center gap-2 mb-3"><span className="h-4 w-1 bg-gold-accent rounded-full"></span><h2 className="text-sm font-black text-white">Tren Penggunaan Core</h2></div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 mb-3">
          <div className={toggleBtn}>{[
            { v: "yearly", l: "Tahunan" }, { v: "monthly", l: "Bulanan" }
          ].map(o => <button key={o.v} onClick={() => switchCoreTrendTimeMode(o.v)} className={`rounded-md px-2.5 h-full flex items-center text-[8px] font-black uppercase tracking-widest anim-surface ${timeMode === o.v ? "bg-gold-accent text-white shadow-gold-glow" : "text-white/70 hover:text-white"}`}>{o.l}</button>)}</div>
          {timeMode === "monthly" ? (
            <NativeDropdown
              value={coreTrendDisplayYear}
              options={coreTrendYearOptions}
              onChange={updateCoreTrendMonthlyYear}
            />
          ) : (
            <ChartFilterSelector filter={coreFilter} setFilter={setCoreFilter} availableYears={availableYears} modeOptions={coreTrendModeOptions} />
          )}
          <div className={toggleBtn}>{[
            { v: "sharing", l: "Sharing Core" }, { v: "core", l: "Core" }
          ].map(o => <button key={o.v} onClick={() => setChartType(o.v)} className={`rounded-md px-2.5 h-full flex items-center text-[8px] font-black uppercase tracking-widest anim-surface ${chartType === o.v ? "bg-gold-accent text-white shadow-gold-glow" : "text-white/70 hover:text-white"}`}>{o.l}</button>)}</div>
        </div>
        {chartType === "core" ? (
          coreTrendChartData.length > 0 && <div className="flex flex-wrap gap-2 mb-3"><span className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#d4a937" }}></span>Total Core</span><span className="text-[8px] font-black text-slate-500">{coreTrendChartData[coreTrendChartData.length - 1]?.count || 0} Core</span></div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-[8px] font-black uppercase text-slate-400 mr-2">Sharing:</span>
            {sharingRatios.map(item => (
              <span key={item.ratio} className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }}></span>{item.ratioDisplay}</span>
            ))}
          </div>
        )}</div>
        <div className="flex-1 min-h-[220px] -ml-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartType === "sharing" ? sharingChartData : coreTrendChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 700, fill: "rgba(255,255,255,0.5)" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 700, fill: "rgba(255,255,255,0.5)" }} allowDecimals={false} /><Tooltip {...CHART_TOOLTIP} />{chartType === "core" ? (
          <Line type="monotone" dataKey="count" name="Core" stroke="#d4a937" strokeWidth={3} dot={{ r: 3, fill: "#d4a937" }} />
        ) : (
          sharingRatios.map(item => (
            <Line key={item.ratio} type="monotone" dataKey={item.ratioDisplay} name={item.ratio} stroke={item.color} strokeWidth={2} dot={{ r: 3, fill: item.color }} />
          ))
        )}</LineChart></ResponsiveContainer></div>
      </div>
      <div className="glass-card rounded-2xl p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3"><span className="h-4 w-1 bg-gold-accent rounded-full"></span><h2 className="text-sm font-black text-white">Rincian Sharing Core</h2></div>
        <div className="flex-1 space-y-1.5">{sharingRowsData.map(r => <div key={r.ratio} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10"><div><p className="text-[8px] text-slate-400 uppercase tracking-widest">Paket</p><p className="text-[11px] font-black uppercase" style={{ color: r.color }}>{r.ratio}</p></div><div className="text-right"><span className="text-sm font-black" style={{ color: r.color }}>{r.count}</span><span className="text-[8px] text-slate-500 ml-1 uppercase">Lokasi</span></div></div>)}</div>
        <div className="mt-3 p-2.5 rounded-lg bg-gold-accent/10 border border-gold-accent/20 flex items-center justify-between"><div><p className="text-[8px] text-slate-400 uppercase tracking-widest">Total Lokasi</p><p className="text-xs font-black text-gold-accent">Semua Paket</p></div><span className="text-base font-black text-gold-accent">{sharingTotal}</span></div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
      <div className="glass-card rounded-2xl p-4 lg:col-span-2 flex flex-col">
        <div className="shrink-0"><div className="flex items-center gap-2 mb-3"><span className="h-4 w-1 bg-gold-accent rounded-full"></span><h2 className="text-sm font-black text-white">Grafik Pertumbuhan</h2></div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 mb-3">
          <ChartFilterSelector filter={growthFilter} setFilter={setGrowthFilter} availableYears={availableYears} modeOptions={growthModeOptions} compact />
          <div className={toggleBtn}>{[
            { v: "kontrak", l: "Kontrak" }
          ].map(o => <button key={o.v} onClick={() => setGrowthType(o.v)} className={`rounded-md px-2.5 h-full flex items-center text-[8px] font-black uppercase tracking-widest anim-surface ${growthType === o.v ? "bg-gold-accent text-white shadow-gold-glow" : "text-white/70 hover:text-white"}`}>{o.l}</button>)}</div>
        </div></div>
        <div className="flex-1 min-h-[220px] -ml-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={growthChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: "rgba(255,255,255,0.5)" }} dy={5} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: "rgba(255,255,255,0.5)" }} allowDecimals={false} /><Tooltip {...CHART_TOOLTIP} /><Line type="monotone" dataKey={growthType} name={growthType === "kontrak" ? "Kontrak" : "Pelanggan"} stroke="#d4a937" strokeWidth={4} dot={{ r: 4, fill: "#d4a937" }} /></LineChart></ResponsiveContainer></div>
      </div>
      <div className="glass-card rounded-2xl p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3"><span className="h-4 w-1 bg-gold-accent rounded-full"></span><h2 className="text-sm font-black text-white">Status Kontrak</h2></div>
        <div className="flex-1 space-y-2">{
          Object.entries(stats.kontrakByStatus || {}).length > 0
            ? Object.entries(stats.kontrakByStatus).map(([status, count]) => {
              const colors = {
                "Belum Beroperasi": { cl: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                "Beroperasi": { cl: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                "Proses Perpanjangan": { cl: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
                "Diperpanjang": { cl: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
                "Di-upgrade": { cl: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
                "Berhenti": { cl: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
              };
              const style = colors[status] || { cl: "text-slate-300", bg: "bg-slate-500/10 border-slate-500/20" };
              return <div key={status} className={`flex items-center justify-between p-2.5 rounded-lg border ${style.bg}`}>
                <span className={`text-[9px] font-black uppercase tracking-wider ${style.cl}`}>{status}</span>
                <span className={`text-base font-black ${style.cl}`}>{count}</span>
              </div>;
            })
            : [
              { l: "Beroperasi", c: stats.kontrakAktif, cl: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            ].map(x => <div key={x.l} className={`flex items-center justify-between p-2.5 rounded-lg border ${x.bg}`}><span className={`text-[9px] font-black uppercase tracking-wider ${x.cl}`}>{x.l}</span><span className={`text-base font-black ${x.cl}`}>{x.c}</span></div>)
        }</div>
      </div>
    </div>

    {coreRincianOpen && <CoreRincianModal rows={dashboardData.core_rincian || []} onClose={() => setCoreRincianOpen(false)} />}
  </>;
  });

export default DashboardPage;
