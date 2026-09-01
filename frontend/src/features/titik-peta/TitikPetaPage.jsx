import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileCheck2, Loader2, MapPin, Pencil, Search } from "lucide-react";
import DataTable from "../../components/DataTable";
import { createLocationPoint, deleteIspPoint, deleteLocationPoint, fetchDocumentContent, listIspPoints, listLocationPoints, listMapPoints, rowsFrom, updateLocationPoint, upsertIspPoint } from "../../lib/rust-api";
import MapView from "./MapView";
import BaaFormModal from "./BaaFormModal";

export default function TitikPetaPage({ session }) {
  const tableRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mapRow, setMapRow] = useState(null);
  const [ispPoints, setIspPoints] = useState([]);
  const [locationPoints, setLocationPoints] = useState([]);
  const [baaRow, setBaaRow] = useState(null);
  const [baaAction, setBaaAction] = useState(null);

  const loadIspPoints = useCallback(async () => {
    try {
      const data = await listIspPoints(session.token, 1, 1000);
      const rows = rowsFrom(data);
      setIspPoints(rows);
      return rows;
    } catch (error) {
      console.error("Gagal memuat titik ISP:", error);
      throw error;
    }
  }, [session.token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadIspPoints(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadIspPoints]);

  const loadLocationPoints = useCallback(async (lokasiId, fallback = null) => {
    try {
      const detailRows = await listLocationPoints(session.token, lokasiId);
      const rows = detailRows.length || fallback?.latitude == null || fallback?.longitude == null
        ? detailRows
        : [{
          id: null,
          lokasi_id: lokasiId,
          label: fallback.nama_lokasi || "Titik kontrak",
          latitude: Number(fallback.latitude),
          longitude: Number(fallback.longitude),
        }];
      setLocationPoints(rows);
      return rows;
    } catch (error) {
      console.error("Gagal memuat titik lokasi kontrak:", error);
      throw error;
    }
  }, [session.token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mapRow?.lokasi_id) void loadLocationPoints(mapRow.lokasi_id, mapRow);
      else setLocationPoints([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocationPoints, mapRow]);

  const handleSaveLocationPoint = useCallback(async (data) => {
    try {
      if (data.id) await updateLocationPoint(session.token, data.id, data);
      else await createLocationPoint(session.token, data);
      tableRef.current?.refresh();
      return await loadLocationPoints(data.lokasi_id);
    } catch (error) {
      console.error("Gagal menyimpan titik peta:", error);
      throw error;
    }
  }, [loadLocationPoints, session.token]);

  const handleDeletePoint = async (id) => {
    if (!id) return;
    try {
      await deleteLocationPoint(session.token, id);
      tableRef.current?.refresh();
      if (mapRow?.lokasi_id) await loadLocationPoints(mapRow.lokasi_id);
    } catch (error) {
      console.error("Gagal menghapus titik peta:", error);
      throw error;
    }
  };

  const handleSaveIspPoint = useCallback(async (data) => {
    try {
      await upsertIspPoint(session.token, data);
      await loadIspPoints();
    } catch (error) {
      console.error("Gagal menyimpan titik ISP:", error);
      throw error;
    }
  }, [loadIspPoints, session.token]);

  const handleDeleteIspPoint = useCallback(async (id) => {
    try {
      await deleteIspPoint(session.token, id);
      await loadIspPoints();
    } catch (error) {
      console.error("Gagal menghapus titik ISP:", error);
      throw error;
    }
  }, [loadIspPoints, session.token]);

  const formatCoord = (value) => value == null ? "—" : Number(value).toFixed(6);
  const coordinatesFor = (row) => ({
    latitude: row.latitude ?? row.points?.latitude,
    longitude: row.longitude ?? row.points?.longitude,
  });
  const renderCoordinates = (row) => {
    const { latitude, longitude } = coordinatesFor(row);
    return latitude != null && longitude != null ? (
      <span className="whitespace-nowrap font-mono text-[10px] text-amber-300" title={`${latitude}, ${longitude}`}>
        {formatCoord(latitude)}, {formatCoord(longitude)}
      </span>
    ) : <span className="text-rose-400/70 font-semibold text-[10px] italic">Belum ditentukan</span>;
  };
  const openBaaDocument = async (row, mode = "preview") => {
    if (!row?.baa_document_id) return;
    // Buka tab dari gesture klik agar browser tidak memblokir navigasi setelah
    // response dokumen selesai diambil. Jangan memasang `noopener` di sini:
    // beberapa browser mengembalikan null walaupun tab baru sudah dibuat,
    // sehingga tab berhenti pada halaman putih.
    const documentWindow = mode === "preview" ? window.open("about:blank", "_blank") : null;
    setBaaAction(row.baa_document_id);
    try {
      if (mode === "preview" && !documentWindow) throw new Error("Izinkan pop-up browser untuk membuka PDF BAA.");
      if (documentWindow) {
        documentWindow.opener = null;
        documentWindow.document.title = "Memuat dokumen BAA";
        documentWindow.document.body.innerHTML = "<main style=\"display:grid;min-height:100vh;place-items:center;margin:0;background:#0f172a;color:#e2e8f0;font:600 16px system-ui,sans-serif\">Memuat dokumen BAA…</main>";
      }
      const blob = await fetchDocumentContent(session.token, row.baa_document_id, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        documentWindow.location.href = url;
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = row.baa_document_name || "Dokumen-BAA.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      documentWindow?.close();
      window.alert(error?.message || "Dokumen BAA gagal dibuka.");
    } finally { setBaaAction(null); }
  };
  const columns = [
    { label: "#", render: (_row, index) => (index ?? 0) + 1 },
    { label: "Nama Pelanggan", render: (row) => row.nama_pelanggan || "—" },
    { label: "Nama Lokasi", render: (row) => row.nama_lokasi || "—" },
    { label: "Tanggal Aktivasi", render: (row) => row.tanggal_aktivasi || "—" },
    { label: "Titik Peta (Lat, Long)", render: renderCoordinates },
    { label: "Power", render: (row) => row.power == null ? "—" : `${row.power} dBm` },
    { label: "VLAN", render: (row) => row.vlan_id ?? "—" },
    { label: "MAC Modem", render: (row) => row.mac_modem || "—" },
    {
      label: "Alamat User",
      render: (row) => (
        <span className="block max-w-[240px] truncate" title={row.alamat_user || "—"}>
          {row.alamat_user || "—"}
        </span>
      ),
    },
    {
      label: "Aksi",
      render: (row) => (
        <div className="flex min-w-[190px] flex-wrap gap-1.5">
          {row.baa_document_id ? <>
            <button type="button" onClick={(event) => { event.stopPropagation(); setBaaRow(row); }} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/35 bg-amber-400/15 px-2.5 py-1.5 text-[10px] font-black text-amber-200 transition hover:bg-amber-400/25"><Pencil size={13} />Edit Data BAA</button>
            {row.baa_document_mime_type === "application/pdf" && <>
              <button type="button" onClick={(event) => { event.stopPropagation(); void openBaaDocument(row, "preview"); }} disabled={baaAction === row.baa_document_id} className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300/35 bg-sky-400/15 px-2.5 py-1.5 text-[10px] font-black text-sky-200 transition hover:bg-sky-400/25 disabled:cursor-wait disabled:opacity-60" title={row.baa_created_at ? `BAA dibuat ${row.baa_created_at}` : "Buka PDF BAA"}>{baaAction === row.baa_document_id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}Buka PDF</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); void openBaaDocument(row, "download"); }} disabled={baaAction === row.baa_document_id} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-2.5 py-1.5 text-[10px] font-black text-emerald-200 transition hover:bg-emerald-400/25 disabled:cursor-wait disabled:opacity-60" title="Unduh PDF BAA"><Download size={13} />Unduh PDF</button>
            </>}
          </> : <button type="button" onClick={(event) => { event.stopPropagation(); setBaaRow(row); }} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-2.5 py-1.5 text-[10px] font-black text-emerald-200 transition hover:bg-emerald-400/25"><FileCheck2 size={13} />Isi Form BAA</button>}
          <button type="button" onClick={(event) => { event.stopPropagation(); setMapRow(row); }} className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/20 px-2.5 py-1.5 text-[10px] font-black text-sky-300 transition hover:bg-sky-500/30"><MapPin size={13} />Buka Peta</button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">Manajemen GIS & Lokasi</p>
          </div>
          <h1 className="text-3xl font-black text-white">Titik Peta & Data Teknis <span className="text-gold-accent italic">FO KIMA</span></h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">
            Pantau titik kontrak beserta tanggal aktivasi, power, VLAN, MAC modem, dan alamat user. Tabel dapat digeser horizontal pada layar kecil.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={15} />
          <input
            type="search"
            placeholder="Cari pelanggan / lokasi..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-9 pr-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 transition-all w-64"
          />
        </div>
      </div>

      <div className="flex-1 min-h-[450px] overflow-hidden">
        <DataTable ref={tableRef} load={listMapPoints} columns={columns} session={session} focus={false} search={searchTerm} />
      </div>

      {mapRow && (
        <div className="fixed inset-0 z-[10000] bg-slate-950">
          <MapView
            selectedRow={mapRow}
            ispPoints={ispPoints.filter((point) => point.pelanggan_id === mapRow.pelanggan_id)}
            locationPoints={locationPoints}
            onClose={() => setMapRow(null)}
            onSaveLocationPoint={handleSaveLocationPoint}
            onDeleteLocationPoint={handleDeletePoint}
            onSaveIspPoint={handleSaveIspPoint}
            onDeleteIspPoint={handleDeleteIspPoint}
          />
        </div>
      )}
      <BaaFormModal isOpen={Boolean(baaRow)} row={baaRow} session={session} onClose={() => setBaaRow(null)} onSuccess={() => tableRef.current?.refresh()} />
    </div>
  );
}
