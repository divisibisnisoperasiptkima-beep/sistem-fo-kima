import { useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { X, Save, MapPin, Copy, Check, Layers, Target } from "lucide-react";

import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Controller component to programmatically pan map
function MapViewController({ center }) {
  const map = useMapEvents({});
  if (center) {
    map.flyTo(center, map.getZoom() < 14 ? 15 : map.getZoom());
  }
  return null;
}

export default function MapOverlay({ isOpen, onClose, existingPoint, onSave, lokasiName, pelangganName, jenis = "lokasi", pelangganId }) {
  const initialLat = existingPoint?.latitude ? String(existingPoint.latitude) : "";
  const initialLng = existingPoint?.longitude ? String(existingPoint.longitude) : "";
  const initialPos = existingPoint?.latitude && existingPoint?.longitude
    ? [existingPoint.latitude, existingPoint.longitude]
    : null;

  const [latitude, setLatitude] = useState(initialLat);
  const [longitude, setLongitude] = useState(initialLng);
  const [markerPos, setMarkerPos] = useState(initialPos);
  const [mapTileStyle, setMapTileStyle] = useState("streets");
  const [copied, setCopied] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);
  const [label, setLabel] = useState(existingPoint?.label || "");

  const markerRef = useRef(null);
  const latRef = useRef(null);

  // KIMA Makassar default center if no coordinates
  const defaultCenter = useMemo(
    () => markerPos || [-5.1050, 119.5050],
    [markerPos]
  );

  const handleCoordInput = useCallback((lat, lng) => {
    const formattedLat = Number(lat.toFixed(6));
    const formattedLng = Number(lng.toFixed(6));
    setLatitude(String(formattedLat));
    setLongitude(String(formattedLng));
    setMarkerPos([formattedLat, formattedLng]);
  }, []);

  const handleMapClick = useCallback((lat, lng) => {
    handleCoordInput(lat, lng);
  }, [handleCoordInput]);

  const handleMarkerDragEnd = useCallback(() => {
    const marker = markerRef.current;
    if (marker) {
      const latLng = marker.getLatLng();
      handleCoordInput(latLng.lat, latLng.lng);
    }
  }, [handleCoordInput]);

  const handleLatChange = useCallback((e) => {
    const v = e.target.value;
    setLatitude(v);
    const num = parseFloat(v);
    if (!isNaN(num) && longitude && !isNaN(parseFloat(longitude))) {
      setMarkerPos([num, parseFloat(longitude)]);
    }
  }, [longitude]);

  const handleLngChange = useCallback((e) => {
    const v = e.target.value;
    setLongitude(v);
    const num = parseFloat(v);
    if (latitude && !isNaN(parseFloat(latitude)) && !isNaN(num)) {
      setMarkerPos([parseFloat(latitude), num]);
    }
  }, [latitude]);

  const handleCenterOnMarker = useCallback(() => {
    if (markerPos) {
      setFlyTarget([...markerPos]);
    }
  }, [markerPos]);

  const handleCopyCoords = useCallback(() => {
    if (latitude && longitude) {
      navigator.clipboard.writeText(`${latitude}, ${longitude}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [latitude, longitude]);

  const handleSave = () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    const data = jenis === "isp"
      ? { id: existingPoint?.id ?? undefined, pelanggan_id: pelangganId, latitude: lat, longitude: lng, label: label.trim() || null }
      : { lokasi_id: existingPoint?.lokasi_id, latitude: lat, longitude: lng, label: label.trim() || null };
    onSave(data);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="relative w-full h-full max-w-[100vw] max-h-[100vh] flex flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-[10000] flex items-center justify-between p-4 bg-black/80 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gold-accent/20 border border-gold-accent/40 text-gold-accent">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">{pelangganName || "Pelanggan"}</h2>
              <p className="text-[10px] font-semibold text-white/60">{lokasiName || "Lokasi"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tile Layer Switcher */}
            <div className="flex items-center rounded-xl bg-white/10 p-0.5 border border-white/15 backdrop-blur-md mr-2">
              <button
                type="button"
                onClick={() => setMapTileStyle("streets")}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                  mapTileStyle === "streets"
                    ? "bg-gold-accent text-white shadow-md"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Jalan (OSM)
              </button>
              <button
                type="button"
                onClick={() => setMapTileStyle("satellite")}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                  mapTileStyle === "satellite"
                    ? "bg-gold-accent text-white shadow-md"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Satelit
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={!latitude || !longitude}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/60 transition-all backdrop-blur-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              Simpan
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-white/10 border border-white/15 text-white/70 hover:bg-white/20 hover:text-white transition-all backdrop-blur-md"
            >
              <X size={14} />
              Tutup
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={defaultCenter}
            zoom={markerPos ? 16 : 14}
            className="w-full h-full"
            style={{ height: "100%", width: "100%" }}
          >
            {mapTileStyle === "streets" ? (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            ) : (
              <TileLayer
                attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            )}
            <MapClickHandler onMapClick={handleMapClick} />
            {flyTarget && <MapViewController center={flyTarget} />}
            {markerPos && (
              <Marker
                ref={markerRef}
                position={markerPos}
                draggable={true}
                eventHandlers={{ dragend: handleMarkerDragEnd }}
              />
            )}
          </MapContainer>

          {/* Quick Floating Map Actions */}
          {markerPos && (
            <div className="absolute top-20 right-4 z-[200] flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCenterOnMarker}
                title="Ke Lokasi Pin Marker"
                className="p-2.5 rounded-xl bg-black/70 border border-white/20 text-white hover:bg-black/90 hover:border-gold-accent/50 transition-all backdrop-blur-md shadow-lg"
              >
                <Target size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Coordinate Input Panel */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[10000]">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 rounded-2xl glass-popover shadow-2xl border border-white/20 bg-slate-900/90">
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Lat</label>
              <input
                ref={latRef}
                type="number"
                step="any"
                placeholder="-5.1050"
                value={latitude}
                onChange={handleLatChange}
                className="w-32 px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Lng</label>
              <input
                type="number"
                step="any"
                placeholder="119.5050"
                value={longitude}
                onChange={handleLngChange}
                className="w-32 px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all"
              />
            </div>

            {latitude && longitude && (
              <button
                type="button"
                onClick={handleCopyCoords}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-all"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copied ? "Tersalin!" : "Salin"}</span>
              </button>
            )}

            <div className="text-[9px] font-bold text-amber-300/80 uppercase tracking-wider flex items-center gap-1 ml-1">
              <span>* Geser (drag) pin pada peta atau ketik koordinat</span>
            </div>

            <div className="flex items-center gap-2 pl-3 border-l border-white/15">
              <label className="text-[9px] font-black text-white/50 uppercase tracking-wider">Label</label>
              <input
                type="text"
                placeholder="Nama cabang / deskripsi"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-44 px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
