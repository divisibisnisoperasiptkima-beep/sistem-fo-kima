import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import DataTable from "../../components/DataTable";
import { createLocationPoint, deleteIspPoint, deleteLocationPoint, listIspPoints, listLocationPoints, listMapPoints, rowsFrom, updateLocationPoint, upsertIspPoint } from "../../lib/rust-api";
import MapView from "./MapView";

export default function TitikPetaPage({ session }) {
  const tableRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mapRow, setMapRow] = useState(null);
  const [ispPoints, setIspPoints] = useState([]);
  const [locationPoints, setLocationPoints] = useState([]);

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

  const loadLocationPoints = useCallback(async (lokasiId) => {
    try {
      const rows = await listLocationPoints(session.token, lokasiId);
      setLocationPoints(rows);
      return rows;
    } catch (error) {
      console.error("Gagal memuat titik lokasi kontrak:", error);
      throw error;
    }
  }, [session.token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mapRow?.lokasi_id) void loadLocationPoints(mapRow.lokasi_id);
      else setLocationPoints([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocationPoints, mapRow?.lokasi_id]);

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
  const columns = [
    { label: "#", render: (_row, index) => (index ?? 0) + 1 },
    { label: "Nama Pelanggan", render: (row) => row.nama_pelanggan || "—" },
    { label: "Nama Lokasi", render: (row) => row.nama_lokasi || "—" },
    {
      label: "Koordinat",
      render: (row) => row.points?.latitude ? (
        <span className="font-mono text-[10px] text-amber-300">
          {formatCoord(row.points.latitude)}, {formatCoord(row.points.longitude)}
        </span>
      ) : <span className="text-rose-400/70 font-semibold text-[10px] italic">Belum ditentukan</span>,
    },
    {
      label: "Aksi",
      render: (row) => (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); setMapRow(row); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 transition-all text-[10px] font-black"
        >
          <MapPin size={13} />
          Buka Peta
        </button>
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
          <h1 className="text-3xl font-black text-white">Titik Peta <span className="text-gold-accent italic">FO KIMA</span></h1>
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
    </div>
  );
}
