import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Building2, Check, Copy, Edit, LocateFixed, MapPin, PanelLeftClose, PanelLeftOpen, Plus, Save, Trash2, X } from "lucide-react";
import "leaflet/dist/leaflet.css";

const KIMA_CENTER = [-5.096926, 119.498791];
const pointIcon = (kind, active = false) => L.divIcon({ className: "custom-leaflet-marker", html: `<div class="${kind === "isp" ? "bg-amber-500" : "bg-sky-500"} ${active ? "border-white shadow-[0_0_20px_rgba(245,158,11,.9)]" : "border-slate-950"} w-8 h-8 rounded-full border-2 flex items-center justify-center"><div class="w-2 h-2 bg-white rounded-full"></div></div>`, iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16] });
const kimaLogoIcon = L.divIcon({ className: "kima-map-logo", html: '<img src="/logo-kima.png" alt="KIMA" style="width:64px;height:58px;object-fit:contain;display:block;background:transparent" />', iconSize: [64, 58], iconAnchor: [32, 29] });
const coordinateText = (point) => point?.latitude != null && point?.longitude != null ? `${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}` : "Belum ditentukan";

function MapFrame({ points, sidebarOpen, resetRequest }) {
  const map = useMap();
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize();
      if (resetRequest > 0 || !points.length) { map.flyTo(KIMA_CENTER, 15, { animate: true }); return; }
      if (points.length === 1) { map.flyTo(points[0], 15, { animate: true }); return; }
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [sidebarOpen ? 344 : 28, 88],
        paddingBottomRight: [32, 112],
        maxZoom: 16,
        animate: true,
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [map, points, resetRequest, sidebarOpen]);
  return null;
}

function MapClick({ enabled, onPick }) { useMapEvents({ click: (event) => { if (enabled) onPick(event.latlng.lat, event.latlng.lng); } }); return null; }

export default function MapView({ selectedRow, locationPoints = [], ispPoints = [], onClose, onSaveLocationPoint, onDeleteLocationPoint, onSaveIspPoint, onDeleteIspPoint }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState("streets");
  const [target, setTarget] = useState(null);
  const [draftPoint, setDraftPoint] = useState(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [resetRequest, setResetRequest] = useState(0);
  const [copied, setCopied] = useState(false);
  const contentOffset = sidebarOpen ? "left-[21rem]" : "left-4";

  useEffect(() => { setTarget(null); setDraftPoint(null); setLabel(""); setMessage(""); }, [selectedRow]);
  const startLocationEdit = useCallback((point = null) => {
    setTarget({ type: "location", point });
    setDraftPoint(point ? { latitude: point.latitude, longitude: point.longitude } : null);
    setLabel(point?.label || selectedRow.nama_lokasi || ""); setMessage("");
  }, [selectedRow.nama_lokasi]);
  const startIspEdit = useCallback((point = null) => {
    setTarget({ type: "isp", point });
    setDraftPoint(point ? { latitude: point.latitude, longitude: point.longitude } : null);
    setLabel(point?.label || ""); setMessage("");
  }, []);
  const pickPoint = useCallback((latitude, longitude) => setDraftPoint({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) }), []);
  const cancelEdit = () => { if (!saving) { setTarget(null); setDraftPoint(null); setLabel(""); setMessage(""); } };
  const save = async () => {
    const cleanedLabel = label.trim();
    if (!target || !draftPoint) return;
    if (!cleanedLabel) { setIsError(true); setMessage("Label titik wajib diisi."); return; }
    const coordinates = { latitude: Number(Number(draftPoint.latitude).toFixed(6)), longitude: Number(Number(draftPoint.longitude).toFixed(6)) };
    setSaving(true); setMessage("");
    try {
      if (target.type === "location") {
        await onSaveLocationPoint({ id: target.point?.id, lokasi_id: selectedRow.lokasi_id, ...coordinates, label: cleanedLabel });
      } else {
        await onSaveIspPoint({ id: target.point?.id, pelanggan_id: selectedRow.pelanggan_id, ...coordinates, label: cleanedLabel });
      }
      setTarget(null); setDraftPoint(null); setLabel(""); setIsError(false); setMessage(`Tersimpan: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`);
    } catch (error) { setIsError(true); setMessage(error instanceof Error ? error.message : "Gagal menyimpan titik."); }
    finally { setSaving(false); }
  };
  const deletePoint = async (callback, id) => {
    if (!window.confirm("Hapus titik ini?")) return;
    setMessage("");
    try { await callback(id); setIsError(false); setMessage("Titik berhasil dihapus."); }
    catch (error) { setIsError(true); setMessage(error instanceof Error ? error.message : "Gagal menghapus titik."); }
  };
  const allFramePoints = useMemo(() => [...locationPoints, ...ispPoints, ...(draftPoint ? [draftPoint] : [])]
    .filter((point) => point?.latitude != null && point?.longitude != null)
    .map((point) => [Number(point.latitude), Number(point.longitude)]), [draftPoint, ispPoints, locationPoints]);
  const shownLocationPoints = locationPoints.filter((point) => !(target?.type === "location" && target.point?.id === point.id));
  const shownIspPoints = ispPoints.filter((point) => !(target?.type === "isp" && target.point?.id === point.id));
  const pointToCopy = target?.point || locationPoints[0];
  const copyCoordinates = () => { if (!pointToCopy) return; navigator.clipboard.writeText(`${pointToCopy.latitude}, ${pointToCopy.longitude}`); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };

  return <div className="relative h-full w-full bg-slate-950">
    <MapContainer center={KIMA_CENTER} zoom={15} className="h-full w-full" style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url={mapStyle === "streets" ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} />
      <MapFrame points={allFramePoints} sidebarOpen={sidebarOpen} resetRequest={resetRequest} />
      <MapClick enabled={!!target} onPick={pickPoint} />
      <Marker position={KIMA_CENTER} icon={kimaLogoIcon} interactive={false} />
      {shownLocationPoints.map((point) => <Marker key={`location-${point.id}`} position={[Number(point.latitude), Number(point.longitude)]} icon={pointIcon("location")}><Tooltip permanent direction="right" offset={[18, 0]}><span className="text-[10px] font-black">{point.label}</span></Tooltip><Popup><b>{point.label}</b><br /><small>{coordinateText(point)}</small></Popup></Marker>)}
      {shownIspPoints.map((point) => <Marker key={`isp-${point.id}`} position={[Number(point.latitude), Number(point.longitude)]} icon={pointIcon("isp")}><Tooltip permanent direction="right" offset={[18, 0]}><span className="text-[10px] font-black">{point.label}</span></Tooltip><Popup><b>{selectedRow.nama_pelanggan}</b><br />{point.label}<br /><small>{coordinateText(point)}</small></Popup></Marker>)}
      {target && draftPoint && <Marker position={[draftPoint.latitude, draftPoint.longitude]} icon={pointIcon(target.type === "isp" ? "isp" : "location", true)}><Tooltip permanent direction="right" offset={[18, 0]}><span className="text-[10px] font-black">{label || "Isi label titik"}</span></Tooltip></Marker>}
    </MapContainer>

    <aside className={`absolute inset-y-0 left-0 z-[1100] flex flex-col overflow-hidden border-r border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl transition-[width] duration-300 ${sidebarOpen ? "w-80" : "w-0"}`}><div className="min-w-80 pt-20"><div className="border-b border-white/10 px-4 pb-3 text-white"><div className="flex items-center gap-2"><Building2 size={16} className="text-gold-accent" /><p className="text-xs font-black uppercase tracking-wider">Konteks Pelanggan / Kontrak</p></div><p className="mt-1 truncate text-sm font-black">{selectedRow.nama_pelanggan}</p><p className="truncate text-[10px] text-white/55">{selectedRow.nama_lokasi}</p></div>
      <div className="h-[calc(100vh-8rem)] space-y-4 overflow-y-auto p-3 custom-scrollbar">
        <section><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sky-300"><MapPin size={15} /><span className="text-[10px] font-black uppercase tracking-wider">Titik Lokasi / Kontrak</span></div><span className="text-[10px] font-black text-sky-200">{locationPoints.length}</span></div><div className="space-y-1.5">{locationPoints.map((point) => <div key={point.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2"><MapPin size={13} className="shrink-0 text-sky-300" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-white">{point.label}</p><p className="truncate text-[9px] text-white/45">{coordinateText(point)}</p></div><button onClick={() => startLocationEdit(point)} className="p-1 text-white/60 hover:text-sky-300" aria-label="Edit titik lokasi"><Edit size={13} /></button><button onClick={() => deletePoint(onDeleteLocationPoint, point.id)} className="p-1 text-white/60 hover:text-rose-300" aria-label="Hapus titik lokasi"><Trash2 size={13} /></button></div>)}{!locationPoints.length && <p className="text-[10px] italic text-white/40">Belum ada titik lokasi.</p>}</div><button onClick={() => startLocationEdit()} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-sky-500/20 px-2 py-2 text-[10px] font-black text-sky-200 hover:bg-sky-500/30"><Plus size={13} /> Tambah Titik Lokasi</button></section>
        <section><div className="mb-2 flex items-center justify-between text-white"><div className="flex items-center gap-2"><Building2 size={15} className="text-amber-400" /><span className="text-[10px] font-black uppercase tracking-wider">Titik Tetap Pelanggan / ISP</span></div><span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-black text-amber-300">{ispPoints.length}</span></div><div className="space-y-1.5">{ispPoints.map((point) => <div key={point.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2"><MapPin size={13} className="shrink-0 text-amber-400" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-white">{point.label}</p><p className="truncate text-[9px] text-white/45">{coordinateText(point)}</p></div><button onClick={() => startIspEdit(point)} className="p-1 text-white/60 hover:text-amber-300" aria-label="Edit titik ISP"><Edit size={13} /></button><button onClick={() => deletePoint(onDeleteIspPoint, point.id)} className="p-1 text-white/60 hover:text-rose-300" aria-label="Hapus titik ISP"><Trash2 size={13} /></button></div>)}{!ispPoints.length && <p className="text-[10px] italic text-white/40">Belum ada titik tetap.</p>}</div><button onClick={() => startIspEdit()} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-amber-400/40 bg-amber-400/15 px-2 py-2 text-[10px] font-black text-amber-200 hover:bg-amber-400/25"><Plus size={13} /> Tambah Titik Tetap</button></section>
      </div></div></aside>
    <button onClick={() => setSidebarOpen((open) => !open)} className={`absolute top-4 z-[1200] rounded-xl border border-white/15 bg-slate-900/95 p-2 text-white/70 shadow-xl hover:bg-white/10 hover:text-white transition-all ${sidebarOpen ? "left-[19rem]" : "left-4"}`} title={sidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}>{sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
    <div className={`absolute top-4 right-4 z-[1000] flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md transition-[left] duration-300 ${contentOffset}`}><div className="min-w-0 text-white"><p className="truncate text-sm font-black">{selectedRow.nama_pelanggan}</p><p className="truncate text-xs text-white/60">{selectedRow.nama_lokasi}</p></div><div className="flex items-center gap-2"><div className="flex rounded-xl border border-white/15 bg-white/10 p-0.5 text-[10px] font-black"><button onClick={() => setMapStyle("streets")} className={`rounded-lg px-2.5 py-1 ${mapStyle === "streets" ? "bg-gold-accent text-slate-950" : "text-white/70"}`}>Jalan</button><button onClick={() => setMapStyle("satellite")} className={`rounded-lg px-2.5 py-1 ${mapStyle === "satellite" ? "bg-gold-accent text-slate-950" : "text-white/70"}`}>Satelit</button></div><button onClick={() => setResetRequest((request) => request + 1)} className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Pusatkan ke KIMA"><LocateFixed size={18} /></button><button onClick={onClose} className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Tutup peta"><X size={20} /></button></div></div>
    {target && <div className={`absolute bottom-4 right-4 z-[1000] rounded-2xl border border-white/15 bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur-md transition-[left] duration-300 ${contentOffset}`}><p className="mb-2 text-xs font-bold text-amber-300">Klik peta untuk menentukan titik {target.type === "isp" ? "tetap pelanggan / ISP" : "lokasi / kontrak"}.</p><label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-white/55">Label titik <span className="text-rose-300">*</span></label><div className="flex flex-wrap gap-2"><input required disabled={saving} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Contoh: POP Makassar, ODP Gudang" className="min-w-48 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white placeholder-white/35 outline-none focus:ring-2 focus:ring-gold-accent/50 disabled:opacity-50" /><button disabled={saving} onClick={cancelEdit} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20 disabled:opacity-50">Batal</button><button disabled={!draftPoint || !label.trim() || saving} onClick={save} className="inline-flex items-center gap-1 rounded-xl bg-gold-accent px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"><Save size={14} /> {saving ? "Menyimpan..." : "Simpan"}</button></div></div>}
    {message && <div className={`absolute ${target ? "bottom-28" : "bottom-4"} right-4 z-[1001] rounded-xl border px-3 py-2 text-xs font-bold shadow-xl ${isError ? "border-rose-400/40 bg-rose-950/95 text-rose-200" : "border-emerald-400/40 bg-emerald-950/95 text-emerald-200"} ${sidebarOpen ? "left-[21rem]" : "left-4"}`} role={isError ? "alert" : "status"}>{message}</div>}
    {!target && pointToCopy && <button onClick={copyCoordinates} className={`absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-1 rounded-xl border border-white/15 bg-slate-900/95 px-3 py-2 text-xs font-bold text-white shadow-xl hover:bg-white/10 ${message ? "hidden" : ""}`}>{copied ? <Check size={14} /> : <Copy size={14} />} Salin koordinat</button>}
  </div>;
}
