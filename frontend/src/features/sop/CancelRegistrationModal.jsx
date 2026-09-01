import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cancelPortalRegistration, cancelPortalRegistrationByAdmin } from "../../lib/rust-api";

export default function CancelRegistrationModal({ registration, email, session, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!registration) return null;

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (session?.token) {
        await cancelPortalRegistrationByAdmin(session.token, registration.id, trimmed);
      } else {
        await cancelPortalRegistration(registration.kode_registrasi, email, trimmed);
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message || "Permohonan gagal dibatalkan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !saving && onClose?.()} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-rose-400/25 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-500/15 p-2.5 text-rose-200"><AlertTriangle size={20} /></div>
            <div>
              <h2 className="font-black text-white">Batalkan permohonan?</h2>
              <p className="mt-1 text-xs leading-5 text-white/55">{registration.kode_registrasi} · {registration.lokasi_nama}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Tutup"><X size={18} /></button>
        </div>
        <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Pembatalan hanya tersedia sebelum layanan aktif. Riwayat permohonan tetap disimpan untuk audit.</p>
        <label className="mt-4 block text-xs font-bold text-white/75">Alasan pembatalan *
          <textarea autoFocus required minLength={5} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: kebutuhan layanan berubah atau pengajuan tidak dilanjutkan." className="mt-1.5 w-full resize-none rounded-xl border border-white/15 bg-slate-900 p-3 text-sm font-normal text-white outline-none transition focus:border-rose-300/60" />
        </label>
        {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-white/70 hover:bg-white/10 disabled:opacity-40">Kembali</button>
          <button type="submit" disabled={saving || reason.trim().length < 5} className="inline-flex items-center gap-2 rounded-xl bg-rose-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}{session?.token ? "Batalkan dari KIMA" : "Batalkan permohonan"}</button>
        </div>
      </form>
    </div>
  );
}
