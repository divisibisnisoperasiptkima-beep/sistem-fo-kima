import { useRef, useState } from "react";
import DataTable from "../../components/DataTable";
import { listPortalRegistrations } from "../../lib/rust-api";
import { registrationColumns } from "./registrationColumns";
import RegistrationActionButtons from "./RegistrationActionButtons";
import ApproveRegistrationModal from "./ApproveRegistrationModal";
import RejectRegistrationModal from "./RejectRegistrationModal";
import OfferRegistrationModal from "./OfferRegistrationModal";
import LegalApprovalModal from "./LegalApprovalModal";
import PksRegistrationModal from "./PksRegistrationModal";
import RegistrationDetailModal from "./RegistrationDetailModal";
import CancelRegistrationModal from "./CancelRegistrationModal";
import BaaVerificationModal from "./BaaVerificationModal";

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "menunggu", label: "Menunggu" },
  { value: "disetujui", label: "Disetujui" },
  { value: "negosiasi", label: "Negosiasi" },
  { value: "ditolak", label: "Ditolak" },
  { value: "dibatalkan", label: "Dibatalkan" },
];

export default function PortalRegistrationsAdmin({ session }) {
  const tableRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [offerTarget, setOfferTarget] = useState(null);
  const [legalTarget, setLegalTarget] = useState(null);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [pksTarget, setPksTarget] = useState(null);
  const [baaTarget, setBaaTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const handleSuccess = () => {
    tableRef.current?.refresh();
  };

  const columns = registrationColumns.map((col) =>
    col.label === "Aksi"
      ? {
          ...col,
          render: (row) => (
            <RegistrationActionButtons
              row={row}
              onApprove={setApproveTarget}
              onReject={setRejectTarget}
              onCancel={setCancelTarget}
              onOffer={setOfferTarget}
              onLegal={(registration, stage) => setLegalTarget({ registration, stage })}
              onDecision={setDecisionTarget}
              onPks={setPksTarget}
              onBaa={setBaaTarget}
              onDetail={setDetailTarget}
            />
          ),
        }
      : col
  );

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 sm:gap-3">
            <span className="h-[2px] w-6 shrink-0 bg-sky-300 sm:w-8" />
            <p className="truncate text-[9px] font-black uppercase tracking-[0.24em] text-sky-300 sm:text-[10px] sm:tracking-[0.4em]">SOP 1 · Antrean terpisah</p>
          </div>
          <h1 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Permohonan Layanan <span className="text-sky-300 italic">FO KIMA</span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-relaxed text-white/50">
            Tinjau permohonan dari lokasi sebelum konfirmasi kebutuhan dan survei jalur
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`min-h-9 w-full rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase tracking-wide transition-all sm:w-auto sm:px-3 sm:text-[10px] sm:tracking-wider ${
                statusFilter === f.value
                  ? "border-gold-accent bg-gold-accent/20 text-gold-accent"
                  : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        ref={tableRef}
        title="Daftar Permohonan Layanan"
        load={listPortalRegistrations}
        columns={columns}
        session={session}
        status={statusFilter}
        filterRow={statusFilter === "negosiasi" ? (row) => row.penawaran_status === "negosiasi" : undefined}
      />

      <ApproveRegistrationModal
        isOpen={!!approveTarget}
        registration={approveTarget}
        session={session}
        onClose={() => setApproveTarget(null)}
        onSuccess={handleSuccess}
      />

      <RejectRegistrationModal
        isOpen={!!rejectTarget}
        registration={rejectTarget}
        session={session}
        onClose={() => setRejectTarget(null)}
        onSuccess={handleSuccess}
      />
      <CancelRegistrationModal
        registration={cancelTarget}
        session={session}
        onClose={() => setCancelTarget(null)}
        onSuccess={() => { setCancelTarget(null); handleSuccess(); }}
      />
      <OfferRegistrationModal isOpen={!!offerTarget} registration={offerTarget} session={session} onClose={() => setOfferTarget(null)} onSuccess={handleSuccess} />
      <LegalApprovalModal isOpen={!!legalTarget} registration={legalTarget?.registration} stage={legalTarget?.stage} session={session} onClose={() => setLegalTarget(null)} onSuccess={handleSuccess} />
      <LegalApprovalModal isOpen={!!decisionTarget} registration={decisionTarget} stage="decision" session={session} onClose={() => setDecisionTarget(null)} onSuccess={handleSuccess} />
      <PksRegistrationModal isOpen={!!pksTarget} registration={pksTarget} session={session} onClose={() => setPksTarget(null)} onSuccess={handleSuccess} />
      <BaaVerificationModal isOpen={!!baaTarget} registration={baaTarget} session={session} onClose={() => setBaaTarget(null)} onSuccess={() => { setBaaTarget(null); handleSuccess(); }} />
      <RegistrationDetailModal isOpen={!!detailTarget} registration={detailTarget} session={session} onClose={() => setDetailTarget(null)} />
    </div>
  );
}
