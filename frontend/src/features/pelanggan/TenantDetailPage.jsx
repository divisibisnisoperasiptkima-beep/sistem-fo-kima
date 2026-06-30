import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FieldInput,
  FieldSelect,
  SummaryCard,
} from "../../components/shared/AppShared";
import FoRoutePlanner from "./components/FoRoutePlanner";
import DateInput from "../../components/shared/DateInput";
import { resolveTenantDetailAccess } from "./tenantDetailAccess";
import { useScrollLock } from "../../hooks/useScrollLock";
import { tenantDetailData } from "./tenantDetailData";
import {
  documentTypeLabelMap,
  timelineIconMap,
} from "../../app/constants";
import {
  addDaysToIsoDate,
  buildInvoiceScheduleRows,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatPackageRatio,
  getCustomerDisplayActionSummary,
  isOpenableFileUrl,
  openSafeFile,
  resolveCustomerContractPeriodInfo,
  resolveCustomerPackageInfo,
  resolveCustomerOperationalStatus,
  resolveInvoiceDueMonthIsoDate,
  toTitleCase,
} from "../../app/utils";
import { getTenantProviderDisplayName } from "./utils";
import { useUpload } from "../../components/UploadProgressProvider";

const ROUTE_OPERATION_LABEL_MAP = {
  add: "Tambah Titik",
  update: "Edit Titik",
  delete: "Hapus Titik",
  reorder: "Atur Ulang Urutan",
  status: "Ubah Status Jalur",
  replace: "Setel Ulang Jalur",
  commit: "Simpan Jalur",
};

const ROUTE_META_PREFIX = "[FO_ROUTE_META]";

const INVOICE_STATUS_OPTIONS = [
  { value: "belum_ditagih", label: "Belum Ditagih" },
  { value: "belum_bayar", label: "Belum Bayar" },
  { value: "terlambat", label: "Terlambat" },
  { value: "lunas", label: "Lunas" },
];

function useMinWidthQuery(minWidth) {
  const getMatches = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(`(min-width: ${minWidth}px)`).matches;
  };

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(`(min-width: ${minWidth}px)`);
    const handleChange = (event) => {
      setMatches(event.matches);
    };

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleChange);
      return () => mediaQueryList.removeEventListener("change", handleChange);
    }

    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [minWidth]);

  return matches;
}

function encodeRoutePlannerMeta(routeMeta) {
  if (!routeMeta || typeof routeMeta !== "object") {
    return "";
  }

  try {
    return `${ROUTE_META_PREFIX}${btoa(unescape(encodeURIComponent(JSON.stringify(routeMeta))))}`;
  } catch {
    return "";
  }
}

function decodeRoutePlannerMeta(encodedValue) {
  if (typeof encodedValue !== "string" || !encodedValue.trim()) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(escape(atob(encodedValue.trim()))));
  } catch {
    return null;
  }
}

function sanitizeRoutePlannerMeta(routeMeta) {
  const geometryCoordinates = Array.isArray(routeMeta?.geometryCoordinates)
    ? routeMeta.geometryCoordinates.filter(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(Number(coordinate[0])) &&
        Number.isFinite(Number(coordinate[1])),
    )
    : [];

  return {
    profile:
      typeof routeMeta?.profile === "string" ? routeMeta.profile : undefined,
    source: typeof routeMeta?.source === "string" ? routeMeta.source : "planner",
    mode: typeof routeMeta?.mode === "string" ? routeMeta.mode : "manual",
    distance: Number(routeMeta?.distance ?? 0),
    duration: Number(routeMeta?.duration ?? 0),
    geometryCoordinates,
    roads: Array.isArray(routeMeta?.roads) ? routeMeta.roads : [],
  };
}

function splitRoutePointNote(note) {
  const rawNote = typeof note === "string" ? note : "";
  const metadataIndex = rawNote.indexOf(ROUTE_META_PREFIX);

  if (metadataIndex < 0) {
    return {
      displayNote: rawNote.trim(),
      routeMeta: null,
    };
  }

  const displayNote = rawNote.slice(0, metadataIndex).trim();
  const routeMeta = decodeRoutePlannerMeta(
    rawNote.slice(metadataIndex + ROUTE_META_PREFIX.length),
  );

  return {
    displayNote,
    routeMeta,
  };
}

function mergeRoutePlannerMetaIntoNote(note, routeMeta) {
  const { displayNote } = splitRoutePointNote(note);
  const encodedMeta = encodeRoutePlannerMeta(sanitizeRoutePlannerMeta(routeMeta));

  if (!encodedMeta) {
    return displayNote;
  }

  return displayNote ? `${displayNote}\n${encodedMeta}` : encodedMeta;
}

function attachRoutePlannerMetaToDraftPoints(points, routeMeta) {
  return (Array.isArray(points) ? points : []).map((point, index) => ({
    ...point,
    note:
      index === 0
        ? mergeRoutePlannerMetaIntoNote(point?.note, routeMeta)
        : splitRoutePointNote(point?.note).displayNote,
  }));
}

function extractRoutePlannerMetaFromPoints(points) {
  for (const point of Array.isArray(points) ? points : []) {
    const { routeMeta } = splitRoutePointNote(point?.note);
    const normalizedMeta = sanitizeRoutePlannerMeta(routeMeta);
    if (normalizedMeta.geometryCoordinates.length >= 2) {
      return normalizedMeta;
    }
  }

  return null;
}

function normalizeDraftRoutePoints(points) {
  const sourcePoints = Array.isArray(points) ? points : [];

  return sourcePoints.map((point, index) => ({
    ...point,
    id: point?.id ?? `draft-restored-${Date.now()}-${index}`,
    pathName:
      typeof point?.pathName === "string" && point.pathName.trim()
        ? point.pathName.trim()
        : `Titik ${index + 1}`,
    pointType:
      point?.pointType === "awal" ||
        point?.pointType === "transit" ||
        point?.pointType === "tujuan"
        ? point.pointType
        : index === 0
          ? "awal"
          : index === sourcePoints.length - 1
            ? "tujuan"
            : "transit",
    note: typeof point?.note === "string" ? point.note : "",
    orderNumber: Number(point?.orderNumber ?? index + 1),
  }));
}

function getInvoiceFollowUps(invoice) {
  const followUps = Array.isArray(invoice?.invoiceFollowUps)
    ? invoice.invoiceFollowUps
    : [];
  return [...followUps].sort(
    (left, right) =>
      Number(left?.splitOrder ?? 0) - Number(right?.splitOrder ?? 0),
  );
}

function isInvoicePaid(invoice) {
  return String(invoice?.status ?? "").toLowerCase() === "lunas" ||
    isOpenableFileUrl(invoice?.paymentProofFileUrl) ||
    (typeof invoice?.paidAt === "string" && invoice.paidAt.trim().length > 0);
}

function hasUploadedInvoiceSplit(invoice) {
  return getInvoiceFollowUps(invoice).some((followUp) =>
    isOpenableFileUrl(followUp?.invoiceFileUrl),
  );
}

function hasAnyUploadedInvoiceFile(invoice) {
  return isOpenableFileUrl(invoice?.invoiceFileUrl) || hasUploadedInvoiceSplit(invoice);
}

function getInvoiceSetupWarnings(invoice) {
  const warnings = [];
  const dueDate = String(invoice?.workflowDueDate ?? invoice?.dueDate ?? "").trim();
  const amount = Number(invoice?.workflowAmount ?? invoice?.amount ?? 0);

  if (!dueDate) {
    warnings.push({
      code: "missing_due_date",
      message: "Segera mengatur bulan jatuh tempo pembayaran.",
    });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    warnings.push({
      code: "missing_amount",
      message: "Mengatur nominal jumlah pembayaran.",
    });
  }

  return warnings;
}

function getInvoiceWorkflowMeta(
  invoice,
  rowsForSequence = [],
  todayIso = new Date().toISOString().slice(0, 10),
) {
  const followUps = getInvoiceFollowUps(invoice);
  const firstFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? 0) === 1) ?? null;
  const secondFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? 0) === 2) ?? null;
  const thirdFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? 0) === 3) ?? null;
  const setupWarnings = getInvoiceSetupWarnings(invoice);
  const dueDate = String(invoice?.workflowDueDate ?? invoice?.dueDate ?? "").trim();
  const h7Date = dueDate ? addDaysToIsoDate(dueDate, -7) : "";
  const h3Date = dueDate ? addDaysToIsoDate(dueDate, -3) : "";
  const hasMainInvoiceFile = isOpenableFileUrl(invoice?.invoiceFileUrl);
  const firstWarningUploaded = isOpenableFileUrl(firstFollowUp?.invoiceFileUrl);
  const secondWarningUploaded = isOpenableFileUrl(secondFollowUp?.invoiceFileUrl);
  const thirdWarningUploaded = isOpenableFileUrl(thirdFollowUp?.invoiceFileUrl);
  const paid = isInvoicePaid(invoice);
  const h7Reached = Boolean(h7Date && h7Date <= todayIso);
  const h3Reached = Boolean(h3Date && h3Date <= todayIso);
  const dueDateReached = Boolean(dueDate && dueDate <= todayIso);
  const hasAnyInvoiceFile = hasMainInvoiceFile || firstWarningUploaded || secondWarningUploaded || thirdWarningUploaded;
  const hasBlockingPreviousUnpaid = rowsForSequence.some(
    (candidate) => candidate.paymentOrder < invoice.paymentOrder && !isInvoicePaid(candidate),
  );

  if (paid) {
    return {
      key: "paid",
      label: "Lunas",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: false,
      canUploadFirstWarning: false,
      canUploadSecondWarning: false,
      canMarkPaid: false,
    };
  }

  if (setupWarnings.length > 0) {
    return {
      key: "pending_setup",
      label: "Lengkapi Data",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: false,
      canUploadFirstWarning: false,
      canUploadSecondWarning: false,
      canMarkPaid: false,
    };
  }

  if (dueDateReached && (secondWarningUploaded || h3Reached)) {
    return {
      key: "warning_unpaid",
      label: "Warning Belum Bayar",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: false,
      canUploadFirstWarning: false,
      canUploadSecondWarning: h3Reached && !secondWarningUploaded,
      canMarkPaid: hasAnyInvoiceFile,
    };
  }

  if (h3Reached && !hasBlockingPreviousUnpaid && (hasMainInvoiceFile || firstWarningUploaded) && !secondWarningUploaded) {
    return {
      key: "warning_required_h3",
      label: "Peringatan Kedua",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: false,
      canUploadFirstWarning: false,
      canUploadSecondWarning: true,
      canMarkPaid: hasAnyInvoiceFile,
    };
  }

  if (hasAnyInvoiceFile) {
    return {
      key: "waiting_payment_confirmation",
      label: "Menunggu Konfirmasi Pembayaran",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: false,
      canUploadFirstWarning: false,
      canUploadSecondWarning: h3Reached && !secondWarningUploaded,
      canMarkPaid: true,
    };
  }

  if (h7Reached && !hasBlockingPreviousUnpaid) {
    return {
      key: "warning_required_h7",
      label: "Peringatan Pertama",
      setupWarnings,
      firstFollowUp,
      secondFollowUp,
      thirdFollowUp,
      hasMainInvoiceFile,
      firstWarningUploaded,
      secondWarningUploaded,
      thirdWarningUploaded,
      hasAnyInvoiceFile,
      canUploadMainInvoice: true,
      canUploadFirstWarning: true,
      canUploadSecondWarning: false,
      canMarkPaid: false,
    };
  }

  return {
    key: "pending",
    label: "Menunggu Jadwal",
    setupWarnings,
    firstFollowUp,
    secondFollowUp,
    thirdFollowUp,
    hasMainInvoiceFile,
    firstWarningUploaded,
    secondWarningUploaded,
    thirdWarningUploaded,
    hasAnyInvoiceFile,
    canUploadMainInvoice: false,
    canUploadFirstWarning: false,
    canUploadSecondWarning: false,
    canMarkPaid: true,
  };
}

function resolveInvoiceStatusMeta(invoice) {
  const workflowMeta = invoice?.workflowMeta ?? getInvoiceWorkflowMeta(invoice);
  const badgeClassByKey = {
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning_unpaid: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    warning_required_h3: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    warning_required_h7: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    waiting_payment_confirmation: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    pending_setup: "bg-white/5 text-white/30 border-white/10",
    pending: "bg-white/5 text-white/30 border-white/10",
  };

  return {
    key: workflowMeta.key,
    label: workflowMeta.label,
    badgeClass: badgeClassByKey[workflowMeta.key] ?? "bg-slate-100 text-slate-700",
  };
}

function GlassSelect({ label, value, onChange, options, placeholder = "Pilih opsi", className = "", textClass = "text-[10px] font-black uppercase tracking-widest", optionTextClass = "text-[9px] font-black uppercase tracking-widest", disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeDropdown = () => {
      setIsOpen(false);
      setDropdownPosition(null);
    };

    window.addEventListener("resize", closeDropdown);
    window.addEventListener("scroll", closeDropdown, true);

    return () => {
      window.removeEventListener("resize", closeDropdown);
      window.removeEventListener("scroll", closeDropdown, true);
    };
  }, [isOpen]);

  const openDropdown = (event) => {
    if (disabled) return;

    if (isOpen) {
      setIsOpen(false);
      setDropdownPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = Math.min(192, (options.length * 34) + 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight + 8
      ? Math.max(8, rect.top - menuHeight - 4)
      : rect.bottom + 4;

    setDropdownPosition({
      left: rect.left,
      top,
      width: rect.width,
    });
    setIsOpen(true);
  };

  const dropdownMenu = isOpen && !disabled && dropdownPosition && (
    <>
      <div
        className="fixed inset-0 z-[110]"
        onClick={() => {
          setIsOpen(false);
          setDropdownPosition(null);
        }}
      />
      <div
        className="fixed z-[120] animate-in fade-in zoom-in-95 rounded-lg border border-white/10 bg-[#0a0f18]/95 p-1 shadow-2xl backdrop-blur-2xl duration-200"
        style={{
          left: `${dropdownPosition.left}px`,
          top: `${dropdownPosition.top}px`,
          width: `${dropdownPosition.width}px`,
        }}
      >
        <div className="no-scrollbar max-h-48 overflow-y-auto space-y-0.5">
          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                className={`flex w-full items-center justify-between px-2 py-1.5 text-left ${optionTextClass} transition-all rounded-md ${isSelected
                  ? "bg-gold-accent/10 text-gold-accent"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                  setDropdownPosition(null);
                }}
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative space-y-1.5">
      {label && (
        <label className="ml-1 block text-[8px] font-black uppercase tracking-widest text-white/20">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          className={`group flex ${className || "h-10"} w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.01] backdrop-blur-3xl px-3 ${textClass} text-white outline-none transition-all focus:border-gold-accent/40 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40`}
          disabled={disabled}
          onClick={openDropdown}
          type="button"
        >
          <span className={selectedOption ? "text-white truncate" : "text-white/20 truncate"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span
            className={`material-symbols-outlined text-gold-accent transition-transform duration-300 shrink-0 ${isOpen ? "rotate-180" : ""}`}
            style={{ fontSize: "16px" }}
          >
            expand_more
          </span>
        </button>

        {typeof document !== "undefined" ? createPortal(dropdownMenu, document.body) : dropdownMenu}
      </div>
    </div>
  );
}

function GlassInput({ label, icon, ...props }) {
  const isDate = props.type === "date";
  const { type, value, onChange, disabled, ...rest } = props;
  return (
    <div className="relative space-y-1.5">
      {label && (
        <label className="ml-1 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-white/20">
          {label}
        </label>
      )}
      <div className="group relative">
        {isDate ? (
          <DateInput
            value={value ?? ""}
            onChange={(val) => onChange?.({ target: { value: val } })}
            disabled={disabled}
            className={`h-10 w-full rounded-xl border border-white/5 bg-white/[0.01] backdrop-blur-3xl ${icon ? "pl-10" : ""} transition-all focus-within:border-gold-accent/40 focus-within:bg-white/[0.04]`}
            inputClass={`w-full h-full bg-transparent ${icon ? "pl-10" : "px-3"} pr-9 text-[10px] placeholder:text-[9px] placeholder:tracking-wider font-black uppercase tracking-widest text-white outline-none`}
          />
        ) : (
          <input
            {...rest}
            type={type}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className={`h-10 w-full rounded-xl border border-white/5 bg-white/[0.01] backdrop-blur-3xl ${icon ? "pl-10" : "px-3"} pr-3 text-[10px] placeholder:text-[9px] placeholder:tracking-wider font-black uppercase tracking-widest text-white outline-none transition-all focus:border-gold-accent/40 focus:bg-white/[0.04]`}
          />
        )}
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/20 transition-colors group-focus-within:text-gold-accent pointer-events-none" style={{ fontSize: "16px" }}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDisplayContractNumber(contractNumber) {
  const normalizedNumber = String(contractNumber ?? "").trim();
  if (
    !normalizedNumber
    || normalizedNumber.startsWith("NO-BAK-")
    || normalizedNumber.startsWith("CTR-")
  ) {
    return "-";
  }
  return normalizedNumber;
}

const formatRupiahInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const numberString = String(value).replace(/[^0-9]/g, "");
  if (!numberString) return "";
  return new Intl.NumberFormat("id-ID").format(Number(numberString));
};

const parseRupiahInput = (value) => {
  if (!value) return 0;
  const numberString = String(value).replace(/[^0-9]/g, "");
  return Number(numberString) || 0;
};

const createInitialPaymentRealizationDraft = () => ({
  periodStartMonth: "",
  periodEndMonth: "",
  amount: "",
  notes: "",
  uploadedFileName: "",
  uploadedFile: null,
});

const formatPaymentRealizationPeriod = (startMonth, endMonth) => {
  const normalizedStartMonth = String(startMonth ?? "").slice(0, 10);
  const normalizedEndMonth = String(endMonth ?? "").slice(0, 10);

  if (!normalizedStartMonth && !normalizedEndMonth) {
    return "-";
  }
  if (normalizedStartMonth && normalizedEndMonth && normalizedStartMonth === normalizedEndMonth) {
    return formatMonthYear(normalizedStartMonth);
  }
  if (!normalizedStartMonth) {
    return formatMonthYear(normalizedEndMonth);
  }
  if (!normalizedEndMonth) {
    return formatMonthYear(normalizedStartMonth);
  }
  return `${formatMonthYear(normalizedStartMonth)} - ${formatMonthYear(normalizedEndMonth)}`;
};

const isValidIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  return Number.isFinite(parsedDate.getTime())
    && parsedDate.getUTCFullYear() === year
    && parsedDate.getUTCMonth() + 1 === month
    && parsedDate.getUTCDate() === day;
};

const getDaysUntilIsoDate = (targetDateValue, todayIso) => {
  const targetDate = new Date(`${String(targetDateValue ?? "").slice(0, 10)}T00:00:00.000Z`);
  const todayDate = new Date(`${String(todayIso ?? "").slice(0, 10)}T00:00:00.000Z`);
  const diffMs = targetDate.getTime() - todayDate.getTime();
  return Number.isFinite(diffMs)
    ? Math.floor(diffMs / (1000 * 60 * 60 * 24))
    : null;
};

const resolveDocumentTypeLabel = (jenisDokumen) => {
  const rawType = typeof jenisDokumen === "string" ? jenisDokumen : String(jenisDokumen ?? "");
  const mappedLabel = documentTypeLabelMap[rawType];
  return typeof mappedLabel === "string" && mappedLabel.trim()
    ? mappedLabel
    : rawType;
};

const resolveBillingMode = (billingEvery, billingUnit) => {
  const every = Number(billingEvery ?? 1);
  const unit = String(billingUnit ?? "bulan");

  if (every === 1 && unit === "bulan") {
    return "monthly";
  }
  if (every === 3 && unit === "bulan") {
    return "quarterly";
  }
  return "custom";
};

const resolveBillingCycleAmount = (monthlyAmount, billingCycle) => {
  const amount = Number(monthlyAmount ?? 0);
  const every = Number(billingCycle?.every ?? 1);
  const unit = String(billingCycle?.unit ?? "bulan");

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(every) || every <= 0) {
    return 0;
  }

  if (unit === "tahun") {
    return amount * every * 12;
  }
  if (unit === "bulan") {
    return amount * every;
  }
  if (unit === "hari") {
    return Math.round((amount / 30) * every);
  }

  return amount;
};

function TenantDetailPage({
  customer,
  initialTab = "overview",
  onBack,
  onEditTenant,
  onNavigate,
  onOpenRoutePlanner,
  onRefreshAll,
  routeViewMode = "embedded",
  backLabel = "Kembali ke Workspace",
  canEditTenant = true,
  canDeleteTenant = true,
  currentRole = "admin",
}) {
  const { uploadWithProgress } = useUpload();
  const {
    isTeknisi,
    isIsp,
    canManageRoute,
    canManageTenantContracts,
  } = resolveTenantDetailAccess(currentRole);
  const [activeTab, setActiveTab] = useState(initialTab);
  const isDesktopViewport = useMinWidthQuery(1280);
  const [detail, setDetail] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState("");
  const [documentDraft, setDocumentDraft] = useState({
    jenisDokumen: "penawaran",
    nomorDokumen: "",
    tanggalDokumen: "",
    contractVersionId: "",
    customJenisDokumen: "",
    fileUrl: "",
    uploadedFileName: "",
    uploadedFile: null,
  });
  const [documentError, setDocumentError] = useState("");
  const [documentFeedback, setDocumentFeedback] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentSort, setDocumentSort] = useState("desc");
  const [tenantDocCurrentPage, setTenantDocCurrentPage] = useState(1);
  const [tenantDocItemsPerPage, setTenantDocItemsPerPage] = useState(10);
  const tenantDocPaginationRef = useRef(null);
  const isTenantDocScrollingProgrammatically = useRef(false);
  const [contractSearch, setContractSearch] = useState("");
  const [contractSort, setContractSort] = useState("desc");
  const [expandedContracts, setExpandedContracts] = useState({});
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [versionEditor, setVersionEditor] = useState(null);
  const [renewalConfirmData, setRenewalConfirmData] = useState(null);
  const [versionError, setVersionError] = useState("");
  const [isSubmittingVersion, setIsSubmittingVersion] = useState(false);
  const [contractRowEditor, setContractRowEditor] = useState(null);
  const isSelectingFileRef = useRef(false);
  const [isSavingContractRow, setIsSavingContractRow] = useState(false);
  const [, setIsActionLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePermanently, setDeletePermanently] = useState(false);
  const [ispPopupOpen, setIspPopupOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeletingTenant, setIsDeletingTenant] = useState(false);

  const [manualSp2Visible, setManualSp2Visible] = useState(new Set());
  const [manualSp3Visible, setManualSp3Visible] = useState(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());

  const handleToggleManualSp2 = (invoiceId) => {
    setManualSp2Visible((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const handleToggleManualSp3 = (invoiceId) => {
    setManualSp3Visible((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };
  const [invoiceBulkForm, setInvoiceBulkForm] = useState({ dueDate: "", amount: "", status: "" });
  const [invoicePaymentOrderSort, setInvoicePaymentOrderSort] = useState("asc");
  const [invoiceDrafts, setInvoiceDrafts] = useState({});
  const [invoiceFeedback, setInvoiceFeedback] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [openInvoiceStatusId, setOpenInvoiceStatusId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const savingInvoiceIdsRef = useRef(new Set());
  const [billingEditor, setBillingEditor] = useState(null);
  const [billingError, setBillingError] = useState("");
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [expandedSettlementPeriods, setExpandedSettlementPeriods] = useState({});
  const [settlementDrafts, setSettlementDrafts] = useState({});
  const [savingSettlementIds, setSavingSettlementIds] = useState(new Set());
  const [settlementFeedback, setSettlementFeedback] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [isMarkingActivationFeePaid, setIsMarkingActivationFeePaid] = useState(false);
  const [paymentRealizationDraft, setPaymentRealizationDraft] = useState(createInitialPaymentRealizationDraft);
  const [paymentRealizationError, setPaymentRealizationError] = useState("");
  const [paymentRealizationFeedback, setPaymentRealizationFeedback] = useState("");
  const [isPaymentRealizationModalOpen, setIsPaymentRealizationModalOpen] = useState(false);
  const [isSavingPaymentRealization, setIsSavingPaymentRealization] = useState(false);

  useScrollLock(
    deleteModalOpen
    || ispPopupOpen
    || !!billingEditor
    || !!versionEditor
    || !!renewalConfirmData
    || isPaymentRealizationModalOpen,
  );
  const [contractNumberInputs, setContractNumberInputs] = useState({});
  const [isSavingContractNumber, setIsSavingContractNumber] = useState(false);
  const [emptyContractNumberRows, setEmptyContractNumberRows] = useState({});
  const [emptyBakRows, setEmptyBakRows] = useState({});
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeFeedback, setRouteFeedback] = useState("");
  const [routeError, setRouteError] = useState("");
  const [routeChangeNote, setRouteChangeNote] = useState("");
  const [isRouteDrafting, setIsRouteDrafting] = useState(false);
  const [draftRoutePoints, setDraftRoutePoints] = useState([]);
  const [draftRouteStatus, setDraftRouteStatus] = useState("aktif");
  const [selectedEntryPointIds, setSelectedEntryPointIds] = useState([]);
  const isInvoicesTabActive = activeTab === "invoices";
  const isRouteTabActive = activeTab === "jalur";

  // Pagination State for Kelengkapan Berkas
  const [berkasCurrentPage, setBerkasCurrentPage] = useState(1);
  const [berkasItemsPerPage, setBerkasItemsPerPage] = useState(10);
  const berkasPaginationRef = useRef(null);
  const isBerkasScrollingProgrammatically = useRef(false);
  const [isMobileTabMenuOpen, setIsMobileTabMenuOpen] = useState(false);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const emptyStateStorageKey = `tenant-contract-empty-state-${customer.id}`;
  const routeDraftStorageKey = `tenant-route-draft-${customer.id}`;
  const isStandaloneJalurView = routeViewMode !== "embedded";
  const isPlannerJalurView = routeViewMode === "planner";
  const loadDetail = useCallback(async () => {
    setError("");
    try {
      const [detailResult, timelineResult] = await Promise.all([
        tenantDetailData.customers.getById(customer.id),
        tenantDetailData.activityLogs.list({
          entityType: 'customer',
          entityId: customer.id,
          limit: 100
        }).catch(err => {
          console.error("Gagal memuat timeline:", err);
          return [];
        })
      ]);
      setDetail(detailResult ?? null);
      setTimeline(timelineResult ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat memuat tenant.",
      );
    }
  }, [customer.id]);

  useEffect(() => {
    setActiveTab(isStandaloneJalurView || isTeknisi ? "jalur" : initialTab);
    void loadDetail();
  }, [initialTab, isStandaloneJalurView, isTeknisi, loadDetail]);

  useEffect(() => {
    const handleWindowFocus = () => {
      setTimeout(() => {
        isSelectingFileRef.current = false;
      }, 300);
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(emptyStateStorageKey);
      if (!rawValue) {
        setEmptyContractNumberRows({});
        setEmptyBakRows({});
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      setEmptyContractNumberRows(parsedValue?.contractNumberRows ?? {});
      setEmptyBakRows(parsedValue?.bakRows ?? {});
    } catch {
      setEmptyContractNumberRows({});
      setEmptyBakRows({});
    }
  }, [emptyStateStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      emptyStateStorageKey,
      JSON.stringify({
        contractNumberRows: emptyContractNumberRows,
        bakRows: emptyBakRows,
      }),
    );
  }, [emptyBakRows, emptyContractNumberRows, emptyStateStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!canManageRoute) {
      window.localStorage.removeItem(routeDraftStorageKey);
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(routeDraftStorageKey);
      if (!rawValue) {
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      const restoredPoints = normalizeDraftRoutePoints(parsedValue?.points);

      if (restoredPoints.length < 2) {
        window.localStorage.removeItem(routeDraftStorageKey);
        return;
      }

      setDraftRoutePoints(restoredPoints);
      setDraftRouteStatus(
        parsedValue?.flowStatus === "nonaktif" ||
          parsedValue?.flowStatus === "gangguan"
          ? parsedValue.flowStatus
          : "aktif",
      );
      setRouteChangeNote(
        typeof parsedValue?.changeNote === "string" ? parsedValue.changeNote : "",
      );
      setIsRouteDrafting(true);
      setRouteFeedback(
        "Draft jalur FO sebelumnya dipulihkan. Anda bisa lanjut review atau aktifkan jalur baru.",
      );
    } catch {
      window.localStorage.removeItem(routeDraftStorageKey);
    }
  }, [canManageRoute, routeDraftStorageKey]);

  useEffect(() => {
    if (!canManageRoute) {
      setIsRouteDrafting(false);
      setDraftRoutePoints([]);
      setRouteChangeNote("");
    }
  }, [canManageRoute]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!canManageRoute) {
      window.localStorage.removeItem(routeDraftStorageKey);
      return;
    }

    if (!isRouteDrafting || draftRoutePoints.length < 2) {
      window.localStorage.removeItem(routeDraftStorageKey);
      return;
    }

    window.localStorage.setItem(
      routeDraftStorageKey,
      JSON.stringify({
        flowStatus: draftRouteStatus,
        changeNote: routeChangeNote,
        points: draftRoutePoints,
      }),
    );
  }, [
    canManageRoute,
    draftRoutePoints,
    draftRouteStatus,
    isRouteDrafting,
    routeChangeNote,
    routeDraftStorageKey,
  ]);

  const tenantName = detail?.name ?? customer?.name;
  const packageInfo = resolveCustomerPackageInfo(detail ?? customer);
  const contractPeriodInfo = resolveCustomerContractPeriodInfo(detail ?? customer);
  const isps = useMemo(() => (Array.isArray(detail?.isps) ? detail.isps : []), [detail?.isps]);
  const providerDisplayName = getTenantProviderDisplayName(detail ?? customer);
  const availableIspEntryPoints = useMemo(
    () => isps.flatMap((isp) => (
      Array.isArray(isp?.entryPoints)
        ? isp.entryPoints.map((point) => ({ ...point, ispId: point.ispId ?? isp.id, ispName: isp.name }))
        : []
    )).filter((point) => !point.deletedAt && !point.deleted_at),
    [isps],
  );
  const selectedCustomerEntryPoints = useMemo(
    () => Array.isArray(detail?.selectedEntryPoints) ? detail.selectedEntryPoints : [],
    [detail?.selectedEntryPoints],
  );
  const persistedSelectedEntryPointIds = useMemo(
    () => selectedCustomerEntryPoints
      .map((selection) => Number(selection.ispEntryPointId ?? selection.isp_entry_point_id))
      .filter(Number.isFinite),
    [selectedCustomerEntryPoints],
  );
  const contract = Array.isArray(detail?.contracts)
    ? ([...detail.contracts].sort((left, right) => {
      const leftDate = new Date(`${String(left?.endDate ?? left?.end_date ?? left?.startDate ?? left?.start_date ?? "").slice(0, 10)}T00:00:00.000Z`).getTime();
      const rightDate = new Date(`${String(right?.endDate ?? right?.end_date ?? right?.startDate ?? right?.start_date ?? "").slice(0, 10)}T00:00:00.000Z`).getTime();
      return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
    })[0] ?? null)
    : null;
  const versions = useMemo(
    () => (Array.isArray(detail?.contractVersions) ? detail.contractVersions : []),
    [detail?.contractVersions],
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const invoices = useMemo(
    () => (Array.isArray(detail?.invoices) ? detail.invoices : []),
    [detail?.invoices],
  );
  const paymentRealizationRows = useMemo(
    () => (
      Array.isArray(detail?.paymentRealizations)
        ? [...detail.paymentRealizations].sort((left, right) => {
          const leftPeriod = String(left?.periodStartMonth ?? left?.period_start_month ?? left?.createdAt ?? left?.created_at ?? "");
          const rightPeriod = String(right?.periodStartMonth ?? right?.period_start_month ?? right?.createdAt ?? right?.created_at ?? "");
          return rightPeriod.localeCompare(leftPeriod);
        })
        : []
    ),
    [detail?.paymentRealizations],
  );
  const contractsList = useMemo(
    () => (Array.isArray(detail?.contracts) ? detail.contracts : []),
    [detail?.contracts],
  );
  const contractById = useMemo(() => {
    const map = new Map();
    contractsList.forEach((item) => {
      const key = Number(item?.id);
      if (Number.isFinite(key)) {
        map.set(key, item);
      }
    });
    return map;
  }, [contractsList]);
  const contractVersionById = useMemo(() => {
    const map = new Map();
    versions.forEach((item) => {
      const key = Number(item?.id);
      if (Number.isFinite(key)) {
        map.set(key, item);
      }
    });
    return map;
  }, [versions]);

  const activeBillingPeriod = useMemo(() => {
    if (!contract?.id) {
      return null;
    }

    const allContractVersions = versions
      .filter((version) => Number(version?.contractId ?? version?.contract_id) === Number(contract.id))
      .sort((left, right) => {
        const leftVersion = Number(left?.versionNumber ?? left?.version_number ?? 0);
        const rightVersion = Number(right?.versionNumber ?? right?.version_number ?? 0);
        return rightVersion - leftVersion;
      });
    const latestOverallVersion = allContractVersions[0] ?? null;
    const latestOverallStart = String(latestOverallVersion?.startDate ?? latestOverallVersion?.start_date ?? "").slice(0, 10);
    const latestOverallEnd = String(latestOverallVersion?.endDate ?? latestOverallVersion?.end_date ?? "").slice(0, 10);

    if (latestOverallVersion && (!latestOverallStart || !latestOverallEnd)) {
      return null;
    }

    const contractVersions = allContractVersions
      .filter((version) => {
        const startDate = String(version?.startDate ?? version?.start_date ?? "").slice(0, 10);
        const endDate = String(version?.endDate ?? version?.end_date ?? "").slice(0, 10);
        return Boolean(startDate && endDate);
      })
      .sort((left, right) => {
        const leftStart = String(left?.startDate ?? left?.start_date ?? "").slice(0, 10);
        const rightStart = String(right?.startDate ?? right?.start_date ?? "").slice(0, 10);
        const leftVersion = Number(left?.versionNumber ?? left?.version_number ?? 0);
        const rightVersion = Number(right?.versionNumber ?? right?.version_number ?? 0);
        const dateDiff = rightStart.localeCompare(leftStart);
        return dateDiff !== 0 ? dateDiff : rightVersion - leftVersion;
      });

    const currentVersion = contractVersions.find((version) => {
      const startDate = String(version?.startDate ?? version?.start_date ?? "").slice(0, 10);
      const endDate = String(version?.endDate ?? version?.end_date ?? "").slice(0, 10);
      return startDate <= todayIso && endDate >= todayIso;
    }) ?? contractVersions[0] ?? null;

    if (currentVersion) {
      const vStart = String(currentVersion?.startDate ?? currentVersion?.start_date ?? "").slice(0, 10);
      const vEnd = String(currentVersion?.endDate ?? currentVersion?.end_date ?? "").slice(0, 10);
      return {
        contract,
        contractVersions,
        version: currentVersion,
        versionId: currentVersion.id ?? null,
        startDate: vStart,
        endDate: vEnd,
        contractId: contract.id,
        contractNumber: currentVersion?.contractNumber ?? currentVersion?.contract_number ?? contract?.contractNumber ?? null,
        amount: Number(
          currentVersion?.monthlyAmount
          ?? currentVersion?.monthly_amount
          ?? contract?.monthlyAmount
          ?? contract?.monthly_amount
          ?? 0,
        ),
      };
    }

    const startDate = String(contract?.startDate ?? contract?.start_date ?? "").slice(0, 10);
    const endDate = String(contract?.endDate ?? contract?.end_date ?? "").slice(0, 10);
    if (!startDate || !endDate) {
      return null;
    }

    return {
      contract,
      contractVersions: [],
      version: null,
      versionId: null,
      startDate,
      endDate,
      contractId: contract.id,
      contractNumber: contract?.contractNumber ?? contract?.contract_number ?? null,
      amount: Number(contract?.monthlyAmount ?? contract?.monthly_amount ?? 0),
    };
  }, [contract, todayIso, versions]);

  const activeContractRenewalMeta = useMemo(() => {
    const periodEnd = String(
      activeBillingPeriod?.endDate
      ?? contract?.endDate
      ?? contract?.end_date
      ?? "",
    ).slice(0, 10);

    if (!periodEnd) {
      return null;
    }

    const activeVersionId = Number(activeBillingPeriod?.versionId);
    const activeVersion = Number.isFinite(activeVersionId) && activeVersionId > 0
      ? versions.find((version) => Number(version?.id) === activeVersionId) ?? activeBillingPeriod?.version ?? null
      : null;
    const renewalFollowUps = Array.isArray(activeVersion?.renewalFollowUps)
      ? activeVersion.renewalFollowUps
      : [];

    return {
      contractId: activeBillingPeriod?.contractId ?? contract?.id ?? null,
      versionId: Number.isFinite(activeVersionId) && activeVersionId > 0 ? activeVersionId : null,
      periodEnd,
      daysUntilEnd: getDaysUntilIsoDate(periodEnd, todayIso),
      hasRenewalUpload: renewalFollowUps.some((followUp) => isOpenableFileUrl(followUp?.renewalFileUrl)),
      hasResponse: renewalFollowUps.some((followUp) => isOpenableFileUrl(followUp?.responseFileUrl)),
    };
  }, [activeBillingPeriod, contract, todayIso, versions]);

  const resolveInvoiceContractPeriodEnd = useCallback((invoice) => {
    const versionKey = Number(invoice?.contractVersionId ?? invoice?.contract_version_id);
    if (Number.isFinite(versionKey)) {
      const version = contractVersionById.get(versionKey);
      const versionEndDate = version?.endDate ?? version?.end_date ?? null;
      if (versionEndDate) {
        return versionEndDate;
      }
    }

    const contractKey = Number(invoice?.contractId ?? invoice?.contract_id);
    if (Number.isFinite(contractKey)) {
      const contractRow = contractById.get(contractKey);
      const contractEndDate = contractRow?.endDate ?? contractRow?.end_date ?? null;
      if (contractEndDate) {
        return contractEndDate;
      }
    }

    return null;
  }, [contractById, contractVersionById]);
  const shouldArchiveInvoice = useCallback((invoice) => {
    if (String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "").toLowerCase() === "history") {
      return true;
    }

    const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
    const invoiceVersionId = Number(invoice?.contractVersionId ?? invoice?.contract_version_id);
    const invoiceStartDate = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
    const invoiceEndDate = String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10);

    if (activeBillingPeriod && Number.isFinite(invoiceContractId) && invoiceContractId === Number(activeBillingPeriod.contractId)) {
      if (Number(activeBillingPeriod.versionId) > 0) {
        return Number.isFinite(invoiceVersionId)
          ? invoiceVersionId !== Number(activeBillingPeriod.versionId)
          : true;
      }

      if (invoiceStartDate && invoiceEndDate) {
        return invoiceEndDate < activeBillingPeriod.startDate || invoiceStartDate > activeBillingPeriod.endDate;
      }
    }

    const contractPeriodEnd = resolveInvoiceContractPeriodEnd(invoice);
    const contractKey = Number(invoice?.contractId ?? invoice?.contract_id);
    if (Number.isFinite(contractKey)) {
      const contractRow = contractById.get(contractKey);
      const contractEndDate = contractRow?.endDate ?? contractRow?.end_date ?? null;
      const contractStatus = String(contractRow?.status ?? "").toLowerCase();

      if (contractPeriodEnd && contractPeriodEnd < todayIso) {
        return true;
      }

      if (
        contractRow &&
        (
          contractStatus === "expired" ||
          contractStatus === "nonaktif" ||
          (contractEndDate && contractEndDate < todayIso)
        )
      ) {
        return true;
      }
    }

    return false;
  }, [activeBillingPeriod, contractById, resolveInvoiceContractPeriodEnd, todayIso]);
  const getInvoicePeriodKey = useCallback((invoice) => {
    const startDate = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
    const endDate = String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10);
    return startDate && endDate ? `${startDate}-${endDate}` : "";
  }, []);
  const isSchedulePlaceholder = useCallback(
    (invoice) => String(invoice?.id ?? "").startsWith("schedule-"),
    [],
  );
  const isInvoiceInActiveBillingPeriod = useCallback((invoice) => {
    if (!activeBillingPeriod?.contractId) {
      return false;
    }

    const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
    if (!Number.isFinite(invoiceContractId) || invoiceContractId !== Number(activeBillingPeriod.contractId)) {
      return false;
    }

    const invoiceStartDate = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
    const invoiceEndDate = String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10);
    return Boolean(
      invoiceStartDate
      && invoiceEndDate
      && invoiceEndDate >= activeBillingPeriod.startDate
      && invoiceStartDate <= activeBillingPeriod.endDate,
    );
  }, [activeBillingPeriod]);
  const activeInvoices = useMemo(() => {
    if (!activeBillingPeriod?.startDate || !activeBillingPeriod?.endDate) {
      return invoices.filter((invoice) => !shouldArchiveInvoice(invoice));
    }

    const billingCycle = {
      every: Number(contract?.billingEvery ?? 1),
      unit: contract?.billingUnit ?? "bulan",
    };
    const scheduleRows = buildInvoiceScheduleRows(
      activeBillingPeriod.startDate,
      activeBillingPeriod.endDate,
      billingCycle,
    );
    const activeInvoiceMap = new Map();
    invoices
      .filter((invoice) => !shouldArchiveInvoice(invoice) || isInvoiceInActiveBillingPeriod(invoice))
      .forEach((invoice) => {
        const key = getInvoicePeriodKey(invoice);
        if (key) {
          activeInvoiceMap.set(key, invoice);
        }
      });

    return scheduleRows.map((row, index) => {
      const key = `${row.periodStartDate}-${row.periodEndDate}`;
      const matchedInvoice = activeInvoiceMap.get(key);
      if (matchedInvoice) {
        return {
          ...matchedInvoice,
          paymentOrder: index + 1,
        };
      }

      const periodDate = new Date(`${row.periodStartDate}T00:00:00.000Z`);

      let rowAmount = resolveBillingCycleAmount(activeBillingPeriod.amount, billingCycle);
      let rowVersionId = activeBillingPeriod.versionId ?? null;
      let rowContractNumber = activeBillingPeriod.contractNumber ?? null;

      if (activeBillingPeriod.contractVersions && activeBillingPeriod.contractVersions.length > 0) {
        const matchingVersion = activeBillingPeriod.contractVersions.find((v) => {
          const vStart = String(v?.startDate ?? v?.start_date ?? "").slice(0, 10);
          const vEnd = String(v?.endDate ?? v?.end_date ?? "").slice(0, 10);
          return row.periodStartDate >= vStart && row.periodStartDate <= vEnd;
        });

        if (matchingVersion) {
          const versionMonthlyAmount = Number(
            matchingVersion?.monthlyAmount
            ?? matchingVersion?.monthly_amount
            ?? activeBillingPeriod.contract?.monthlyAmount
            ?? activeBillingPeriod.contract?.monthly_amount
            ?? 0
          );
          rowAmount = resolveBillingCycleAmount(versionMonthlyAmount, billingCycle);
          rowVersionId = matchingVersion.id ?? null;
          rowContractNumber = matchingVersion.contractNumber ?? matchingVersion.contract_number ?? activeBillingPeriod.contractNumber ?? null;
        }
      }

      return {
        id: `schedule-${key}`,
        customerId: customer.id,
        contractId: activeBillingPeriod.contractId ?? null,
        contractVersionId: rowVersionId,
        contractNumber: rowContractNumber,
        periodYear: Number.isFinite(periodDate.getTime()) ? periodDate.getUTCFullYear() : null,
        periodMonth: Number.isFinite(periodDate.getTime()) ? periodDate.getUTCMonth() + 1 : null,
        periodStartDate: row.periodStartDate,
        periodEndDate: row.periodEndDate,
        dueDate: resolveInvoiceDueMonthIsoDate(row.periodStartDate),
        amount: rowAmount,
        status: "belum_ditagih",
        scheduleStatus: "active",
        invoiceFollowUps: [],
        paymentOrder: index + 1,
      };
    });
  }, [activeBillingPeriod, contract?.billingEvery, contract?.billingUnit, customer.id, getInvoicePeriodKey, invoices, isInvoiceInActiveBillingPeriod, shouldArchiveInvoice]);

  const historyInvoices = useMemo(() => {
    return invoices.filter((invoice) => shouldArchiveInvoice(invoice) && !isInvoiceInActiveBillingPeriod(invoice));
  }, [invoices, isInvoiceInActiveBillingPeriod, shouldArchiveInvoice]);
  const findReusableActivePeriodHistoryInvoice = useCallback((invoice) => {
    const targetKey = getInvoicePeriodKey(invoice);
    if (!targetKey || !isInvoiceInActiveBillingPeriod(invoice)) {
      return null;
    }

    const candidates = invoices
      .filter((candidate) => {
        const scheduleStatus = String(candidate?.scheduleStatus ?? candidate?.schedule_status ?? "").toLowerCase();
        return scheduleStatus === "history"
          && getInvoicePeriodKey(candidate) === targetKey
          && isInvoiceInActiveBillingPeriod(candidate);
      })
      .sort((left, right) => {
        const leftPaid = isInvoicePaid(left) ? 1 : 0;
        const rightPaid = isInvoicePaid(right) ? 1 : 0;
        if (leftPaid !== rightPaid) {
          return leftPaid - rightPaid;
        }
        return Number(left?.id ?? 0) - Number(right?.id ?? 0);
      });

    return candidates[0] ?? null;
  }, [getInvoicePeriodKey, invoices, isInvoiceInActiveBillingPeriod]);
  const buildActiveInvoicePayload = useCallback((invoice, overrides = {}) => ({
    customerId: invoice.customerId,
    contractId: invoice.contractId,
    contractVersionId: invoice.contractVersionId,
    contractNumber: invoice.contractNumber,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    periodStartDate: invoice.periodStartDate,
    periodEndDate: invoice.periodEndDate,
    scheduleStatus: "active",
    ...overrides,
  }), []);
  const persistActiveInvoice = useCallback(async (invoice, payload) => {
    if (!isSchedulePlaceholder(invoice)) {
      return tenantDetailData.invoices.update(invoice.id, payload);
    }

    const reusableHistoryInvoice = findReusableActivePeriodHistoryInvoice(invoice);
    if (reusableHistoryInvoice) {
      return tenantDetailData.invoices.update(reusableHistoryInvoice.id, {
        ...payload,
        scheduleStatus: "active",
      });
    }

    return tenantDetailData.invoices.create(buildActiveInvoicePayload(invoice, payload));
  }, [buildActiveInvoicePayload, findReusableActivePeriodHistoryInvoice, isSchedulePlaceholder]);
  const todoSummary = detail?.todoSummary ?? {
    priority: [],
    needAction: [],
    info: [],
    counts: {},
  };
  const latestDocuments = Array.isArray(detail?.latestDocuments)
    ? detail.latestDocuments
    : [];
  const allDocuments = latestDocuments; // Now includes all documents uploaded by user

  // Filtered & Sorted Documents for Tenant
  const filteredAndSortedDocs = useMemo(() => {
    return allDocuments
      .filter(doc => {
        if (!documentSearch) return true;
        const searchLower = documentSearch.toLowerCase();
        const label = resolveDocumentTypeLabel(doc?.jenisDokumen).toLowerCase();
        const noRef = (doc?.nomorDokumen || "").toLowerCase();
        return label.includes(searchLower) || noRef.includes(searchLower);
      })
      .sort((a, b) => {
        const dateA = a?.tanggalDokumen ? new Date(a.tanggalDokumen).getTime() : 0;
        const dateB = b?.tanggalDokumen ? new Date(b.tanggalDokumen).getTime() : 0;
        return documentSort === "desc" ? dateB - dateA : dateA - dateB;
      });
  }, [allDocuments, documentSearch, documentSort]);

  useEffect(() => { setTenantDocCurrentPage(1); }, [documentSearch, documentSort, tenantDocItemsPerPage]);

  const tenantDocTotalPages = Math.max(1, Math.ceil(filteredAndSortedDocs.length / tenantDocItemsPerPage));
  const tenantDocStartIndex = (tenantDocCurrentPage - 1) * tenantDocItemsPerPage;
  const paginatedTenantDocs = filteredAndSortedDocs.slice(tenantDocStartIndex, tenantDocStartIndex + tenantDocItemsPerPage);

  const handleTenantDocPageChange = (newPage) => {
    if (newPage >= 1 && newPage <= tenantDocTotalPages) {
      setTenantDocCurrentPage(newPage);
      if (tenantDocPaginationRef.current) {
        isTenantDocScrollingProgrammatically.current = true;
        const container = tenantDocPaginationRef.current;
        const buttonWidth = 28;
        const gap = 6;
        const itemTotalWidth = buttonWidth + gap;
        const scrollPosition = (newPage - 1) * itemTotalWidth;

        container.scrollTo({
          left: scrollPosition - (container.clientWidth / 2) + (buttonWidth / 2),
          behavior: 'smooth'
        });

        setTimeout(() => {
          isTenantDocScrollingProgrammatically.current = false;
        }, 400);
      }
    }
  };

  const handleTenantDocPaginationScroll = () => {
    if (isTenantDocScrollingProgrammatically.current || !tenantDocPaginationRef.current) return;

    const container = tenantDocPaginationRef.current;
    const buttonWidth = 28;
    const gap = 6;
    const itemTotalWidth = buttonWidth + gap;

    const scrollCenter = container.scrollLeft + (container.clientWidth / 2);
    const closestIndex = Math.round((scrollCenter - (buttonWidth / 2)) / itemTotalWidth);

    const newPage = Math.max(1, Math.min(closestIndex + 1, tenantDocTotalPages));
    if (newPage !== tenantDocCurrentPage) {
      setTenantDocCurrentPage(newPage);
    }
  };

  const tenantDocPageNumbers = Array.from({ length: tenantDocTotalPages }, (_, i) => i + 1);
  const contractDocumentByContractId = useMemo(() => {
    const docs = Array.isArray(allDocuments) ? [...allDocuments] : [];
    docs.sort((a, b) =>
      String(b?.tanggalDokumen ?? "").localeCompare(
        String(a?.tanggalDokumen ?? ""),
      ),
    );

    const map = new Map();
    docs.forEach((doc) => {
      if (String(doc?.jenisDokumen ?? "").toLowerCase() !== "kontrak") {
        return;
      }
      const key = Number(doc?.contractId);
      if (!Number.isFinite(key)) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, doc);
      }
    });
    return map;
  }, [allDocuments]);
  const contractDocumentByVersionId = useMemo(() => {
    const docs = Array.isArray(allDocuments) ? [...allDocuments] : [];
    docs.sort((a, b) =>
      String(b?.tanggalDokumen ?? "").localeCompare(
        String(a?.tanggalDokumen ?? ""),
      ),
    );

    const map = new Map();
    docs.forEach((doc) => {
      if (String(doc?.jenisDokumen ?? "").toLowerCase() !== "kontrak") {
        return;
      }
      const key = Number(doc?.contractVersionId ?? doc?.contract_version_id);
      if (!Number.isFinite(key)) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, doc);
      }
    });
    return map;
  }, [allDocuments]);
  const bakDocumentByContractId = useMemo(() => {
    const docs = Array.isArray(allDocuments) ? [...allDocuments] : [];
    docs.sort((a, b) =>
      String(b?.tanggalDokumen ?? "").localeCompare(
        String(a?.tanggalDokumen ?? ""),
      ),
    );

    const map = new Map();
    docs.forEach((doc) => {
      if (String(doc?.jenisDokumen ?? "").toLowerCase() !== "bak") {
        return;
      }
      const key = Number(doc?.contractId);
      if (!Number.isFinite(key)) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, doc);
      }
    });
    return map;
  }, [allDocuments]);
  const bakDocumentByVersionId = useMemo(() => {
    const docs = Array.isArray(allDocuments) ? [...allDocuments] : [];
    docs.sort((a, b) =>
      String(b?.tanggalDokumen ?? "").localeCompare(
        String(a?.tanggalDokumen ?? ""),
      ),
    );

    const map = new Map();
    docs.forEach((doc) => {
      if (String(doc?.jenisDokumen ?? "").toLowerCase() !== "bak") {
        return;
      }
      const key = Number(doc?.contractVersionId ?? doc?.contract_version_id);
      if (!Number.isFinite(key)) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, doc);
      }
    });
    return map;
  }, [allDocuments]);
  const activationFeePaidAt =
    detail?.activationFeePaidAt ?? customer?.activationFeePaidAt ?? null;
  const activationFeeAmount = Number(
    detail?.activationFeeAmount ?? customer?.activationFeeAmount ?? 0,
  );
  const activeRouteStatus = detail?.route?.activeFlowStatus ?? "aktif";
  const routePoints = useMemo(
    () => (Array.isArray(detail?.route?.points) ? detail.route.points : []),
    [detail?.route?.points],
  );
  const routeVersions = Array.isArray(detail?.route?.versions)
    ? detail.route.versions
    : [];
  const routeHistory = useMemo(
    () => (Array.isArray(detail?.route?.history) ? detail.route.history : []),
    [detail?.route?.history],
  );
  const [expandedHistoryIds, setExpandedHistoryIds] = useState([]); // Default closed as requested
  const previewSourcePoints =
    isRouteDrafting && draftRoutePoints.length > 0 ? draftRoutePoints : routePoints;

  const activeAwalPoint =
    routePoints.find((point) => point.pointType === "awal") ?? null;
  const activeTujuanPoint =
    routePoints.find((point) => point.pointType === "tujuan") ?? null;
  const transitPointIds = routePoints
    .filter((point) => point.pointType === "transit")
    .map((point) => point.id);
  const activeRoutePlannerMeta = useMemo(
    () => extractRoutePlannerMetaFromPoints(previewSourcePoints),
    [previewSourcePoints],
  );
  const previewGeometryCoordinates =
    activeRoutePlannerMeta?.geometryCoordinates ?? [];
  const previewRoads = activeRoutePlannerMeta?.roads ?? [];
  // Ruas jalan yang unik & punya nama, mendukung draft maupun aktif
  const displayNamedRoads = useMemo(() => {
    const roads = Array.isArray(activeRoutePlannerMeta?.roads)
      ? activeRoutePlannerMeta.roads
      : [];
    return roads.reduce((acc, road) => {
      if (
        road?.name &&
        road.name.trim() &&
        !acc.some((r) => r.name === road.name)
      ) {
        const lowerName = road.name.toLowerCase();
        if (
          lowerName !== "tanpa nama jalan" &&
          !lowerName.includes("segmen manual")
        ) {
          acc.push(road);
        }
      }
      return acc;
    }, []);
  }, [activeRoutePlannerMeta]);
  const previewRoutePoints = useMemo(
    () =>
      previewSourcePoints
        .map((point, index, list) => {
          const noteText = splitRoutePointNote(point?.note).displayNote;
          const coordinateMatch = noteText.match(
            /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
          );
          const latSource =
            point?.lat ?? point?.latitude ?? coordinateMatch?.[1];
          const lngSource =
            point?.lng ?? point?.longitude ?? coordinateMatch?.[2];
          const lat = Number(latSource);
          const lng = Number(lngSource);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }

          return {
            id: point.id ?? `preview-${index}`,
            lat,
            lng,
            label: point.label ?? point.pathName ?? "",
            pointType: point.pointType,
            role:
              point.pointType === "awal"
                ? "provider"
                : point.pointType === "tujuan"
                  ? "customer"
                  : index === list.length - 1
                    ? "customer"
                    : "waypoint",
          };
        })
        .filter(Boolean),
    [previewSourcePoints],
  );
  useEffect(() => {
    setContractNumberInputs({});
  }, [contract?.id]);

  useEffect(() => {
    setSelectedEntryPointIds(persistedSelectedEntryPointIds);
  }, [persistedSelectedEntryPointIds]);

  const visibleTenantEntryPointIds = useMemo(() => {
    const explicitSelectedIds = (Array.isArray(selectedEntryPointIds) ? selectedEntryPointIds : [])
      .map(Number)
      .filter(Number.isFinite);

    if (explicitSelectedIds.length > 0) {
      return explicitSelectedIds;
    }

    return availableIspEntryPoints.map((point) => Number(point.id)).filter(Number.isFinite);
  }, [availableIspEntryPoints, selectedEntryPointIds]);

  const primaryProviderIconUrl = isps[0]?.logoUrl || isps[0]?.logo_url || "";

  const sortedInvoices = useMemo(() => {
    const nextItems = [...activeInvoices];
    nextItems.sort((left, right) => {
      const leftKey = `${left.periodYear}-${String(left.periodMonth).padStart(2, "0")}`;
      const rightKey = `${right.periodYear}-${String(right.periodMonth).padStart(2, "0")}`;

      if (leftKey === rightKey) {
        return Number(left.id ?? 0) - Number(right.id ?? 0);
      }

      return leftKey.localeCompare(rightKey);
    });
    return nextItems;
  }, [activeInvoices]);

  const sortedHistoryInvoices = useMemo(() => {
    const nextItems = [...historyInvoices];
    nextItems.sort((left, right) => {
      const leftKey = `${left.periodYear}-${String(left.periodMonth).padStart(2, "0")}`;
      const rightKey = `${right.periodYear}-${String(right.periodMonth).padStart(2, "0")}`;

      if (leftKey === rightKey) {
        return Number(left.id ?? 0) - Number(right.id ?? 0);
      }

      return leftKey.localeCompare(rightKey);
    });
    return nextItems;
  }, [historyInvoices]);

  const invoiceRows = useMemo(() => {
    const baseRows = sortedInvoices.map((invoice, index) => ({
      ...invoice,
      paymentOrder: index + 1,
    }));

    return baseRows.map((invoice) => {
      const workflowMeta = getInvoiceWorkflowMeta(invoice, baseRows, todayIso);
      return {
        ...invoice,
        workflowMeta,
        statusMeta: resolveInvoiceStatusMeta({ ...invoice, workflowMeta }),
      };
    });
  }, [sortedInvoices, todayIso]);

  const historyInvoiceRows = useMemo(
    () => {
      if (!isInvoicesTabActive) {
        return [];
      }

      return sortedHistoryInvoices.map((invoice, index) => ({
        ...invoice,
        paymentOrder: index + 1,
        statusMeta: resolveInvoiceStatusMeta(invoice),
      }));
    },
    [isInvoicesTabActive, sortedHistoryInvoices],
  );

  const displayInvoiceRows = useMemo(() => {
    if (!isInvoicesTabActive) {
      return [];
    }

    const items = [...invoiceRows];
    items.sort((left, right) => {
      if (invoicePaymentOrderSort === "desc") {
        return right.paymentOrder - left.paymentOrder;
      }

      return left.paymentOrder - right.paymentOrder;
    });
    return items;
  }, [invoiceRows, invoicePaymentOrderSort, isInvoicesTabActive]);

  const displayHistoryInvoiceRows = useMemo(() => {
    const items = [...historyInvoiceRows];
    items.sort((left, right) => right.paymentOrder - left.paymentOrder);
    return items;
  }, [historyInvoiceRows]);

  const settlementPeriodGroups = useMemo(() => {
    if (!isInvoicesTabActive) {
      return [];
    }

    const groups = new Map();

    displayHistoryInvoiceRows.forEach((invoice) => {
      const versionId = Number(invoice?.contractVersionId ?? invoice?.contract_version_id);
      const contractId = Number(invoice?.contractId ?? invoice?.contract_id);
      const version = Number.isFinite(versionId) ? contractVersionById.get(versionId) : null;
      const contractRow = Number.isFinite(contractId) ? contractById.get(contractId) : null;
      const periodStart = String(
        version?.startDate
        ?? version?.start_date
        ?? contractRow?.startDate
        ?? contractRow?.start_date
        ?? invoice?.periodStartDate
        ?? invoice?.period_start_date
        ?? "",
      ).slice(0, 10);
      const periodEnd = String(
        version?.endDate
        ?? version?.end_date
        ?? contractRow?.endDate
        ?? contractRow?.end_date
        ?? invoice?.periodEndDate
        ?? invoice?.period_end_date
        ?? "",
      ).slice(0, 10);
      const key = version?.id
        ? `version-${version.id}`
        : Number.isFinite(contractId) && periodStart && periodEnd
          ? `contract-${contractId}-${periodStart}-${periodEnd}`
          : `invoice-${invoice.id}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          contractId: Number.isFinite(contractId) ? contractId : null,
          versionId: version?.id ?? null,
          contractNumber:
            version?.contractNumber
            ?? version?.contract_number
            ?? contractRow?.contractNumber
            ?? contractRow?.contract_number
            ?? invoice?.contractNumber
            ?? invoice?.contract_number
            ?? null,
          periodStart,
          periodEnd,
          rows: [],
        });
      }

      groups.get(key).rows.push(invoice);
    });

    return Array.from(groups.values())
      .map((group) => {
        const rows = [...group.rows].sort((left, right) => {
          const leftDate = String(left?.periodStartDate ?? left?.period_start_date ?? "").slice(0, 10);
          const rightDate = String(right?.periodStartDate ?? right?.period_start_date ?? "").slice(0, 10);
          return leftDate.localeCompare(rightDate);
        });
        const paidCount = rows.filter(isInvoicePaid).length;
        const totalAmount = rows.reduce((sum, invoice) => sum + Number(invoice?.amount ?? 0), 0);
        return {
          ...group,
          rows,
          paidCount,
          totalAmount,
        };
      })
      .sort((left, right) => String(right.periodStart ?? "").localeCompare(String(left.periodStart ?? "")));
  }, [contractById, contractVersionById, displayHistoryInvoiceRows, isInvoicesTabActive]);

  const toggleSettlementPeriod = (periodKey) => {
    setExpandedSettlementPeriods((previous) => ({
      ...previous,
      [periodKey]: !previous[periodKey],
    }));
  };

  useEffect(() => {
    if (!isInvoicesTabActive) {
      return;
    }

    setSettlementDrafts((previousDrafts) => {
      const nextDrafts = {};
      historyInvoiceRows.forEach((invoice) => {
        const previousDraft = previousDrafts[invoice.id] ?? {};
        const normalizedAmount = Number.isFinite(Number(invoice.amount))
          ? formatRupiahInput(Math.max(0, Math.round(Number(invoice.amount))))
          : "";
        nextDrafts[invoice.id] = {
          invoiceNumber: previousDraft.invoiceNumber ?? String(invoice.invoiceNumber ?? ""),
          amount: previousDraft.amount ?? normalizedAmount,
          status: previousDraft.status ?? String(invoice.status ?? "belum_ditagih"),
          paidAt: previousDraft.paidAt ?? String(invoice.paidAt ?? "").slice(0, 10),
        };
      });
      return nextDrafts;
    });
  }, [historyInvoiceRows, isInvoicesTabActive]);

  const handleSaveSettlementRow = async (invoice) => {
    const draft = settlementDrafts[invoice.id];
    if (!draft) return;
    if (savingSettlementIds.has(invoice.id)) return;

    setSavingSettlementIds((prev) => new Set([...prev, invoice.id]));
    setSettlementError("");
    setSettlementFeedback("");
    try {
      const amount = parseRupiahInput(draft.amount);
      const selectedStatus = INVOICE_STATUS_OPTIONS.some((opt) => opt.value === draft.status)
        ? draft.status
        : "belum_ditagih";
      const paidAt = selectedStatus === "lunas"
        ? (draft.paidAt && draft.paidAt.trim() ? draft.paidAt.trim() : (invoice.paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10)))
        : null;

      await tenantDetailData.invoices.update(invoice.id, {
        invoice_number: String(draft.invoiceNumber ?? "").trim() || null,
        amount,
        status: selectedStatus,
        paid_at: paidAt,
      });
      setSettlementFeedback(`Invoice #${invoice.id} berhasil disimpan.`);
      setSettlementDrafts((prev) => {
        const next = { ...prev };
        delete next[invoice.id];
        return next;
      });
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setSettlementError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menyimpan data settlement.",
      );
    } finally {
      setSavingSettlementIds((prev) => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!isInvoicesTabActive) {
      return;
    }

    setInvoiceDrafts((previousDrafts) => {
      const nextDrafts = {};

      invoiceRows.forEach((invoice) => {
        const previousDraft = previousDrafts[invoice.id] ?? {};
        const normalizedAmount = Number.isFinite(Number(invoice.amount))
          ? formatRupiahInput(Math.max(0, Math.round(Number(invoice.amount))))
          : "";
        const previousFollowUpDrafts = previousDraft.followUps ?? {};
        const nextFollowUpDrafts = {};

        getInvoiceFollowUps(invoice).forEach((followUp) => {
          const draftKey = String(followUp.id);
          nextFollowUpDrafts[draftKey] = {
            invoiceNumber: String(
              previousFollowUpDrafts[draftKey]?.invoiceNumber ??
              followUp?.invoiceNumber ??
              "",
            ),
          };
        });

        nextFollowUpDrafts.initial = {
          invoiceNumber: String(
            previousFollowUpDrafts.initial?.invoiceNumber ??
            invoice?.invoiceNumber ??
            "",
          ),
        };

        nextDrafts[invoice.id] = {
          invoiceNumber: previousDraft.invoiceNumber ?? String(invoice.invoiceNumber ?? ""),
          dueDate: previousDraft.dueDate ?? String(invoice.dueDate ?? ""),
          amount: previousDraft.amount ?? normalizedAmount,
          status: previousDraft.status ?? String(invoice.status ?? "belum_ditagih"),
          followUps: nextFollowUpDrafts,
        };
      });

      return nextDrafts;
    });
  }, [invoiceRows, isInvoicesTabActive]);

  const workflowInvoiceRows = useMemo(
    () =>
      invoiceRows.map((invoice) => {
        const draft = invoiceDrafts[invoice.id] ?? {};
        const dueDateValue =
          typeof draft.dueDate === "string"
            ? draft.dueDate.trim().slice(0, 10)
            : "";
        const amountSource =
          draft.amount !== undefined
            ? parseRupiahInput(draft.amount)
            : Number(invoice.amount ?? 0);
        const amountValue = Number.isFinite(amountSource) ? amountSource : 0;
        const activeReminderSplits = getInvoiceFollowUps(invoice).filter(
          (followUp) =>
            followUp?.status !== "completed" &&
            !isOpenableFileUrl(followUp?.invoiceFileUrl),
        );

        const rowWithDraft = {
          ...invoice,
          workflowDueDate: dueDateValue,
          workflowAmount: amountValue,
          activeReminderSplits,
        };

        const workflowMeta = getInvoiceWorkflowMeta(rowWithDraft, invoiceRows);

        return {
          ...rowWithDraft,
          workflowMeta,
          statusMeta: resolveInvoiceStatusMeta({ ...rowWithDraft, workflowMeta }),
        };
      }),
    [invoiceRows, invoiceDrafts],
  );

  const paidInvoiceCount = invoiceRows.filter(
    (invoice) => invoice.statusMeta.key === "paid",
  ).length;
  const unpaidInvoiceCount = workflowInvoiceRows.filter((invoice) =>
    ["waiting_payment_confirmation", "warning_required_h7", "warning_required_h3", "warning_unpaid"].includes(invoice.statusMeta.key),
  ).length;
  const pendingInvoiceCount = invoiceRows.filter(
    (invoice) => invoice.statusMeta.key === "pending",
  ).length;
  const setupIncompleteCount = workflowInvoiceRows.filter((invoice) => {
    const dueDate =
      typeof invoice?.workflowDueDate === "string"
        ? invoice.workflowDueDate
        : "";
    const amountValue = Number(invoice?.workflowAmount ?? 0);
    return !dueDate || amountValue <= 0;
  }).length;

  const nextActionInvoice =
    workflowInvoiceRows.find((invoice) =>
      ["pending_setup", "warning_required_h7", "warning_required_h3", "warning_unpaid"].includes(invoice.workflowMeta?.key),
    ) ?? null;

  const nextActionMeta = (() => {
    if (!nextActionInvoice) {
      return null;
    }

    const dueDate =
      typeof nextActionInvoice?.workflowDueDate === "string"
        ? nextActionInvoice.workflowDueDate
        : "";

    if (nextActionInvoice.workflowMeta?.key === "pending_setup") {
      return {
        type: "invoice_setup_incomplete",
        title: `Lengkapi pembayaran ke-${nextActionInvoice.paymentOrder}`,
        message: nextActionInvoice.workflowMeta.setupWarnings.map((warning) => warning.message).join(" "),
        dueDate,
      };
    }

    if (nextActionInvoice.workflowMeta?.key === "warning_required_h3") {
      return {
        type: "upload_h_minus_3",
        title: `Peringatan H-3 pembayaran ke-${nextActionInvoice.paymentOrder}`,
        message: "Pembayaran belum dikonfirmasi. Upload invoice peringatan kedua melalui split upload.",
        dueDate,
      };
    }

    if (nextActionInvoice.workflowMeta?.key === "warning_unpaid") {
      return {
        type: "warning_unpaid",
        title: `Warning Belum Bayar pembayaran ke-${nextActionInvoice.paymentOrder}`,
        message: "Peringatan maksimal sudah tercapai dan pembayaran belum dikonfirmasi.",
        dueDate,
      };
    }

    return {
      type: "upload_h_minus_7",
      title: `Reminder bulan jatuh tempo pembayaran ke-${nextActionInvoice.paymentOrder}`,
      message:
        "Memasuki reminder bulan jatuh tempo. Isi nomor invoice lalu upload invoice peringatan pertama untuk pembayaran ini.",
      dueDate,
    };
  })();

  const primaryContractRowMarkerId =
    versions.length > 0
      ? `version-${versions[0]?.id ?? 0}`
      : contract
        ? `contract-${contract.id}`
        : null;
  const activeContractId = Number(contract?.id);
  const activeContractDocument = Number.isFinite(activeContractId)
    ? contractDocumentByContractId.get(activeContractId)
    : null;
  const activeBakDocument = Number.isFinite(activeContractId)
    ? bakDocumentByContractId.get(activeContractId)
    : null;
  const activeContractFileUrl = String(activeContractDocument?.fileUrl ?? "");
  const hasActiveContractFile = isOpenableFileUrl(activeContractFileUrl);
  const hasActiveBakFile = Boolean(activeBakDocument);
  const activeContractRowId = contract ? `contract-${contract.id}` : null;
  const hasContractNumberValue = Boolean(
    String(contract?.contractNumber ?? "").trim(),
  );
  const isContractNumberExplicitlyEmpty = Object.values(
    emptyContractNumberRows,
  ).some(Boolean);
  const isBakExplicitlyEmpty = activeContractRowId
    ? Boolean(emptyBakRows[activeContractRowId])
    : false;

  const backendPriorityTodos = useMemo(() => (
    Array.isArray(todoSummary.priority)
      ? todoSummary.priority.filter(
        (item) => item.code !== "required_document_missing",
      )
      : []
  ), [todoSummary.priority]);
  const backendNeedActionTodos = useMemo(() => (
    Array.isArray(todoSummary.needAction)
      ? todoSummary.needAction.filter(
        (item) =>
          ![
            "required_document_missing",
            "invoice_not_uploaded",
            "payment_pending",
            "invoice_amount_missing",
          ].includes(item.code),
      )
      : []
  ), [todoSummary.needAction]);

  const derivedPriorityTodos = useMemo(() => [], []);

  const derivedNeedActionTodos = useMemo(() => {
    const todos = [];
    if (setupIncompleteCount > 0) {
      todos.push({
        id: "derived-setup-incomplete",
        code: "invoice_setup_incomplete",
        title: "Lengkapi set date dan jumlah dibayar",
        message: `Set date (terakhir pembayaran) dan jumlah dibayar belum diisi pada ${setupIncompleteCount} pembayaran.`,
        dueDate: null,
      });
    }

    if (!activationFeePaidAt) {
      todos.push({
        id: `derived-activation-unpaid-${customer.id}`,
        code: "activation_fee_unpaid_local",
        title: "Biaya aktivasi belum dibayar",
        message: `Biaya aktivasi masih outstanding sebesar ${formatCurrency(activationFeeAmount)}.`,
        dueDate: null,
      });
    }

    if (nextActionMeta) {
      todos.push({
        id: `derived-next-action-${nextActionInvoice?.id ?? "none"}`,
        code: "invoice_next_action",
        title: nextActionMeta.title,
        message: nextActionMeta.message,
        dueDate: nextActionMeta.dueDate,
      });
    }

    if (contract && !hasContractNumberValue && !isContractNumberExplicitlyEmpty) {
      todos.push({
        id: `derived-contract-number-missing-${customer.id}`,
        code: "contract_number_missing_local",
        title: "Nomor kontrak belum diisi",
        message:
          "Isi nomor kontrak lokasi atau tandai memang kosong jika datanya memang tidak ada.",
        dueDate: null,
      });
    }

    if (contract && !hasActiveContractFile) {
      todos.push({
        id: `derived-contract-file-missing-${customer.id}`,
        code: "contract_file_missing_local",
        title: "Berkas kontrak belum diunggah",
        message: "Upload berkas kontrak agar arsip legal lokasi lengkap.",
        dueDate: null,
      });
    }

    if (contract && !hasActiveBakFile && !isBakExplicitlyEmpty) {
      todos.push({
        id: `derived-bak-missing-${customer.id}`,
        code: "bak_missing_local",
        title: "BAK belum tersedia",
        message: "Upload Berita Acara Koneksi/BAK atau tandai tidak perlu jika tidak diwajibkan.",
        dueDate: null,
      });
    }

    // Contract renewal warnings (H-3, H-2, H-1 months)
    if (activeContractRenewalMeta?.periodEnd && Number.isFinite(activeContractRenewalMeta.daysUntilEnd)) {
      const {
        daysUntilEnd,
        hasRenewalUpload,
        hasResponse,
        periodEnd,
        versionId,
      } = activeContractRenewalMeta;
      const renewalIdSuffix = versionId ? `version-${versionId}` : `contract-${activeContractRenewalMeta.contractId ?? customer.id}`;

      // H-3 months warning (90 days before end)
      if (daysUntilEnd <= 90 && daysUntilEnd > 60 && !hasRenewalUpload) {
        todos.push({
          id: `derived-renewal-h3-${customer.id}-${renewalIdSuffix}`,
          code: "renewal_h3_warning",
          title: "Kontrak akan berakhir dalam 3 bulan",
          message: `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-3 bulan). Segera buat dan upload surat perpanjangan kontrak.`,
          dueDate: periodEnd,
        });
      }

      // H-2 months warning (60 days before end)
      if (daysUntilEnd <= 60 && daysUntilEnd > 30 && hasRenewalUpload && !hasResponse) {
        todos.push({
          id: `derived-renewal-h2-${customer.id}-${renewalIdSuffix}`,
          code: "renewal_h2_warning",
          title: "Kontrak akan berakhir dalam 2 bulan",
          message: `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-2 bulan). Surat perpanjangan sudah diupload. Menunggu tanggapan dari lokasi.`,
          dueDate: periodEnd,
        });
      }

      // H-1 month warning (30 days before end)
      if (daysUntilEnd <= 30 && daysUntilEnd > 0 && !hasResponse) {
        todos.push({
          id: `derived-renewal-h1-${customer.id}-${renewalIdSuffix}`,
          code: "renewal_h1_warning",
          title: "Kontrak akan berakhir dalam 1 bulan",
          message: `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-1 bulan). ${hasRenewalUpload ? 'Belum ada tanggapan perpanjangan. Segera follow up dengan lokasi.' : 'Segera upload surat perpanjangan kontrak!'}`,
          dueDate: periodEnd,
        });
      }
    }

    return todos;
  }, [
    activationFeeAmount,
    activationFeePaidAt,
    activeContractRenewalMeta,
    contract,
    customer.id,
    hasActiveBakFile,
    hasActiveContractFile,
    hasContractNumberValue,
    isBakExplicitlyEmpty,
    isContractNumberExplicitlyEmpty,
    nextActionInvoice?.id,
    nextActionMeta,
    setupIncompleteCount,
  ]);

  const displayPriorityTodos = useMemo(() => [
    ...backendPriorityTodos,
    ...derivedPriorityTodos,
  ], [backendPriorityTodos, derivedPriorityTodos]);
  const displayNeedActionTodos = useMemo(() => [
    ...backendNeedActionTodos,
    ...derivedNeedActionTodos,
  ], [backendNeedActionTodos, derivedNeedActionTodos]);
  const totalActionItems = getCustomerDisplayActionSummary(detail ?? customer, {
    todayIso,
    emptyContractNumberRows,
    emptyBakRows,
  }).total;

  const allBerkasTodos = useMemo(() => [
    ...displayPriorityTodos,
    ...displayNeedActionTodos,
  ], [displayPriorityTodos, displayNeedActionTodos]);

  const berkasTotalPages = Math.max(1, Math.ceil(allBerkasTodos.length / berkasItemsPerPage));
  const berkasStartIndex = (berkasCurrentPage - 1) * berkasItemsPerPage;
  const paginatedBerkasTodos = allBerkasTodos.slice(berkasStartIndex, berkasStartIndex + berkasItemsPerPage);

  const paginatedPriorityTodos = paginatedBerkasTodos.filter(item => displayPriorityTodos.includes(item));
  const paginatedNeedActionTodos = paginatedBerkasTodos.filter(item => displayNeedActionTodos.includes(item));

  const handleBerkasPaginationScroll = useCallback((e) => {
    if (isBerkasScrollingProgrammatically.current) return;
    const scrollLeft = e.target.scrollLeft;
    const page = Math.round(scrollLeft / 34) + 1;
    if (page >= 1 && page <= berkasTotalPages && page !== berkasCurrentPage) {
      setBerkasCurrentPage(page);
    }
  }, [berkasCurrentPage, berkasTotalPages]);

  const handleBerkasPageChange = useCallback((page) => {
    isBerkasScrollingProgrammatically.current = true;
    setBerkasCurrentPage(page);
    if (berkasPaginationRef.current) {
      berkasPaginationRef.current.scrollTo({ left: (page - 1) * 34, behavior: 'smooth' });
    }
    setTimeout(() => { isBerkasScrollingProgrammatically.current = false; }, 400);
  }, []);

  const berkasPageNumbers = useMemo(() => {
    const pages = [];
    for (let i = 1; i <= berkasTotalPages; i++) {
      pages.push(i);
    }
    return pages;
  }, [berkasTotalPages]);

  const displayTimeline = useMemo(() => {
    const nonInvoiceTimeline = timeline.filter(
      (event) => event?.type !== "invoice",
    );
    const synthesizedTimeline = [];
    const seenTimelineKeys = new Set();
    const pushTimelineEvent = (event) => {
      const key = String(event?.id ?? `${event?.type}-${event?.date}-${event?.title}`);
      if (seenTimelineKeys.has(key)) {
        return;
      }
      seenTimelineKeys.add(key);
      synthesizedTimeline.push(event);
    };

    if (pendingInvoiceCount > 0) {
      pushTimelineEvent({
        id: `invoice-pending-summary-${customer.id}`,
        customerId: customer.id,
        date: todayIso,
        type: "todo",
        title: `Invoice belum ditagih (${pendingInvoiceCount})`,
        description: `${pendingInvoiceCount} invoice belum diunggah dan digabung dalam satu ringkasan.`,
      });
    }

    if (nextActionMeta) {
      pushTimelineEvent({
        id: `invoice-hminus7-${nextActionInvoice?.id ?? "none"}`,
        customerId: customer.id,
        date: todayIso,
        type: "todo",
        title: nextActionMeta.title,
        description: nextActionMeta.message,
      });
    }

    allDocuments.forEach((doc) => {
      const documentDate = doc?.createdAt ?? doc?.created_at ?? doc?.tanggalDokumen ?? doc?.tanggal_dokumen ?? todayIso;
      pushTimelineEvent({
        id: `document-${doc?.id ?? documentDate}`,
        customerId: customer.id,
        date: documentDate,
        type: "document",
        title: `Dokumen ${resolveDocumentTypeLabel(doc?.jenisDokumen)} diunggah`,
        description: `${doc?.nomorDokumen ? `No. ${doc.nomorDokumen}. ` : ""}${isOpenableFileUrl(doc?.fileUrl) ? "Berkas tersedia di tab Dokumen." : "Metadata dokumen tersimpan."}`,
      });
    });

    versions.forEach((version) => {
      const versionNumber = version?.versionNumber ?? version?.version_number ?? "-";
      pushTimelineEvent({
        id: `contract-version-${version?.id ?? versionNumber}`,
        customerId: customer.id,
        date: version?.createdAt ?? version?.created_at ?? version?.startDate ?? version?.start_date ?? todayIso,
        type: "contract_version",
        title: `Versi kontrak #${versionNumber} tercatat`,
        description: `Periode ${formatDate(version?.startDate ?? version?.start_date)} - ${formatDate(version?.endDate ?? version?.end_date)}.`,
      });

      (Array.isArray(version?.renewalFollowUps) ? version.renewalFollowUps : []).forEach((followUp) => {
        const followUpDate = followUp?.updatedAt ?? followUp?.updated_at ?? followUp?.createdAt ?? followUp?.created_at ?? todayIso;
        if (isOpenableFileUrl(followUp?.renewalFileUrl)) {
          pushTimelineEvent({
            id: `renewal-upload-${followUp?.id ?? followUpDate}`,
            customerId: customer.id,
            date: followUpDate,
            type: "contract",
            title: "Surat perpanjangan diunggah",
            description: followUp?.renewalFileName ? `File: ${followUp.renewalFileName}.` : "Berkas perpanjangan kontrak tersedia.",
          });
        }
        if (isOpenableFileUrl(followUp?.responseFileUrl)) {
          pushTimelineEvent({
            id: `renewal-response-${followUp?.id ?? followUpDate}`,
            customerId: customer.id,
            date: followUpDate,
            type: "contract",
            title: "Tanggapan perpanjangan diterima",
            description: `${followUp?.responseStatus ? `Keputusan: ${toTitleCase(followUp.responseStatus)}. ` : ""}${followUp?.responseFileName ? `File: ${followUp.responseFileName}.` : "Berkas tanggapan tersedia."}`,
          });
        }
      });
    });

    (Array.isArray(detail?.route?.history) ? detail.route.history : []).forEach((routeEvent) => {
      pushTimelineEvent({
        id: `route-history-${routeEvent?.id ?? routeEvent?.createdAt ?? routeEvent?.created_at}`,
        customerId: customer.id,
        date: routeEvent?.createdAt ?? routeEvent?.created_at ?? todayIso,
        type: "contract",
        title: ROUTE_OPERATION_LABEL_MAP[routeEvent?.operation] ?? "Aktivitas jalur FO",
        description: routeEvent?.note ?? routeEvent?.changeNote ?? "Riwayat jalur FO diperbarui.",
      });
    });

    const toTimestamp = (value) => {
      const normalized =
        typeof value === "string" && value.trim().length > 0
          ? value.slice(0, 10)
          : todayIso;
      const timestamp = new Date(`${normalized}T00:00:00.000Z`).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const sortedNonInvoiceTimeline = [...nonInvoiceTimeline].sort(
      (left, right) => toTimestamp(right.date) - toTimestamp(left.date),
    );

    return [...synthesizedTimeline, ...sortedNonInvoiceTimeline].sort(
      (left, right) => toTimestamp(right.date) - toTimestamp(left.date),
    );
  }, [
    allDocuments,
    customer.id,
    detail?.route?.history,
    nextActionMeta,
    nextActionInvoice?.id,
    pendingInvoiceCount,
    timeline,
    todayIso,
    versions,
  ]);

  const billingEvery = Number(contract?.billingEvery ?? 1);
  const billingUnitLabel = toTitleCase(contract?.billingUnit ?? "bulan");
  const getFirstDayOfNextMonth = (dateValue) => {
    if (!dateValue) return "";
    const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  };

  const getUpgradeEffectiveStartPreview = (reqDateStr) => {
    if (!reqDateStr) return "";
    const sd = contract?.startDate ?? contract?.start_date;
    const startDay = sd ? Number(String(sd).slice(8, 10)) : 1;
    if (startDay <= 15) {
      const d = new Date(`${String(reqDateStr).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return "";
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    }
    return getFirstDayOfNextMonth(reqDateStr);
  };

  const getRowPeriodTime = (row) => {
    const rawDate = row?.periodEnd ?? row?.periodStart ?? "";
    const timestamp = new Date(`${String(rawDate).slice(0, 10)}T00:00:00.000Z`).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const getContractPackageDisplay = (coreType) => {
    const normalizedCoreType = String(coreType ?? "").toLowerCase();
    const isSharingPackage = normalizedCoreType.includes("shar") || normalizedCoreType === "shared";

    return isSharingPackage ? "SHARING CORE" : "CORE";
  };
  const resolveContractSharedRatio = (contractRow) => (
    contractRow?.sharingRatio
    ?? contractRow?.sharing_ratio
    ?? null
  );
  const resolveContractPackageType = (contractRow) => (
    resolveContractSharedRatio(contractRow)
      ? "sharing_core"
      : contractRow?.coreType
      ?? contractRow?.core_type
      ?? "core"
  );
  const resolveContractActualValue = (contractRow) => {
    const sharedRatio = resolveContractSharedRatio(contractRow);
    const normalizedCoreType = String(resolveContractPackageType(contractRow)).toLowerCase();
    const isSharingPackage = normalizedCoreType.includes("shar") || normalizedCoreType === "shared";

    if (isSharingPackage) {
      return formatPackageRatio(sharedRatio) ?? "-";
    }

    return contractRow?.coreTotal
      ?? contractRow?.core_total
      ?? "-";
  };
  const resolveContractMonthlyAmount = useCallback((contractRow, version = null) => {
    const directMonthlyAmount = Number(
      version?.monthlyAmount
      ?? version?.monthly_amount
      ?? contractRow?.monthlyAmount
      ?? contractRow?.monthly_amount
      ?? 0,
    );
    if (Number.isFinite(directMonthlyAmount) && directMonthlyAmount > 0) {
      return directMonthlyAmount;
    }

    const yearlyAmount = Number(
      version?.yearlyAmount
      ?? version?.yearly_amount
      ?? contractRow?.yearlyAmount
      ?? contractRow?.yearly_amount
      ?? 0,
    );
    if (Number.isFinite(yearlyAmount) && yearlyAmount > 0) {
      return Math.round(yearlyAmount / 12);
    }

    const periodStart = String(version?.startDate ?? version?.start_date ?? contractRow?.startDate ?? contractRow?.start_date ?? "").slice(0, 10);
    const periodEnd = String(version?.endDate ?? version?.end_date ?? contractRow?.endDate ?? contractRow?.end_date ?? "").slice(0, 10);
    const targetVersionId = Number(version?.id ?? NaN);
    const targetContractId = Number(contractRow?.id ?? NaN);
    const invoiceMatch = invoices.find((invoice) => {
      const invoiceVersionId = Number(invoice?.contractVersionId ?? invoice?.contract_version_id ?? NaN);
      const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id ?? NaN);
      const invoicePeriodStart = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
      const amount = Number(invoice?.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return false;
      }

      if (Number.isFinite(targetVersionId) && invoiceVersionId === targetVersionId) {
        return true;
      }

      if (!Number.isFinite(targetVersionId) && Number.isFinite(targetContractId) && invoiceContractId === targetContractId) {
        if (!periodStart || !periodEnd) {
          return true;
        }
        return invoicePeriodStart >= periodStart && invoicePeriodStart <= periodEnd;
      }

      return false;
    });

    const inferredAmount = Number(invoiceMatch?.amount ?? 0);
    return Number.isFinite(inferredAmount) && inferredAmount > 0 ? inferredAmount : null;
  }, [invoices]);
  const contractsForTable = Array.isArray(detail?.contracts)
    ? [...detail.contracts].sort((left, right) => (
      getRowPeriodTime({ periodEnd: left?.endDate ?? left?.end_date, periodStart: left?.startDate ?? left?.start_date })
      - getRowPeriodTime({ periodEnd: right?.endDate ?? right?.end_date, periodStart: right?.startDate ?? right?.start_date })
    ))
    : [];
  const getContractRowNote = (periodStart, periodEnd) => {
    if (!periodStart || !periodEnd) {
      return "";
    }
    if (periodStart && periodEnd && periodStart <= todayIso && periodEnd >= todayIso) {
      return "Kontrak Beroperasi";
    }
    if (periodStart && periodStart > todayIso) {
      return "Akan Berjalan";
    }
    return "Riwayat Perubahan";
  };
  const buildContractTableRow = ({ contractRow, version = null, id, number }) => {
    const periodStart = version?.startDate ?? version?.start_date ?? contractRow.startDate ?? contractRow.start_date ?? "";
    const periodEnd = version?.endDate ?? version?.end_date ?? contractRow.endDate ?? contractRow.end_date ?? "";
    const rowSource = version
      ? {
        ...contractRow,
        coreType: version.coreType ?? version.core_type ?? contractRow.coreType ?? contractRow.core_type,
        coreTotal: version.coreTotal ?? version.core_total ?? contractRow.coreTotal ?? contractRow.core_total,
        sharingRatio: version.sharedCoreRatio ?? version.shared_core_ratio ?? contractRow.sharingRatio ?? contractRow.sharing_ratio,
      }
      : contractRow;

    const note = getContractRowNote(periodStart, periodEnd);

    const versionContractNumber = version
      ? (version?.contractNumber ?? version?.contract_number ?? null)
      : (contractRow.contractNumber ?? contractRow.contract_number);

    const contractDoc = version?.id
      ? contractDocumentByVersionId.get(Number(version.id)) ?? null
      : contractDocumentByContractId.get(Number(contractRow.id)) ?? null;

    return {
      id,
      contractId: contractRow.id ?? null,
      versionId: version?.id ?? null,
      number,
      contractNumber: formatDisplayContractNumber(versionContractNumber),
      note,
      isHistory: note === "Riwayat Perubahan",
      isFuture: note === "Akan Berjalan",
      isActive: note === "Kontrak Beroperasi",
      periodStart,
      periodEnd,
      paket: getContractPackageDisplay(resolveContractPackageType(rowSource)),
      jumlahPaket: resolveContractActualValue(rowSource),
      monthlyAmount: resolveContractMonthlyAmount(contractRow, version),
      yearlyAmount: version?.yearlyAmount ?? version?.yearly_amount ?? null,
      contractFileUrl: contractDoc?.fileUrl ?? null,
      contractDocumentId: contractDoc?.id ?? null,
      hasBak: Boolean(
        version?.id
          ? bakDocumentByVersionId.get(Number(version.id))
          : (contractRow.id ? bakDocumentByContractId.get(Number(contractRow.id)) : null),
      ),
      bakDocumentId: (
        version?.id
          ? bakDocumentByVersionId.get(Number(version.id))?.id
          : (contractRow.id ? bakDocumentByContractId.get(Number(contractRow.id))?.id : null)
      ) ?? null,
      bakFileUrl: (
        version?.id
          ? bakDocumentByVersionId.get(Number(version.id))?.fileUrl
          : (contractRow.id ? bakDocumentByContractId.get(Number(contractRow.id))?.fileUrl : null)
      ) ?? null,
      bakNumber: (
        version?.id
          ? bakDocumentByVersionId.get(Number(version.id))?.nomorDokumen
          : (contractRow.id ? bakDocumentByContractId.get(Number(contractRow.id))?.nomorDokumen : null)
      ) ?? null,
      renewalFollowUps: Array.isArray(version?.renewalFollowUps)
        ? version.renewalFollowUps
        : [],
    };
  };
  const contractRowsForTable = contractsForTable.flatMap((contractRow) => {
    const versionRows = Array.isArray(contractRow.versions)
      ? [...contractRow.versions]
        .sort((left, right) => (
          getRowPeriodTime({ periodEnd: left?.endDate ?? left?.end_date, periodStart: left?.startDate ?? left?.start_date })
          - getRowPeriodTime({ periodEnd: right?.endDate ?? right?.end_date, periodStart: right?.startDate ?? right?.start_date })
        ))
        .map((version) => buildContractTableRow({
          contractRow,
          version,
          id: `version-${version.id ?? `${contractRow.id}-${version.startDate ?? version.start_date ?? "unknown"}`}`,
          number: 0,
        }))
      : [];

    const baseRow = buildContractTableRow({
      contractRow,
      id: `contract-${contractRow.id ?? "unknown"}`,
      number: 0,
    });

    if (versionRows.length > 0) {
      const basePeriodKey = `${baseRow.periodStart ?? ""}::${baseRow.periodEnd ?? ""}`;
      const hasMatchingVersionPeriod = versionRows.some((row) => (
        `${row.periodStart ?? ""}::${row.periodEnd ?? ""}` === basePeriodKey
      ));

      if (hasMatchingVersionPeriod) {
        return versionRows;
      }

      const earliestVersionStart = [...versionRows]
        .map((row) => String(row.periodStart ?? "").slice(0, 10))
        .filter(Boolean)
        .sort()[0] ?? null;
      const basePeriodStart = String(baseRow.periodStart ?? "").slice(0, 10);
      const shouldForceLegacyContractNumber = Boolean(
        earliestVersionStart
        && basePeriodStart
        && basePeriodStart < earliestVersionStart,
      );

      // Jika start date dari base row tidak mendahului versi pertama,
      // maka base row ini sepenuhnya terwakili oleh version-version yang ada.
      // Kita kembalikan versionRows saja untuk mencegah baris duplikat/tumpang tindih.
      if (!shouldForceLegacyContractNumber) {
        return versionRows;
      }

      // Untuk baris legacy yang sah (memiliki start date sebelum versi pertama),
      // kita batasi periodEnd agar berakhir sehari sebelum versi pertama dimulai,
      // sehingga tidak tumpang tindih dengan versi-versi baru.
      let legacyEndDate = baseRow.periodEnd;
      if (earliestVersionStart) {
        try {
          const firstVerStart = new Date(earliestVersionStart);
          const legacyEnd = new Date(firstVerStart);
          legacyEnd.setDate(legacyEnd.getDate() - 1);
          legacyEndDate = legacyEnd.toISOString().slice(0, 10);
        } catch (e) {
          console.error("Gagal menghitung tanggal akhir periode legacy:", e);
        }
      }

      return [
        {
          ...baseRow,
          periodEnd: legacyEndDate,
          // Ketika periode legacy mendahului semua versi perpanjangan eksplisit,
          // jangan mewarisi nomor kontrak terbaru dari baris kontrak induk.
          contractNumber: "-",
        },
        ...versionRows,
      ];
    }

    return [baseRow];
  }).sort((left, right) => getRowPeriodTime(right) - getRowPeriodTime(left))
    .map((row, index) => ({ ...row, number: index + 1 }));

  const filteredContractRowsForTable = useMemo(() => {
    let result = [...contractRowsForTable];

    if (contractSearch) {
      const q = contractSearch.toLowerCase();
      result = result.filter(r =>
        (r.contractNumber || "").toLowerCase().includes(q) ||
        (r.note || "").toLowerCase().includes(q)
      );
    }

    if (contractSort === "asc") {
      result.reverse();
    }

    return result.map((row, idx) => ({ ...row, number: idx + 1 }));
  }, [contractRowsForTable, contractSearch, contractSort]);

  const toggleContractNumberEmptyMark = (rowId) => {
    setEmptyContractNumberRows((previous) => ({
      ...previous,
      [rowId]: !previous[rowId],
    }));
  };

  const openBillingEditor = () => {
    if (!contract?.id) {
      setError(
        "Kontrak beroperasi tidak ditemukan untuk update periode tagihan.",
      );
      return;
    }

    setBillingEditor({
      billingEvery: String(contract?.billingEvery ?? 1),
      billingUnit: String(contract?.billingUnit ?? "bulan"),
    });
    setBillingError("");
  };

  const recalculateUnpaidInvoiceSchedule = async (nextBillingCycle, targetContract = contract) => {
    const targetStartDate = targetContract?.startDate ?? targetContract?.start_date ?? null;
    const targetEndDate = targetContract?.endDate ?? targetContract?.end_date ?? null;
    const targetContractNumber = targetContract?.contractNumber ?? targetContract?.contract_number ?? null;

    if (!targetContract?.id || !targetStartDate || !targetEndDate) {
      return;
    }

    const scheduleRows = buildInvoiceScheduleRows(
      targetStartDate,
      targetEndDate,
      nextBillingCycle,
    );
    const targetMonthlyAmount = Number(
      targetContract?.monthlyAmount
      ?? targetContract?.monthly_amount
      ?? activeBillingPeriod?.amount
      ?? 0,
    );
    const scheduledAmount = resolveBillingCycleAmount(targetMonthlyAmount, nextBillingCycle);
    const persistedRowsForContract = invoices.filter((invoice) => {
      const invoiceId = Number(invoice?.id);
      const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
      return Number.isFinite(invoiceId) && invoiceContractId === Number(targetContract.id);
    });
    const paidRows = persistedRowsForContract.filter(isInvoicePaid);
    const unpaidActiveRows = persistedRowsForContract.filter((invoice) => {
      const scheduleStatus = String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "active").toLowerCase();
      return scheduleStatus !== "history" && !isInvoicePaid(invoice);
    });
    const paidPeriodKeys = new Set(
      paidRows.map((invoice) => `${invoice.periodStartDate ?? ""}-${invoice.periodEndDate ?? ""}`),
    );
    const activePeriodKeys = new Set(
      scheduleRows.map((row) => `${row.periodStartDate}-${row.periodEndDate}`),
    );
    const reusableRowsByPeriod = new Map();

    unpaidActiveRows.forEach((invoice) => {
      const key = `${String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10)}-${String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10)}`;
      if (activePeriodKeys.has(key) && !reusableRowsByPeriod.has(key)) {
        reusableRowsByPeriod.set(key, invoice);
      }
    });

    await Promise.all(
      unpaidActiveRows
        .filter((invoice) => {
          const key = `${String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10)}-${String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10)}`;
          return !activePeriodKeys.has(key);
        })
        .map((invoice) => tenantDetailData.invoices.update(invoice.id, { scheduleStatus: "history" })),
    );

    const availableScheduleRows = scheduleRows.filter(
      (row) => !paidPeriodKeys.has(`${row.periodStartDate}-${row.periodEndDate}`),
    );

    await Promise.all(
      availableScheduleRows.map((row) => {
        const key = `${row.periodStartDate}-${row.periodEndDate}`;
        const existingInvoice = reusableRowsByPeriod.get(key) ?? null;
        const periodDate = new Date(`${row.periodStartDate}T00:00:00.000Z`);
        const periodYear = Number.isFinite(periodDate.getTime())
          ? periodDate.getUTCFullYear()
          : null;
        const periodMonth = Number.isFinite(periodDate.getTime())
          ? periodDate.getUTCMonth() + 1
          : null;
        const payload = {
          customerId: customer.id,
          contractId: targetContract.id,
          contractVersionId: activeBillingPeriod?.versionId ?? null,
          contractNumber: targetContractNumber,
          periodStartDate: row.periodStartDate,
          periodEndDate: row.periodEndDate,
          periodYear,
          periodMonth,
          dueDate: resolveInvoiceDueMonthIsoDate(row.periodStartDate),
          amount: scheduledAmount,
          scheduleStatus: "active",
        };

        if (existingInvoice) {
          return tenantDetailData.invoices.update(existingInvoice.id, payload);
        }

        return tenantDetailData.invoices.create({
          ...payload,
          status: "belum_ditagih",
        });
      }),
    );
  };

  const getActivePersistedInvoiceIdsForContract = (targetContractId) => {
    const normalizedContractId = Number(targetContractId);
    if (!Number.isFinite(normalizedContractId)) {
      return [];
    }

    return invoices
      .filter((invoice) => {
        const invoiceId = Number(invoice?.id);
        const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
        const scheduleStatus = String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "").toLowerCase();
        return Number.isFinite(invoiceId)
          && invoiceContractId === normalizedContractId
          && scheduleStatus !== "history";
      })
      .map((invoice) => Number(invoice.id));
  };

  const archiveActiveInvoicesForContract = async (targetContractId, invoiceIds = null) => {
    const normalizedContractId = Number(targetContractId);
    if (!Number.isFinite(normalizedContractId)) {
      return;
    }

    const explicitInvoiceIds = Array.isArray(invoiceIds)
      ? new Set(invoiceIds.map((invoiceId) => Number(invoiceId)).filter(Number.isFinite))
      : null;

    const activePersistedInvoices = invoices.filter((invoice) => {
      const invoiceId = Number(invoice?.id);
      const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
      const scheduleStatus = String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "").toLowerCase();
      return Number.isFinite(invoiceId)
        && invoiceContractId === normalizedContractId
        && scheduleStatus !== "history"
        && (!explicitInvoiceIds || explicitInvoiceIds.has(invoiceId));
    });

    await Promise.all(
      activePersistedInvoices.map((invoice) =>
        tenantDetailData.invoices.update(invoice.id, { scheduleStatus: "history" }),
      ),
    );
  };

  const handleSaveBillingCycle = async (event) => {
    event.preventDefault();
    if (!contract?.id || !billingEditor) {
      return;
    }

    const billingEvery = Number(billingEditor.billingEvery);
    if (!Number.isFinite(billingEvery) || billingEvery <= 0) {
      setBillingError("Periode tagihan harus berupa angka lebih dari 0.");
      return;
    }

    if (
      !["hari", "bulan", "tahun"].includes(String(billingEditor.billingUnit))
    ) {
      setBillingError("Satuan periode tagihan tidak valid.");
      return;
    }

    setIsSavingBilling(true);
    setBillingError("");
    setError("");
    setInvoiceFeedback("");

    try {
      await tenantDetailData.contracts.update(contract.id, {
        billingEvery,
        billingUnit: billingEditor.billingUnit,
      });
      await recalculateUnpaidInvoiceSchedule({
        every: billingEvery,
        unit: billingEditor.billingUnit,
      });

      setBillingEditor(null);
      setInvoiceFeedback(
        "Periode tagihan berhasil diperbarui. Invoice aktif yang belum lunas disesuaikan otomatis; periksa ulang Jumlah Dibayar dan Tanggal Terakhir Pembayaran. Invoice yang sudah lunas tidak dihitung ulang.",
      );
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setBillingError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal memperbarui periode tagihan.",
      );
    } finally {
      setIsSavingBilling(false);
    }
  };

  const handleMarkActivationFeePaid = async () => {
    setIsMarkingActivationFeePaid(true);
    setError("");
    setDocumentFeedback("");

    try {
      await tenantDetailData.customers.update(customer.id, {
        activationFeePaidAt: new Date().toISOString(),
      });
      setDocumentFeedback("Biaya aktivasi berhasil ditandai sudah dibayar.");
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menandai biaya aktivasi sudah dibayar.",
      );
    } finally {
      setIsMarkingActivationFeePaid(false);
    }
  };

  const handleRevertActivationFeePaid = async () => {
    if (!window.confirm("Batalkan status lunas biaya aktivasi? To do pembayaran akan muncul kembali.")) {
      return;
    }

    setIsMarkingActivationFeePaid(true);
    setError("");
    setDocumentFeedback("");

    try {
      await tenantDetailData.customers.update(customer.id, {
        activationFeePaidAt: null,
      });
      setDocumentFeedback("Status biaya aktivasi dikembalikan menjadi belum dibayar.");
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal membatalkan status lunas biaya aktivasi.",
      );
    } finally {
      setIsMarkingActivationFeePaid(false);
    }
  };

  const handleSaveContractNumber = async (row) => {
    const normalizedContractNumber = String(contractNumberInputs[row.id] ?? "").trim();
    if (!normalizedContractNumber) {
      setError("Nomor kontrak wajib diisi sebelum disimpan.");
      return;
    }

    setIsSavingContractNumber(true);
    setError("");

    try {
      if (row.versionId) {
        await tenantDetailData.contractVersions.update(row.versionId, {
          contractNumber: normalizedContractNumber,
        });
      } else if (row.contractId) {
        await tenantDetailData.contracts.update(row.contractId, {
          contractNumber: normalizedContractNumber,
        });
      } else {
        setError("Data kontrak tidak valid untuk update nomor kontrak.");
        return;
      }

      setEmptyContractNumberRows((previous) => ({ ...previous, [row.id]: false }));
      setContractNumberInputs((previous) => {
        const nextInputs = { ...previous };
        delete nextInputs[row.id];
        return nextInputs;
      });
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menyimpan nomor kontrak.",
      );
    } finally {
      setIsSavingContractNumber(false);
    }
  };

  const openVersionEditor = () => {
    if (!canManageTenantContracts) {
      setError("Hanya admin yang dapat mengubah paket kontrak tenant.");
      return;
    }

    const latestVersion = versions[0];
    const packageType = latestVersion?.sharedCoreRatio ?? contract?.sharingRatio ? "sharing_core" : "core";
    const monthlyAmount = Number(latestVersion?.monthlyAmount ?? latestVersion?.monthly_amount ?? 0);
    setVersionEditor({
      reason: "ubah_paket",
      customReason: "",
      contractNumber: "",
      requestedDate: todayIso,
      packageType,
      coreTotal: String(latestVersion?.coreTotal ?? latestVersion?.core_total ?? contract?.coreTotal ?? contract?.core_total ?? ""),
      ratio: latestVersion?.sharedCoreRatio ?? contract?.sharingRatio ?? "1:8",
      monthlyAmount: monthlyAmount > 0 ? formatRupiahInput(monthlyAmount) : "",
      yearlyAmount: monthlyAmount > 0 ? formatRupiahInput(monthlyAmount * 12) : "",
    });
    setVersionError("");
  };

  const buildContractRowEditorState = (row, focusField = null) => {
    const isVersionRow = Boolean(row.versionId);
    const contractDoc = isVersionRow
      ? contractDocumentByVersionId.get(Number(row.versionId)) ?? null
      : contractDocumentByContractId.get(Number(row.contractId)) ?? null;
    const bakDoc = isVersionRow
      ? bakDocumentByVersionId.get(Number(row.versionId)) ?? bakDocumentByContractId.get(Number(row.contractId)) ?? null
      : bakDocumentByContractId.get(Number(row.contractId)) ?? null;

    return {
      rowId: row.id,
      contractId: row.contractId,
      versionId: row.versionId,
      contractNumber: String(row.contractNumber ?? "").trim(),
      startDate: String(row.periodStart ?? "").slice(0, 10),
      endDate: String(row.periodEnd ?? "").slice(0, 10),
      monthlyAmount: row.monthlyAmount ? formatRupiahInput(row.monthlyAmount) : "",
      billingEvery: String(contract?.billingEvery ?? 1),
      billingUnit: String(contract?.billingUnit ?? "bulan"),
      rowLabel: isVersionRow ? "Versi Kontrak" : "Kontrak Utama",
      contractFileName: String(contractDoc?.nomorDokumen ?? contractDoc?.fileName ?? "").trim(),
      contractFileUrl: String(contractDoc?.fileUrl ?? "").trim(),
      contractUploadedFile: null,
      contractUploadedFileName: "",
      bakFileName: String(bakDoc?.nomorDokumen ?? bakDoc?.fileName ?? "").trim(),
      bakFileUrl: String(bakDoc?.fileUrl ?? "").trim(),
      bakUploadedFile: null,
      bakUploadedFileName: "",
      contractDocId: contractDoc?.id ?? null,
      bakDocId: bakDoc?.id ?? null,
      focusField,
    };
  };

  const openContractRowEditor = (row, focusField = null) => {
    if (!canManageTenantContracts) {
      setError("Hanya admin yang dapat mengubah data kontrak tenant.");
      return;
    }

    if (!row?.contractId) {
      setError("Data kontrak tidak valid untuk diedit.");
      return;
    }

    setContractRowEditor(buildContractRowEditorState(row, focusField));
    setError("");
  };

  const getOverviewTodoTargetTab = (item) => {
    const code = String(item?.code ?? item?.type ?? "").toLowerCase();

    if (
      code.includes("invoice") ||
      code.includes("payment") ||
      code.includes("upload_h_minus") ||
      code.includes("warning_unpaid")
    ) {
      return "invoices";
    }

    if (
      code.includes("contract") ||
      code.includes("bak") ||
      code.includes("renewal")
    ) {
      return "contracts";
    }

    if (code.includes("document")) {
      return "documents";
    }

    if (code.includes("route")) {
      return "jalur";
    }

    return "overview";
  };

  const handleOverviewTodoNavigation = (item) => {
    const targetTab = getOverviewTodoTargetTab(item);
    setActiveTab(targetTab);

    if (targetTab === "contracts" && canManageTenantContracts) {
      const targetContractRow =
        contractRowsForTable.find((row) => row.id === primaryContractRowMarkerId) ??
        contractRowsForTable.find((row) => row.isActive) ??
        contractRowsForTable[0] ??
        null;

      if (targetContractRow) {
        openContractRowEditor(targetContractRow);
      }
    }
  };

  const handleOverviewTodoKeyDown = (event, item) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleOverviewTodoNavigation(item);
  };

  const handleCreateVersion = async (event) => {
    event.preventDefault();
    if (!contract || !versionEditor) {
      return;
    }
    const isSharingPackage = versionEditor.packageType === "sharing_core";
    const monthlyAmount = parseRupiahInput(versionEditor.monthlyAmount);
    const yearlyAmount = versionEditor.yearlyAmount ? parseRupiahInput(versionEditor.yearlyAmount) : (monthlyAmount * 12);
    const coreTotal = Number(versionEditor.coreTotal);

    if (!versionEditor.requestedDate) {
      setVersionError("Tanggal perubahan paket wajib diisi.");
      return;
    }
    if (contract.endDate && versionEditor.requestedDate > contract.endDate) {
      setVersionError("Tanggal perubahan paket melewati akhir kontrak.");
      return;
    }
    if (isSharingPackage && !/^[1-9]\d*:[1-9]\d*$/.test(String(versionEditor.ratio ?? "").trim())) {
      setVersionError("Rasio shared core tidak valid.");
      return;
    }
    if (!isSharingPackage && (!Number.isFinite(coreTotal) || coreTotal <= 0)) {
      setVersionError("Jumlah core wajib lebih dari 0.");
      return;
    }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      setVersionError("Nominal bulanan wajib lebih dari 0.");
      return;
    }
    if (
      (versionEditor.reason ?? "ubah_paket") === "lainnya" &&
      !String(versionEditor.customReason ?? "").trim()
    ) {
      setVersionError("Alasan lain wajib diisi.");
      return;
    }
    setIsSubmittingVersion(true);
    setVersionError("");
    setDocumentFeedback("");
    try {
      const result = await tenantDetailData.contractVersions.changePackageMidPeriod({
        contractId: contract.id,
        requestedDate: versionEditor.requestedDate,
        contractNumber: String(versionEditor.contractNumber ?? "").trim() || undefined,
        coreType: versionEditor.packageType,
        coreTotal: isSharingPackage ? 0 : coreTotal,
        sharedCoreRatio: isSharingPackage ? String(versionEditor.ratio ?? "").trim() : null,
        monthlyAmount,
        yearlyAmount: Number.isFinite(yearlyAmount) && yearlyAmount > 0 ? yearlyAmount : monthlyAmount * 12,
        remarks: (versionEditor.reason ?? "ubah_paket") === "lainnya"
          ? String(versionEditor.customReason ?? "").trim()
          : `Ubah paket efektif ${getUpgradeEffectiveStartPreview(versionEditor.requestedDate)}.`,
      });
      setVersionEditor(null);
      setDocumentFeedback(
        `Paket baru aktif mulai ${formatDate(result.newEffectiveStart)}. ${result.updatedInvoiceCount} invoice belum lunas diperbarui.`,
      );

      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setVersionError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat membuat perubahan paket.",
      );
    } finally {
      setIsSubmittingVersion(false);
    }
  };

  const handleSaveContractRow = async (event = null, overrides = {}) => {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    const { __editorState: editorStateOverride, ...fieldOverrides } = overrides;
    if (!contractRowEditor && !editorStateOverride) {
      return;
    }

    const editorState = {
      ...(editorStateOverride ?? contractRowEditor),
      ...fieldOverrides,
    };

    const contractNumber = String(editorState.contractNumber ?? "").trim();
    const startDate = String(editorState.startDate ?? "").slice(0, 10);
    const endDate = String(editorState.endDate ?? "").slice(0, 10);
    const monthlyAmount = parseRupiahInput(editorState.monthlyAmount);
    const billingEvery = Number(editorState.billingEvery);
    const billingUnit = String(editorState.billingUnit ?? "");
    const contractUploadedFile = editorState.contractUploadedFile;
    const bakUploadedFile = editorState.bakUploadedFile;
    const hasFileUpload = (contractUploadedFile instanceof File) || (bakUploadedFile instanceof File);

    // Validasi konsistensi — hanya cek jika kedua tanggal terisi
    if (startDate && endDate && startDate > endDate) {
      setError("Periode awal tidak boleh lebih besar dari periode akhir.");
      return;
    }
    if (editorState.monthlyAmount && (!Number.isFinite(monthlyAmount) || monthlyAmount < 0)) {
      setError("Nominal/bulan harus berupa angka yang valid.");
      return;
    }

    setIsSavingContractRow(true);
    setError("");
    setDocumentFeedback("");

    try {
      const shouldDeletePreviousContractDocument = Boolean(
        editorState.contractDocId && (!editorState.contractFileUrl || contractUploadedFile),
      );
      const shouldDeletePreviousBakDocument = Boolean(
        editorState.bakDocId && (!editorState.bakFileUrl || bakUploadedFile),
      );
      const hasDocumentRemoval = Boolean(
        (editorState.contractDocId && !editorState.contractFileUrl && !(contractUploadedFile instanceof File))
        || (editorState.bakDocId && !editorState.bakFileUrl && !(bakUploadedFile instanceof File)),
      );

      const originalRow = contractRowsForTable.find((row) => row.id === editorState.rowId);
      const originalMonthlyAmount = Number(originalRow?.monthlyAmount ?? 0);
      const normalizedMonthlyAmount = monthlyAmount > 0 ? monthlyAmount : 0;
      const hasMonthlyAmountChange = !originalRow || normalizedMonthlyAmount !== originalMonthlyAmount;

      const updateUnpaidInvoiceAmounts = async (targetVersionId = null) => {
        const periodStart = startDate || String(originalRow?.periodStart ?? "").slice(0, 10);
        const periodEnd = endDate || String(originalRow?.periodEnd ?? "").slice(0, 10);
        const targetContractId = Number(editorState.contractId);

        const invoicesToUpdate = invoices.filter((invoice) => {
          const invoiceId = Number(invoice?.id);
          const invoiceContractId = Number(invoice?.contractId ?? invoice?.contract_id);
          const invoicePeriodStart = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
          const invoiceScheduleStatus = String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "").toLowerCase();

          if (!Number.isFinite(invoiceId) || invoiceContractId !== targetContractId) {
            return false;
          }
          if (invoiceScheduleStatus === "history" || isInvoicePaid(invoice)) {
            return false;
          }
          if (periodStart && invoicePeriodStart && invoicePeriodStart < periodStart) {
            return false;
          }
          if (periodEnd && invoicePeriodStart && invoicePeriodStart > periodEnd) {
            return false;
          }

          return true;
        });

        await Promise.all(invoicesToUpdate.map((invoice) => {
          const invoicePayload = { amount: normalizedMonthlyAmount };
          if (targetVersionId) {
            invoicePayload.contractVersionId = Number(targetVersionId);
          }
          return tenantDetailData.invoices.update(invoice.id, invoicePayload);
        }));
      };

      const persistMainContractMonthlyAmount = async () => {
        if (!hasMonthlyAmountChange || editorState.versionId) {
          return false;
        }

        const contractVersions = versions.filter(
          (version) => Number(version?.contractId ?? version?.contract_id) === Number(editorState.contractId),
        );
        const matchingVersion = contractVersions.find((version) => (
          String(version?.startDate ?? version?.start_date ?? "").slice(0, 10) === startDate
          && String(version?.endDate ?? version?.end_date ?? "").slice(0, 10) === endDate
        ));

        if (matchingVersion?.id) {
          await tenantDetailData.contractVersions.update(matchingVersion.id, {
            monthlyAmount: normalizedMonthlyAmount,
            yearlyAmount: normalizedMonthlyAmount * 12,
          });
          await updateUnpaidInvoiceAmounts(matchingVersion.id);
          return true;
        }

        if (contractVersions.length === 0 && startDate && endDate) {
          const createdVersion = await tenantDetailData.contractVersions.create({
            contractId: editorState.contractId,
            customerId: customer.id,
            contractNumber: contractNumber || null,
            startDate,
            endDate,
            coreType: contract?.coreType ?? contract?.core_type ?? "core",
            coreTotal: Number(contract?.coreTotal ?? contract?.core_total ?? 0),
            sharedCoreRatio: contract?.sharingRatio ?? contract?.sharing_ratio ?? null,
            monthlyAmount: normalizedMonthlyAmount,
            yearlyAmount: normalizedMonthlyAmount * 12,
            remarks: "Baseline nominal kontrak dari tabel manajemen kontrak.",
          });
          await updateUnpaidInvoiceAmounts(createdVersion?.id ?? null);
          return true;
        }

        await updateUnpaidInvoiceAmounts();
        return true;
      };

      const buildChangedPayload = () => {
        const payload = {};

        if (!originalRow || contractNumber !== String(originalRow.contractNumber ?? "").trim()) {
          payload.contractNumber = contractNumber;
        }
        if (!originalRow || startDate !== String(originalRow.periodStart ?? "").slice(0, 10)) {
          payload.startDate = startDate;
        }
        if (!originalRow || endDate !== String(originalRow.periodEnd ?? "").slice(0, 10)) {
          payload.endDate = endDate;
        }

        if (editorState.versionId) {
          if (hasMonthlyAmountChange) {
            payload.monthlyAmount = normalizedMonthlyAmount;
            payload.yearlyAmount = normalizedMonthlyAmount * 12;
          }
          return payload;
        }

        const originalBillingEvery = Number(contract?.billingEvery ?? 1);
        const originalBillingUnit = String(contract?.billingUnit ?? "bulan");
        if (!Number.isFinite(originalBillingEvery) || billingEvery !== originalBillingEvery) {
          payload.billingEvery = billingEvery;
        }
        if (billingUnit !== originalBillingUnit) {
          payload.billingUnit = billingUnit;
        }

        return payload;
      };

      const payload = buildChangedPayload();
      let hasDataChanges = Object.keys(payload).length > 0;
      if (hasDataChanges) {
        if (editorState.versionId) {
          await tenantDetailData.contractVersions.update(editorState.versionId, payload);
          if (hasMonthlyAmountChange) {
            await updateUnpaidInvoiceAmounts(editorState.versionId);
          }
        } else {
          await tenantDetailData.contracts.update(editorState.contractId, payload);
        }
      }
      const hasMainMonthlyAmountChange = await persistMainContractMonthlyAmount();
      hasDataChanges = hasDataChanges || hasMainMonthlyAmountChange;

      const uploadDocumentIfNeeded = async (file, jenisDokumen, label) => {
        if (!(file instanceof File)) {
          return;
        }

        const fileUrl = await uploadWithProgress(file, ["customers", customer.id, "documents"]);
        await tenantDetailData.documents.create({
          customer_id: customer.id,
          contract_id: editorState.contractId,
          contract_version_id: editorState.versionId ? Number(editorState.versionId) : null,
          contract_number: contractNumber || null,
          jenis_dokumen: jenisDokumen,
          nomor_dokumen: contractNumber || null,
          tanggal_dokumen: todayIso,
          file_url: fileUrl,
        });

        return label;
      };

      await Promise.all([
        uploadDocumentIfNeeded(contractUploadedFile, "kontrak", "kontrak"),
        uploadDocumentIfNeeded(bakUploadedFile, "BAK", "bak"),
      ]);

      // Hapus dokumen lama hanya setelah upload/insert dokumen pengganti selesai,
      // agar kegagalan upload tidak membuat arsip legal kehilangan berkas lama.
      await Promise.all([
        shouldDeletePreviousContractDocument
          ? tenantDetailData.documents.delete(editorState.contractDocId).catch((deleteError) => {
            console.warn("Failed to delete previous contract document:", deleteError);
          })
          : Promise.resolve(),
        shouldDeletePreviousBakDocument
          ? tenantDetailData.documents.delete(editorState.bakDocId).catch((deleteError) => {
            console.warn("Failed to delete previous BAK document:", deleteError);
          })
          : Promise.resolve(),
      ]);

      setContractRowEditor(null);
      const feedbackMsg = hasFileUpload && !hasDataChanges
        ? "Berkas berhasil diunggah."
        : hasDocumentRemoval && !hasDataChanges
          ? "Berkas berhasil dihapus."
          : "Data baris kontrak berhasil diperbarui.";
      setDocumentFeedback(feedbackMsg);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal memperbarui data baris kontrak.",
      );
    } finally {
      setIsSavingContractRow(false);
    }
  };

  const triggerAutoSave = async () => {
    if (!contractRowEditor) return;
    if (isSelectingFileRef.current) return;

    const originalRow = contractRowsForTable.find(r => r.id === contractRowEditor.rowId);
    if (!originalRow) return;

    const hasChanges =
      String(contractRowEditor.contractNumber ?? "").trim() !== String(originalRow.contractNumber ?? "").trim() ||
      String(contractRowEditor.startDate ?? "").slice(0, 10) !== String(originalRow.periodStart ?? "").slice(0, 10) ||
      String(contractRowEditor.endDate ?? "").slice(0, 10) !== String(originalRow.periodEnd ?? "").slice(0, 10) ||
      parseRupiahInput(contractRowEditor.monthlyAmount) !== Number(originalRow.monthlyAmount ?? 0) ||
      String(contractRowEditor.contractFileUrl ?? "").trim() !== String(originalRow.contractFileUrl ?? "").trim() ||
      String(contractRowEditor.bakFileUrl ?? "").trim() !== String(originalRow.bakFileUrl ?? "").trim() ||
      contractRowEditor.contractUploadedFile !== null ||
      contractRowEditor.bakUploadedFile !== null;

    if (hasChanges) {
      await handleSaveContractRow();
    } else {
      setContractRowEditor(null);
    }
  };


  const handleUploadDocument = async (event) => {
    event.preventDefault();
    if (!(documentDraft.uploadedFile instanceof File)) {
      setDocumentError("Upload dokumen wajib dipilih terlebih dahulu.");
      return;
    }
    setIsUploadingDocument(true);
    setDocumentError("");
    setDocumentFeedback("");
    try {
      const fileUrl = await uploadWithProgress(documentDraft.uploadedFile, ["customers", customer.id, "documents"]);
      await tenantDetailData.documents.create({
        customer_id: customer.id,
        contract_id: contract?.id ?? null,
        contract_version_id: documentDraft.contractVersionId ? Number(documentDraft.contractVersionId) : null,
        contract_number: contract?.contractNumber ?? contract?.contract_number ?? null,
        jenis_dokumen: documentDraft.jenisDokumen,
        nomor_dokumen: documentDraft.nomorDokumen.trim() || null,
        tanggal_dokumen: documentDraft.tanggalDokumen || todayIso,
        file_url: fileUrl,
      });
      setDocumentFeedback("Dokumen berhasil diunggah.");
      setDocumentDraft({
        jenisDokumen: "penawaran",
        nomorDokumen: "",
        tanggalDokumen: "",
        contractVersionId: "",
        customJenisDokumen: "",
        fileUrl: "",
        uploadedFileName: "",
        uploadedFile: null,
      });
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setDocumentError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat mengunggah dokumen.",
      );
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const closePaymentRealizationModal = () => {
    setIsPaymentRealizationModalOpen(false);
    setPaymentRealizationError("");
    setPaymentRealizationDraft(createInitialPaymentRealizationDraft());
  };

  const openPaymentRealizationModal = () => {
    setPaymentRealizationError("");
    setPaymentRealizationFeedback("");
    setPaymentRealizationDraft(createInitialPaymentRealizationDraft());
    setIsPaymentRealizationModalOpen(true);
  };

  const handleCreatePaymentRealization = async (event) => {
    event.preventDefault();

    const periodStartMonth = String(paymentRealizationDraft.periodStartMonth ?? "").slice(0, 10);
    const periodEndMonth = String(paymentRealizationDraft.periodEndMonth ?? "").slice(0, 10);
    const amount = parseRupiahInput(paymentRealizationDraft.amount);

    if (!periodStartMonth || !periodEndMonth) {
      setPaymentRealizationError("Periode pembayaran wajib diisi lengkap.");
      return;
    }
    if (periodEndMonth < periodStartMonth) {
      setPaymentRealizationError("Periode akhir tidak boleh lebih awal dari periode awal.");
      return;
    }
    if (amount <= 0) {
      setPaymentRealizationError("Nominal pembayaran wajib lebih dari Rp 0.");
      return;
    }
    if (!(paymentRealizationDraft.uploadedFile instanceof File)) {
      setPaymentRealizationError("Berkas pembayaran wajib dipilih terlebih dahulu.");
      return;
    }

    setIsSavingPaymentRealization(true);
    setPaymentRealizationError("");
    setPaymentRealizationFeedback("");

    try {
      const paymentFileUrl = await uploadWithProgress(paymentRealizationDraft.uploadedFile, ["customers", customer.id, "payment-realizations"]);
      const activeContractId = Number(activeBillingPeriod?.contractId ?? contract?.id);
      const activeContractVersionId = Number(activeBillingPeriod?.versionId);

      await tenantDetailData.paymentRealizations.create({
        customer_id: customer.id,
        contract_id: Number.isFinite(activeContractId) ? activeContractId : null,
        contract_version_id: Number.isFinite(activeContractVersionId) && activeContractVersionId > 0
          ? activeContractVersionId
          : null,
        period_start_month: periodStartMonth,
        period_end_month: periodEndMonth,
        amount,
        payment_file_url: paymentFileUrl,
        payment_file_name: paymentRealizationDraft.uploadedFile.name ?? paymentRealizationDraft.uploadedFileName ?? null,
        notes: String(paymentRealizationDraft.notes ?? "").trim() || null,
      });

      setPaymentRealizationFeedback("Realisasi pembayaran berhasil ditambahkan.");
      setPaymentRealizationDraft(createInitialPaymentRealizationDraft());
      setIsPaymentRealizationModalOpen(false);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setPaymentRealizationError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat menambahkan realisasi pembayaran.",
      );
    } finally {
      setIsSavingPaymentRealization(false);
    }
  };

  const handleDeleteTenant = async () => {
    setIsDeletingTenant(true);
    setDeleteError("");
    try {
      await tenantDetailData.customers.delete(customer.id, { permanent: deletePermanently });
      setDeleteModalOpen(false);
      onBack?.();
      await onRefreshAll?.();
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat menghapus lokasi.",
      );
    } finally {
      setIsDeletingTenant(false);
    }
  };

  const handleOpenDeleteModal = () => {
    setDeleteError("");
    setDeletePermanently(false);
    setDeleteModalOpen(true);
  };

  const routePointTypeLabelMap = {
    awal: "Awal",
    transit: "Transit",
    tujuan: "Tujuan",
  };

  const routePointTypeMeta = {
    awal: {
      label: "Awal",
      icon: "trip_origin",
      helper: "Titik sumber/aliran masuk",
    },
    transit: {
      label: "Transit",
      icon: "route",
      helper: "Lintasan yang dilewati",
    },
    tujuan: {
      label: "Tujuan",
      icon: "flag",
      helper: "Titik akhir/aliran keluar",
    },
  };

  const routeHistoryRows = useMemo(() => {
    if (!isRouteTabActive) {
      return [];
    }

    // Urutkan dari terlama ke terbaru dulu agar changeNumber bisa dihitung benar
    const sorted = [...routeHistory].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB; // ascending: index 0 = paling lama
    });

    // Map dengan changeNumber: index 0 (terlama) = V1, index terakhir (terbaru) = Vterbesar
    const mapped = sorted.map((item, index) => {
      const beforePoints = Array.isArray(item?.snapshotBefore?.points)
        ? item.snapshotBefore.points
        : [];
      const afterPoints = Array.isArray(item?.snapshotAfter?.points)
        ? item.snapshotAfter.points
        : [];

      const summarizePoints = (points) => {
        if (!points.length) {
          return "-";
        }

        return points
          .map((point) => `${point.orderNumber}. ${point.pathName}`)
          .join(" -> ");
      };

      return {
        ...item,
        changeNumber: index + 1, // V1 = terlama, Vn = terbaru
        operationLabel:
          ROUTE_OPERATION_LABEL_MAP[item?.operation] ??
          toTitleCase(item?.operation ?? "perubahan"),
        changeReason: item?.changeNote || item?.note || (item?.operation ? (ROUTE_OPERATION_LABEL_MAP[item.operation] ?? item.operation) : "Pemutakhiran Jalur"),
        changeDescription: item?.changeNote || item?.note,
        points: afterPoints.length > 0 ? afterPoints : beforePoints,
        beforeSummary: summarizePoints(beforePoints),
        afterSummary: summarizePoints(afterPoints),
        beforePoints,
        afterPoints,
        beforeCount: beforePoints.length,
        afterCount: afterPoints.length,
        beforeStatus: item?.snapshotBefore?.flowStatus ?? "-",
        afterStatus: item?.snapshotAfter?.flowStatus ?? "-",
      };
    });

    // Tampilkan terbaru di atas (descending) — changeNumber tetap benar
    return mapped.reverse();
  }, [isRouteTabActive, routeHistory]);

  const toggleHistoryExpand = (id) => {
    setExpandedHistoryIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const requireRouteManageAccess = () => {
    if (canManageRoute) {
      return true;
    }

    setRouteError("Role ini hanya dapat melihat titik dan jalur tanpa mengubah peta.");
    setRouteFeedback("");
    return false;
  };

  const runRouteMutation = async (body, successMessage) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    setRouteBusy(true);
    setRouteError("");
    setRouteFeedback("");

    try {
      let nextPoints = [...routePoints];

      if (body.operation === "delete") {
        nextPoints = nextPoints.filter((point) => String(point.id) !== String(body.pointId));
      } else if (body.operation === "reorder" && Array.isArray(body.orderedPointIds)) {
        const pointById = new Map(nextPoints.map((point) => [point.id, point]));
        nextPoints = body.orderedPointIds.map((id) => pointById.get(id)).filter(Boolean);
      } else if (Array.isArray(body.points)) {
        nextPoints = body.points;
      }

      await tenantDetailData.customerRoutes.replace(customer.id, {
        flowStatus: body.flowStatus ?? activeRouteStatus,
        changeNote: routeChangeNote.trim() || "Perubahan struktur jalur dari halaman tenant.",
        points: nextPoints.map((point, index) => ({
          pathName: point.pathName,
          pointType: point.pointType,
          note: point.note,
          orderNumber: index + 1,
        })),
      });

      await tenantDetailData.customerRoutes.addHistory(customer.id, {
        operation: body.operation || "update",
        note: routeChangeNote.trim() || "Perubahan struktur jalur dari halaman tenant.",
        snapshotBefore: {
          flowStatus: activeRouteStatus,
          points: routePoints,
        },
        snapshotAfter: {
          flowStatus: body.flowStatus ?? activeRouteStatus,
          points: nextPoints.map((point, index) => ({
            ...point,
            orderNumber: index + 1,
          })),
        },
      });

      setRouteFeedback(successMessage);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setRouteError(
        requestError instanceof Error
          ? requestError.message
          : "Terjadi kesalahan saat memproses jalur.",
      );
    } finally {
      setRouteBusy(false);
    }
  };

  // Fungsi commit inti — menerima data langsung sebagai parameter agar bisa
  // dipanggil baik dari tombol "Aktifkan" (pakai state) maupun langsung dari
  // planner (pakai data fresh tanpa bergantung state React yang async).
  const commitRouteData = async ({ points, flowStatus, changeNote, snapshotBeforePoints, snapshotBeforeStatus }) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    setRouteBusy(true);
    setRouteError("");
    try {
      await tenantDetailData.customerRoutes.replace(customer.id, {
        flowStatus,
        changeNote,
        points: points.map((p, idx) => ({
          pathName: p.pathName,
          pointType: p.pointType,
          note: p.note,
          orderNumber: idx + 1,
        })),
      });

      await tenantDetailData.customerRoutes.addHistory(customer.id, {
        operation: "commit",
        note: changeNote,
        snapshotBefore: {
          flowStatus: snapshotBeforeStatus,
          points: snapshotBeforePoints,
        },
        snapshotAfter: {
          flowStatus,
          points: points.map((p, idx) => ({
            ...p,
            orderNumber: idx + 1,
          })),
        },
      });

      setRouteChangeNote("");
      setIsRouteDrafting(false);
      setDraftRoutePoints([]);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(routeDraftStorageKey);
      }
      setRouteFeedback("Jalur baru berhasil disimpan dan dicatat ke riwayat.");
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setRouteError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menyimpan jalur.",
      );
    } finally {
      setRouteBusy(false);
    }
  };

  const handleCommitDraft = async () => {
    if (!requireRouteManageAccess()) {
      return;
    }

    if (!routeChangeNote.trim()) {
      setRouteError(
        "Catatan perubahan wajib diisi untuk menyimpan struktur baru.",
      );
      return;
    }
    await commitRouteData({
      points: Array.isArray(draftRoutePoints) ? draftRoutePoints : [],
      flowStatus: draftRouteStatus,
      changeNote: routeChangeNote,
      snapshotBeforePoints: routePoints,
      snapshotBeforeStatus: activeRouteStatus,
    });
  };

  const cancelDraftingSession = () => {
    setIsRouteDrafting(false);
    setDraftRoutePoints([]);
    setRouteChangeNote("");
    setRouteError("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(routeDraftStorageKey);
    }
  };

  const handleDraftMove = (pointId, direction) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    setDraftRoutePoints((prev) => {
      const point = prev.find((p) => String(p.id) === String(pointId));
      if (!point || point.pointType !== "transit") return prev;

      const transitPoints = prev.filter((p) => p.pointType === "transit");
      const currentIndex = transitPoints.findIndex(
        (p) => String(p.id) === String(pointId),
      );
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= transitPoints.length) return prev;

      const newTransitPoints = [...transitPoints];
      const [moved] = newTransitPoints.splice(currentIndex, 1);
      newTransitPoints.splice(targetIndex, 0, moved);

      const awalPoint = prev.find((p) => p.pointType === "awal");
      const tujuanPoint = prev.find((p) => p.pointType === "tujuan");

      const newList = [];
      if (awalPoint) newList.push(awalPoint);
      newList.push(...newTransitPoints);
      if (tujuanPoint) newList.push(tujuanPoint);

      return newList.map((p, idx) => ({ ...p, orderNumber: idx + 1 }));
    });
  };

  const handleDraftDelete = (pointId) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    setDraftRoutePoints((prev) =>
      prev
        .filter(
          (p) => String(p.id) !== String(pointId) || p.pointType !== "transit",
        )
        .map((p, idx) => ({ ...p, orderNumber: idx + 1 })),
    );
  };


  const handleDeleteAllHistory = async () => {
    if (!requireRouteManageAccess()) {
      return;
    }

    if (
      !confirm(
        "Hapus seluruh riwayat jalur tenant ini? Tindakan ini tidak dapat dibatalkan.",
      )
    )
      return;

    setRouteBusy(true);
    setRouteError("");
    setRouteFeedback("");
    try {
      setRouteFeedback("Penghapusan riwayat jalur langsung belum tersedia di mode Supabase direct access.");
      await loadDetail();
    } catch (requestError) {
      setRouteError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menghapus semua riwayat.",
      );
    } finally {
      setRouteBusy(false);
    }
  };

  const handleDeleteRoutePoint = async (pointId) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    if (isRouteDrafting) {
      handleDraftDelete(pointId);
      return;
    }
    await runRouteMutation(
      {
        operation: "delete",
        pointId,
      },
      "Titik jalur berhasil dihapus.",
    );
  };

  const handleMoveRoutePoint = async (pointId, direction) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    if (isRouteDrafting) {
      handleDraftMove(pointId, direction);
      return;
    }
    const currentIndex = transitPointIds.findIndex((id) => id === pointId);

    if (currentIndex < 0) {
      return;
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= transitPointIds.length) {
      return;
    }

    const reorderedTransitIds = [...transitPointIds];
    const [item] = reorderedTransitIds.splice(currentIndex, 1);
    reorderedTransitIds.splice(targetIndex, 0, item);

    const nextOrder = [];
    if (activeAwalPoint) {
      nextOrder.push(activeAwalPoint.id);
    }

    nextOrder.push(...reorderedTransitIds);

    if (activeTujuanPoint) {
      nextOrder.push(activeTujuanPoint.id);
    }

    const coveredIds = new Set(nextOrder);
    routePoints.forEach((point) => {
      if (!coveredIds.has(point.id)) {
        nextOrder.push(point.id);
      }
    });

    await runRouteMutation(
      {
        operation: "reorder",
        orderedPointIds: nextOrder,
      },
      "Urutan titik jalur berhasil diperbarui.",
    );
  };


  const handleApplyPlannedRoute = async (plannedPoints, plannerMeta) => {
    if (!requireRouteManageAccess()) {
      return;
    }

    if (!Array.isArray(plannedPoints) || plannedPoints.length < 2) {
      setRouteError(
        "Minimal dua titik diperlukan untuk menerapkan hasil planner.",
      );
      return;
    }

    const distanceKm = Number(plannerMeta?.distance ?? 0) / 1000;
    const durationMinutes = Number(plannerMeta?.duration ?? 0) / 60;
    const routeSummary = [
      "Perencanaan rute FO via Valhalla",
      Number.isFinite(distanceKm) && distanceKm > 0
        ? `jarak ${distanceKm.toFixed(2)} km`
        : null,
      Number.isFinite(durationMinutes) && durationMinutes > 0
        ? `estimasi ${Math.round(durationMinutes)} menit`
        : null,
      plannerMeta?.profile ? `profile ${plannerMeta.profile}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    const changeNote = plannerMeta?.editReason?.trim() || routeSummary;

    const finalPoints = attachRoutePlannerMetaToDraftPoints(
      plannedPoints.map((point, index) => ({
        ...point,
        id: point?.id ?? `draft-planner-${Date.now()}-${index}`,
        orderNumber: index + 1,
      })),
      plannerMeta,
    );

    // Langsung commit ke database tanpa perlu mode draft + tombol Aktifkan
    await commitRouteData({
      points: finalPoints,
      flowStatus: activeRouteStatus,
      changeNote,
      snapshotBeforePoints: routePoints,
      snapshotBeforeStatus: activeRouteStatus,
    });
  };

  const updateInvoiceDraftField = (invoiceId, field, value) => {
    setInvoiceDrafts((previousDrafts) => ({
      ...previousDrafts,
      [invoiceId]: {
        ...(previousDrafts[invoiceId] ?? {}),
        [field]: value,
      },
    }));
  };

  const handleInvoiceDraftAmountChange = (e, invoiceId) => {
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart;
    const oldLength = rawValue.length;
    const formatted = formatRupiahInput(rawValue);

    updateInvoiceDraftField(invoiceId, "amount", formatted);

    requestAnimationFrame(() => {
      const newLength = formatted.length;
      const lengthDiff = newLength - oldLength;
      let newSelectionStart = selectionStart + lengthDiff;
      newSelectionStart = Math.max(0, Math.min(newSelectionStart, newLength));
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(newSelectionStart, newSelectionStart);
      }
    });
  };



  const resolveAutoInvoiceStatus = (currentStatus, hasInvoiceFile, dueDateStr) => {
    let resolved = currentStatus;
    if (resolved === "belum_ditagih" && hasInvoiceFile) {
      resolved = "belum_bayar";
    } else if (resolved === "belum_bayar" && !hasInvoiceFile) {
      resolved = "belum_ditagih";
    }

    if (resolved === "belum_bayar" || resolved === "belum_ditagih") {
      const todayMonth = new Date().toISOString().slice(0, 7);
      const dueMonth = String(dueDateStr ?? "").slice(0, 7);
      if (dueMonth && todayMonth > dueMonth) {
        resolved = "terlambat";
      }
    } else if (resolved === "terlambat") {
      const todayMonth = new Date().toISOString().slice(0, 7);
      const dueMonth = String(dueDateStr ?? "").slice(0, 7);
      if (!dueMonth || todayMonth <= dueMonth) {
        resolved = hasInvoiceFile ? "belum_bayar" : "belum_ditagih";
      }
    }
    return resolved;
  };


  const getInvoiceDraft = (invoice) => {
    const existingDraft = invoiceDrafts[invoice.id] ?? {};

    let initialAmount = "";
    if (existingDraft.amount !== undefined) {
      initialAmount = existingDraft.amount;
    } else {
      const parsed = Number(invoice?.amount);
      initialAmount = Number.isFinite(parsed) ? formatRupiahInput(Math.max(0, Math.round(parsed))) : "";
    }

    let rawStatus = String(existingDraft.status ?? invoice?.status ?? "belum_ditagih");
    if (!existingDraft.status) {
      const hasInvoiceFile = hasAnyUploadedInvoiceFile(invoice);
      const currentDueDate = String(existingDraft.dueDate ?? invoice?.dueDate ?? "");
      rawStatus = resolveAutoInvoiceStatus(rawStatus, hasInvoiceFile, currentDueDate);
    }

    return {
      invoiceNumber: String(existingDraft.invoiceNumber ?? invoice?.invoiceNumber ?? ""),
      dueDate: String(existingDraft.dueDate ?? invoice?.dueDate ?? ""),
      amount: initialAmount,
      status: rawStatus,
      followUps: existingDraft.followUps ?? {},
    };
  };

  const validateInvoiceDraftBase = (draft) => {
    if (!draft.dueDate) {
      return "Bulan jatuh tempo pembayaran wajib diisi sebelum upload invoice.";
    }

    const amount = parseRupiahInput(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Jumlah dibayar wajib diisi lebih dari 0 sebelum upload invoice.";
    }

    return null;
  };

  const validateInvoiceDraftForUpload = (draft) => {
    return validateInvoiceDraftBase(draft);
  };

  const hasInvoiceDraftChanges = (invoice, draft) => {
    const sourceAmount = Number(invoice?.amount);
    const currentAmount = Number.isFinite(sourceAmount) ? Math.max(0, Math.round(sourceAmount)) : 0;
    const draftAmount = parseRupiahInput(draft.amount);
    let selectedStatus = INVOICE_STATUS_OPTIONS.some((option) => option.value === draft.status)
      ? draft.status
      : "belum_ditagih";

    const hasInvoiceFile = hasAnyUploadedInvoiceFile(invoice);
    selectedStatus = resolveAutoInvoiceStatus(selectedStatus, hasInvoiceFile, draft.dueDate);

    let sourceStatus = String(invoice?.status ?? "belum_ditagih");
    sourceStatus = resolveAutoInvoiceStatus(sourceStatus, hasInvoiceFile, invoice?.dueDate);

    const hasFollowUpChanges = getInvoiceFollowUps(invoice).some((followUp) => (
      String(draft.invoiceNumber ?? "").trim() !== String(followUp?.invoiceNumber ?? "").trim()
    ));

    return (
      String(draft.invoiceNumber ?? "").trim() !== String(invoice?.invoiceNumber ?? "").trim() ||
      String(draft.dueDate ?? "") !== String(invoice?.dueDate ?? "") ||
      draftAmount !== currentAmount ||
      selectedStatus !== sourceStatus ||
      hasFollowUpChanges
    );
  };

  const handleSaveInvoiceRow = async (invoice, draftOverrides = {}) => {
    const draft = {
      ...getInvoiceDraft(invoice),
      ...draftOverrides,
    };
    const amount = parseRupiahInput(draft.amount);

    if (!Number.isFinite(amount) || amount < 0) {
      setInvoiceError("Jumlah dibayar harus berupa angka dan tidak boleh negatif.");
      return;
    }

    if (!hasInvoiceDraftChanges(invoice, draft)) {
      return;
    }

    const invoiceKey = String(invoice.id);
    if (savingInvoiceIdsRef.current.has(invoiceKey)) {
      return;
    }
    savingInvoiceIdsRef.current.add(invoiceKey);

    setIsSavingInvoice(true);
    setInvoiceError("");
    setInvoiceFeedback("");
    try {
      let selectedStatus = INVOICE_STATUS_OPTIONS.some((option) => option.value === draft.status)
        ? draft.status
        : "belum_ditagih";
      const hasInvoiceFile = hasAnyUploadedInvoiceFile(invoice);
      selectedStatus = resolveAutoInvoiceStatus(selectedStatus, hasInvoiceFile, draft.dueDate);
      const nextPaidAt = selectedStatus === "lunas"
        ? (invoice.paidAt || new Date().toISOString())
        : null;
      const followUpPayload = getInvoiceFollowUps(invoice).map((followUp) => ({
        id: followUp.id,
        invoiceNumber: String(draft.invoiceNumber ?? "").trim() || null,
      }));

      let persistedInvoice;
      if (isSchedulePlaceholder(invoice)) {
        persistedInvoice = await persistActiveInvoice(invoice, {
          dueDate: draft.dueDate || invoice.dueDate,
          amount,
          status: selectedStatus,
          paidAt: nextPaidAt,
          invoiceNumber: String(draft.invoiceNumber ?? "").trim() || null,
          scheduleStatus: "active",
        });
      } else {
        persistedInvoice = await tenantDetailData.invoices.update(invoice.id, {
          invoice_number: String(draft.invoiceNumber ?? "").trim() || null,
          due_date: draft.dueDate || null,
          amount,
          status: selectedStatus,
          paid_at: nextPaidAt,
        });
      }

      await Promise.all(
        followUpPayload.map((followUp) =>
          tenantDetailData.invoiceFollowUps.update(followUp.id, {
            invoice_number: followUp.invoiceNumber,
          }),
        ),
      );
      setInvoiceFeedback(`Invoice #${persistedInvoice.id} berhasil disimpan.`);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setInvoiceError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menyimpan invoice.",
      );
    } finally {
      savingInvoiceIdsRef.current.delete(invoiceKey);
      setIsSavingInvoice(false);
    }
  };

  const handleInvoiceAutoSave = (invoice, draftOverrides = {}) => {
    void handleSaveInvoiceRow(invoice, draftOverrides);
  };

  const handleInvoiceFileInputChange = async (event, invoice, type, splitOrder = null) => {
    const input = event.target;
    const file = input.files?.[0] ?? null;

    try {
      if (type === "payment-proof") {
        await handleUploadPaymentProof(invoice, file);
      } else {
        await handleUploadInvoiceFile(invoice, file, splitOrder);
      }
    } finally {
      input.value = "";
    }
  };

  const getOrCreateInvoiceFollowUp = async (invoice, splitOrder) => {
    const existingFollowUp = getInvoiceFollowUps(invoice).find(
      (followUp) => Number(followUp?.splitOrder ?? 0) === splitOrder,
    );

    if (existingFollowUp) {
      return existingFollowUp;
    }

    const splitMetaByOrder = {
      2: {
        triggerCode: "h_minus_3",
        title: "Peringatan H-3",
        description: "Invoice peringatan kedua sebelum akhir periode reminder pembayaran.",
      },
      3: {
        triggerCode: "manual_split_3",
        title: "Split Invoice Ke-3",
        description: "Invoice split ketiga untuk tindak lanjut pembayaran.",
      },
    };
    const splitMeta = splitMetaByOrder[splitOrder] ?? {
      triggerCode: "h_minus_7",
      title: "Reminder Bulan Jatuh Tempo",
      description: "Invoice peringatan pertama untuk bulan jatuh tempo pembayaran.",
    };

    return tenantDetailData.invoiceFollowUps.create({
      invoiceId: invoice.id,
      splitOrder,
      source: "manual",
      triggerCode: splitMeta.triggerCode,
      title: splitMeta.title,
      description: splitMeta.description,
      status: "warning",
    });
  };

  const handleUploadInvoiceFile = async (invoice, file, splitOrder = null) => {
    if (!file) {
      return;
    }

    const draft = getInvoiceDraft(invoice);
    const uploadInvoiceNumber = String(draft.invoiceNumber ?? "").trim();
    const validationMessage = validateInvoiceDraftForUpload(
      draft
    );
    if (validationMessage) {
      setInvoiceError(validationMessage);
      return;
    }



    const amount = parseRupiahInput(draft.amount);

    setIsSavingInvoice(true);
    setInvoiceError("");
    setInvoiceFeedback("");
    try {
      let persistedInvoice = invoice;
      if (isSchedulePlaceholder(invoice)) {
        persistedInvoice = await persistActiveInvoice(invoice, {
          dueDate: draft.dueDate || invoice.dueDate,
          amount,
          status: resolveAutoInvoiceStatus("belum_ditagih", true, draft.dueDate || invoice.dueDate),
          scheduleStatus: "active",
        });
      }

      const invoiceFileUrl = await uploadWithProgress(file, ["customers", customer.id, "invoices"]);
      if (splitOrder) {
        const followUp = await getOrCreateInvoiceFollowUp(persistedInvoice, splitOrder);
        await tenantDetailData.invoiceFollowUps.update(followUp.id, {
          invoiceNumber: uploadInvoiceNumber || null,
          invoiceFileUrl,
        });

        const newStatus = resolveAutoInvoiceStatus(persistedInvoice.status, true, draft.dueDate || invoice.dueDate);
        if (newStatus !== persistedInvoice.status) {
          await tenantDetailData.invoices.update(persistedInvoice.id, {
            status: newStatus,
          });
        }
      } else {
        const updatePayload = {
          invoiceNumber: uploadInvoiceNumber || null,
          dueDate: draft.dueDate,
          amount,
          invoiceFileUrl,
        };
        const newStatus = resolveAutoInvoiceStatus(persistedInvoice.status, true, draft.dueDate || invoice.dueDate);
        if (newStatus !== persistedInvoice.status) {
          updatePayload.status = newStatus;
        }
        await tenantDetailData.invoices.update(persistedInvoice.id, updatePayload);
      }

      const finalStatus = resolveAutoInvoiceStatus(persistedInvoice.status, true, draft.dueDate || invoice.dueDate);
      setInvoiceDrafts((prev) => ({
        ...prev,
        [persistedInvoice.id]: {
          ...prev[persistedInvoice.id],
          status: finalStatus,
        }
      }));
      setInvoiceFeedback(`Invoice #${invoice.id} berhasil diunggah.`);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setInvoiceError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengunggah invoice.",
      );
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleUploadPaymentProof = async (invoice, file) => {
    if (!file) {
      return;
    }

    if (!hasAnyUploadedInvoiceFile(invoice)) {
      setInvoiceError("Upload invoice terlebih dahulu sebelum upload bukti bayar.");
      return;
    }

    const draft = getInvoiceDraft(invoice);
    const validationMessage = validateInvoiceDraftBase(draft);
    if (validationMessage) {
      setInvoiceError(validationMessage);
      return;
    }

    setIsSavingInvoice(true);
    setInvoiceError("");
    setInvoiceFeedback("");
    try {
      const paymentProofFileUrl = await uploadWithProgress(file, ["customers", customer.id, "payment-proofs"]);
      const paidAt = new Date().toISOString();
      await tenantDetailData.invoices.update(invoice.id, {
        paymentProofFileUrl,
        paidAt,
        status: "lunas",
      });
      setDetail((previousDetail) => {
        if (!previousDetail || !Array.isArray(previousDetail.invoices)) {
          return previousDetail;
        }

        return {
          ...previousDetail,
          invoices: previousDetail.invoices.map((item) =>
            Number(item?.id) === Number(invoice.id)
              ? {
                ...item,
                status: "lunas",
                paidAt,
                paid_at: paidAt,
                paymentProofFileUrl,
                payment_proof_file_url: paymentProofFileUrl,
              }
              : item,
          ),
        };
      });
      setInvoiceDrafts((previousDrafts) => ({
        ...previousDrafts,
        [invoice.id]: {
          ...previousDrafts[invoice.id],
          status: "lunas",
        },
      }));
      setInvoiceFeedback(
        `Bukti bayar invoice #${invoice.id} berhasil diunggah.`,
      );
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setInvoiceError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengunggah bukti bayar.",
      );
    } finally {
      setIsSavingInvoice(false);
    }
  };



  const handleToggleSelectAllInvoices = () => {
    if (selectedInvoiceIds.size === displayInvoiceRows.length) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(displayInvoiceRows.map((row) => row.id)));
    }
  };

  const handleToggleSelectInvoice = (id) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyBulkInvoiceUpdates = async () => {
    if (!canManageTenantContracts) {
      setInvoiceError("Hanya admin yang dapat memperbarui invoice secara massal.");
      return;
    }

    const isSelectedMode = selectedInvoiceIds.size > 0;
    const targetInvoices = isSelectedMode
      ? invoiceRows.filter((row) => selectedInvoiceIds.has(row.id))
      : invoiceRows;

    if (targetInvoices.length === 0) {
      setInvoiceError(`Belum ada data ${isSelectedMode ? "terpilih" : "invoice"} untuk diperbarui.`);
      return;
    }

    const { dueDate, amount, status } = invoiceBulkForm;
    const hasDueDate = Boolean(dueDate);
    const hasAmount = Boolean(amount);
    const hasStatus = Boolean(status);

    if (!hasDueDate && !hasAmount && !hasStatus) {
      setInvoiceError("Isi setidaknya satu field untuk diperbarui secara massal.");
      return;
    }

    if (hasDueDate && !isValidIsoDate(dueDate)) {
      setInvoiceError("Tanggal batas bayar harus berupa tanggal valid.");
      return;
    }

    const requestedAmount = hasAmount ? parseRupiahInput(amount) : null;
    if (hasAmount && (!Number.isFinite(requestedAmount) || requestedAmount < 0)) {
      setInvoiceError("Nominal harus diisi dengan angka valid.");
      return;
    }

    setIsSavingInvoice(true);
    setInvoiceError("");
    setInvoiceFeedback("");

    try {
      const operations = targetInvoices.map((invoice) => {
        const updatePayload = {};
        if (hasDueDate) updatePayload.dueDate = dueDate;
        if (hasAmount) updatePayload.amount = requestedAmount;
        if (hasStatus) {
          updatePayload.status = status;
          updatePayload.paidAt = status === "lunas"
            ? (invoice.paidAt || new Date().toISOString())
            : null;
        }

        const promise = isSchedulePlaceholder(invoice)
          ? persistActiveInvoice(invoice, {
            ...updatePayload,
            dueDate: hasDueDate ? dueDate : invoice.dueDate,
            amount: hasAmount ? requestedAmount : Number(invoice.amount ?? 0),
            status: hasStatus ? status : String(invoice.status ?? "belum_ditagih"),
            scheduleStatus: "active",
          })
          : tenantDetailData.invoices.update(invoice.id, updatePayload);

        return { invoice, promise };
      });

      const operationResults = await Promise.allSettled(
        operations.map((operation) => operation.promise),
      );
      const successfulInvoices = operations
        .filter((_, index) => operationResults[index].status === "fulfilled")
        .map((operation) => operation.invoice);
      const failedResults = operationResults.filter((result) => result.status === "rejected");

      if (successfulInvoices.length > 0) {
        setInvoiceDrafts((previousDrafts) => {
          const nextDrafts = { ...previousDrafts };

          successfulInvoices.forEach((invoice) => {
            const previousDraft = previousDrafts[invoice.id] ?? {};
            nextDrafts[invoice.id] = { ...previousDraft };

            if (hasDueDate) nextDrafts[invoice.id].dueDate = dueDate;
            if (hasAmount) nextDrafts[invoice.id].amount = formatRupiahInput(requestedAmount);
            if (hasStatus) nextDrafts[invoice.id].status = status;
          });

          return nextDrafts;
        });
      }

      if (failedResults.length > 0) {
        const firstError = failedResults[0].reason;
        const firstErrorMessage = firstError instanceof Error
          ? firstError.message
          : "Sebagian invoice gagal diperbarui.";

        if (successfulInvoices.length === 0) {
          throw new Error(firstErrorMessage);
        }

        setInvoiceError(
          `Sebagian invoice gagal diperbarui (${failedResults.length}/${targetInvoices.length}). Detail pertama: ${firstErrorMessage}`,
        );
        setInvoiceFeedback(`Berhasil memperbarui ${successfulInvoices.length} dari ${targetInvoices.length} data invoice.`);
      } else {
        setInvoiceFeedback(`Berhasil memperbarui ${successfulInvoices.length} data invoice.`);
        setInvoiceBulkForm({ dueDate: "", amount: "", status: "" });
        if (isSelectedMode) {
          setSelectedInvoiceIds(new Set());
        }
      }

      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setInvoiceError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menerapkan pembaruan massal.",
      );
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleAddTenantRenewalSplit = async (row) => {
    if (!canManageTenantContracts) {
      setError("Hanya admin yang dapat menambah split tindak lanjut tenant.");
      return;
    }

    if (!row?.contractId || !row?.versionId) {
      setError(
        "Versi kontrak tenant belum tersedia untuk split tindak lanjut.",
      );
      return;
    }

    setError("");
    try {
      await tenantDetailData.contractVersionRenewalFollowUps.create(row.versionId);
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menambah split tindak lanjut tenant.",
      );
    }
  };

  const ensureContractRenewalVersionId = async (row) => {
    if (row?.versionId) {
      return row.versionId;
    }

    if (!row?.contractId || !contract) {
      throw new Error("Data kontrak tidak valid untuk upload perpanjangan.");
    }

    // Temukan versi aktif terakhir dari kontrak ini untuk mewarisi nominal
    const contractVersions = versions.filter(v => Number(v.contractId ?? v.contract_id) === Number(row.contractId));
    const latestVersion = contractVersions.length > 0
      ? [...contractVersions].sort((a, b) => Number(b.versionNumber ?? b.version_number ?? 0) - Number(a.versionNumber ?? a.version_number ?? 0))[0]
      : null;

    const fallbackMonthlyAmount = latestVersion?.monthlyAmount ?? latestVersion?.monthly_amount ?? 0;
    const fallbackYearlyAmount = latestVersion?.yearlyAmount ?? latestVersion?.yearly_amount ?? (fallbackMonthlyAmount * 12);

    const monthlyAmt = Number(row.monthlyAmount ?? contract?.monthlyAmount ?? contract?.monthly_amount ?? fallbackMonthlyAmount);
    const yearlyAmt = Number(
      row.yearlyAmount
      ?? contract?.yearlyAmount
      ?? contract?.yearly_amount
      ?? (latestVersion ? fallbackYearlyAmount : (monthlyAmt * 12))
    );

    const createdVersion = await tenantDetailData.contractVersions.create({
      contractId: row.contractId,
      customerId: customer.id,
      contractNumber: contract?.contractNumber ?? contract?.contract_number ?? null,
      startDate: row.periodStart ?? contract?.startDate ?? contract?.contract_start_date ?? null,
      endDate: row.periodEnd ?? contract?.endDate ?? contract?.contract_end_date ?? null,
      coreType: contract?.coreType ?? contract?.core_type ?? "core",
      coreTotal: Number(
        row.jumlahPaket
        ?? contract?.coreTotal
        ?? contract?.core_total
        ?? 0,
      ),
      sharedCoreRatio: contract?.sharingRatio ?? contract?.sharing_ratio ?? null,
      monthlyAmount: monthlyAmt,
      yearlyAmount: yearlyAmt,
    });

    return createdVersion.id;
  };

  const handleUploadTenantRenewal = async (row, file, followUpId = null) => {
    if (!canManageTenantContracts) {
      setError("Hanya admin yang dapat mengunggah perpanjangan tenant.");
      return;
    }

    if (!file || !row?.contractId) {
      return;
    }

    setError("");
    try {
      const versionId = await ensureContractRenewalVersionId(row);
      const renewalFileUrl = await uploadWithProgress(file, ["customers", customer.id, "renewals"]);
      if (followUpId) {
        await tenantDetailData.contractVersionRenewalFollowUps.update(followUpId, {
          renewal_file_url: renewalFileUrl,
          renewal_file_name: file.name,
          status: "pending_response",
        });
      } else {
        const followUp = await tenantDetailData.contractVersionRenewalFollowUps.create(versionId);
        await tenantDetailData.contractVersionRenewalFollowUps.update(followUp.id, {
          renewal_file_url: renewalFileUrl,
          renewal_file_name: file.name,
          status: "pending_response",
        });
      }
      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengunggah berkas perpanjangan tenant.",
      );
    }
  };

  const handleRespondTenantRenewal = async (
    row,
    decision,
    file,
    followUpId = null,
    packageOverrides = null,
    billingCycle = null,
    versionDates = null,
  ) => {
    if (!canManageTenantContracts) {
      setError("Hanya admin yang dapat mengunggah tanggapan perpanjangan tenant.");
      return;
    }

    if (!file || !row?.contractId) {
      return;
    }

    setError("");
    try {
      const invoiceIdsToArchiveAfterRenewal = billingCycle
        ? getActivePersistedInvoiceIdsForContract(row.contractId)
        : [];
      const versionId = await ensureContractRenewalVersionId(row);
      const responseFileUrl = await uploadWithProgress(file, ["customers", customer.id, "renewal-responses"]);
      const updatePayload = {
        response_file_url: responseFileUrl,
        response_file_name: file.name,
        response_status: decision,
        status: "completed",
      };
      if (packageOverrides) {
        updatePayload.packageOverrides = packageOverrides;
      }
      if (billingCycle) {
        updatePayload.billingCycle = billingCycle;
      }
      if (versionDates?.startDate) {
        updatePayload.startDate = versionDates.startDate;
      }
      if (versionDates?.endDate) {
        updatePayload.endDate = versionDates.endDate;
      }
      if (followUpId) {
        await tenantDetailData.contractVersionRenewalFollowUps.update(followUpId, updatePayload);
      } else {
        const followUp = await tenantDetailData.contractVersionRenewalFollowUps.create(versionId);
        await tenantDetailData.contractVersionRenewalFollowUps.update(followUp.id, updatePayload);
      }

      if (billingCycle) {
        await tenantDetailData.contracts.update(row.contractId, {
          billingEvery: billingCycle.every,
          billingUnit: billingCycle.unit,
        });
        await archiveActiveInvoicesForContract(row.contractId, invoiceIdsToArchiveAfterRenewal);
      }

      await Promise.all([loadDetail(), onRefreshAll?.()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengunggah tanggapan tenant.",
      );
    }
  };

  const hasInitialTenantRenewalUpload = (row) => {
    const followUps = Array.isArray(row?.renewalFollowUps)
      ? row.renewalFollowUps
      : [];
    return followUps.length > 0 && followUps.every((followUp) =>
      isOpenableFileUrl(followUp?.renewalFileUrl),
    );
  };

  const renderTenantRenewalFollowUps = (row, columnType) => {
    const followUps = Array.isArray(row?.renewalFollowUps)
      ? row.renewalFollowUps
      : [];

    if (!canManageTenantContracts) {
      const readonlyFollowUps = columnType === "response"
        ? followUps.filter((followUp) => isOpenableFileUrl(followUp?.responseFileUrl)).slice(-1)
        : followUps.filter((followUp) => isOpenableFileUrl(followUp?.renewalFileUrl));

      if (readonlyFollowUps.length === 0) {
        return <span className="text-[10px] font-black text-white/20">—</span>;
      }

      return (
        <div className="flex flex-col gap-1.5 items-center justify-center">
          {readonlyFollowUps.map((followUp) => (
            <button
              key={followUp.id}
              onClick={() => openSafeFile(
                columnType === "response" ? followUp.responseFileUrl : followUp.renewalFileUrl,
                columnType === "response" ? followUp.responseFileName : followUp.renewalFileName,
              )}
              className={`inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[8px] font-black uppercase tracking-widest transition-all shrink-0 ${columnType === "response"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-[#0f141e]"
                : "border-gold-accent/20 bg-gold-accent/10 text-gold-accent hover:bg-gold-accent hover:text-[#0f141e]"
                }`}
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {columnType === "response" ? "open_in_new" : "visibility"}
              </span>
              {columnType === "response" ? "Tanggapan" : "Lihat"}
            </button>
          ))}
        </div>
      );
    }

    if (followUps.length === 0) {
      if (columnType === "renewal") {
        return (
          <label className="relative inline-flex h-5 w-full justify-center items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>Upload Perpanjangan
            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => void handleUploadTenantRenewal(row, e.target.files?.[0] ?? null)} />
          </label>
        );
      }
      return <span className="text-[10px] font-black text-white/20">—</span>;
    }

    const itemsToRender = columnType === "response"
      ? (followUps.length > 0 ? [[...followUps].reverse().find(f => isOpenableFileUrl(f?.renewalFileUrl)) || followUps[followUps.length - 1]] : [])
      : followUps;

    return (
      <div className="flex flex-col gap-1.5 items-center justify-center w-full">
        {itemsToRender.map((followUp, index) => {
          const hasRenewalFile = isOpenableFileUrl(followUp?.renewalFileUrl);
          const hasResponseFile = isOpenableFileUrl(followUp?.responseFileUrl);
          const currentDecision = followUp?.responseStatus ?? "lanjut";
          const isLast = index === itemsToRender.length - 1;
          const isFirst = index === 0;

          return (
            <div key={followUp.id} className="flex flex-col gap-0.5 w-fit">
              <div className="w-[130px]">
                <span className={`block text-[7px] font-bold uppercase tracking-widest text-center ${columnType === "renewal" ? "text-white/40" : "text-transparent select-none"}`}>
                  Peringatan {index + 1}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1 backdrop-blur-md w-[130px] shrink-0">
                  {columnType === "renewal" ? (
                    <>
                      {hasRenewalFile ? (
                        <>
                          <button onClick={() => openSafeFile(followUp.renewalFileUrl, followUp.renewalFileName)} className="flex-1 w-full justify-center inline-flex h-5 items-center gap-1 rounded-md border border-gold-accent/20 bg-gold-accent/10 px-1 text-[8px] font-black uppercase tracking-widest text-gold-accent hover:bg-gold-accent hover:text-[#0f141e] transition-all">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>visibility</span>Lihat
                          </button>
                          <label className="flex-1 w-full justify-center relative inline-flex h-5 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>upload_file</span>Ganti
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => void handleUploadTenantRenewal(row, e.target.files?.[0] ?? null, followUp.id)} />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="w-full justify-center relative inline-flex h-5 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all cursor-pointer shrink-0">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>upload_file</span>Upload
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => void handleUploadTenantRenewal(row, e.target.files?.[0] ?? null, followUp.id)} />
                          </label>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {hasResponseFile ? (
                        <>
                          <button onClick={() => openSafeFile(followUp.responseFileUrl, followUp.responseFileName)} className="flex-1 w-full justify-center inline-flex h-5 items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1 text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500 hover:text-[#0f141e] transition-all">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>visibility</span>Lihat
                          </button>
                          <label className="flex-1 w-full justify-center relative inline-flex h-5 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>upload_file</span>Ganti
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => void handleRespondTenantRenewal(row, currentDecision, e.target.files?.[0] ?? null, followUp.id)} />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="flex-1 w-full justify-center relative inline-flex h-5 items-center gap-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1 text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500 hover:text-[#0f141e] transition-all cursor-pointer">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>Lanjut
                            <input
                              type="file"
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                if (!file) return;
                                const currentVersion = versions.find(v => v.id === row.versionId) ?? null;
                                const currentContract = contractsList.find(c => c.id === row.contractId) ?? null;
                                const prevCoreType = currentVersion?.coreType ?? currentVersion?.core_type ?? currentContract?.coreType ?? currentContract?.core_type ?? "core";
                                const prevCoreTotal = currentVersion?.coreTotal ?? currentVersion?.core_total ?? currentContract?.coreTotal ?? currentContract?.core_total ?? 1;
                                const prevRatio = currentVersion?.sharedCoreRatio ?? currentVersion?.shared_core_ratio ?? currentContract?.sharingRatio ?? currentContract?.sharing_ratio ?? "1/32";
                                const prevMonthlyAmount = currentVersion?.monthlyAmount ?? currentVersion?.monthly_amount ?? currentContract?.monthlyAmount ?? currentContract?.monthly_amount ?? 0;
                                const prevBillingEvery = currentContract?.billingEvery ?? currentContract?.billing_every ?? contract?.billingEvery ?? 1;
                                const prevBillingUnit = currentContract?.billingUnit ?? currentContract?.billing_unit ?? contract?.billingUnit ?? "bulan";

                                let nextStartDate = "";
                                let nextEndDate = "";
                                if (row.periodEnd) {
                                  const endDt = new Date(row.periodEnd);
                                  endDt.setDate(endDt.getDate() + 1);
                                  nextStartDate = endDt.toISOString().slice(0, 10);
                                  const endDt2 = new Date(nextStartDate);
                                  endDt2.setFullYear(endDt2.getFullYear() + 1);
                                  endDt2.setDate(endDt2.getDate() - 1);
                                  nextEndDate = endDt2.toISOString().slice(0, 10);
                                }

                                setRenewalConfirmData({
                                  row,
                                  decision: "lanjut",
                                  file,
                                  followUpId: followUp.id,
                                  usePreviousPackage: true,
                                  packageType: prevCoreType,
                                  coreTotal: prevCoreTotal,
                                  ratio: prevRatio,
                                  monthlyAmount: prevMonthlyAmount,
                                  billingMode: resolveBillingMode(prevBillingEvery, prevBillingUnit),
                                  billingEvery: String(prevBillingEvery ?? 1),
                                  billingUnit: String(prevBillingUnit ?? "bulan"),
                                  startDate: nextStartDate,
                                  endDate: nextEndDate,
                                });
                              }}
                            />
                          </label>
                          <label className="flex-1 w-full justify-center relative inline-flex h-5 items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>Tidak
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => void handleRespondTenantRenewal(row, "tidak", e.target.files?.[0] ?? null, followUp.id)} />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
                {columnType === "renewal" && canManageTenantContracts && (
                  <div className="flex items-center gap-1 w-[44px] shrink-0 justify-start">
                    {!isFirst ? (
                      <button
                        onClick={async () => {
                          if (window.confirm("Apakah Anda yakin ingin menghapus split tindak lanjut ini?")) {
                            try {
                              setIsActionLoading(true);
                              await tenantDetailData.contractVersionRenewalFollowUps.delete(followUp.id);
                              await loadDetail();
                              if (onRefreshAll) onRefreshAll();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Gagal menghapus split.");
                            } finally {
                              setIsActionLoading(false);
                            }
                          }
                        }}
                        className="h-5 w-5 shrink-0 rounded-md flex items-center justify-center border border-[#ff2400]/20 bg-[#ff2400]/10 text-[#ff2400] hover:bg-[#ff2400] hover:text-white transition-all"
                        title="Hapus split"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    ) : (
                      <div className="w-5 h-5 shrink-0" />
                    )}

                    {isLast && hasInitialTenantRenewalUpload(row) ? (
                      <button
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 shadow-sm"
                        disabled={!hasInitialTenantRenewalUpload(row)}
                        onClick={() => handleAddTenantRenewalSplit(row)}
                        type="button"
                        title="Tambah split perpanjangan"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                      </button>
                    ) : (
                      <div className="w-5 h-5 shrink-0" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (isPlannerJalurView) {
    return (
      <>
        <div className="relative z-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 font-manrope antialiased p-0 flex flex-col">
          {/* Map Container */}
          <div className="h-full w-full">
            <FoRoutePlanner
              disabled={routeBusy || !canManageRoute}
              initialControlPoints={previewRoutePoints}
              initialRouteMeta={activeRoutePlannerMeta}
              providerEntryPoints={availableIspEntryPoints}
              selectedProviderEntryPointIds={visibleTenantEntryPointIds}
              onApplyPlannedRoute={async (plannedPoints, plannerMeta) => {
                await handleApplyPlannedRoute(plannedPoints, plannerMeta);
                onBack?.();
              }}
              mode="full"
              providerIconUrl={primaryProviderIconUrl}
              customerIconUrl={detail?.logo_url || ""}
              customHeaderInfo={
                <header className="pointer-events-auto hidden sm:flex flex-col items-center gap-0.5 rounded-xl bg-slate-900/80 px-4 py-1.5 shadow-2xl backdrop-blur-md border border-white/10 max-w-[240px] md:max-w-[300px] text-center shrink-0">
                  <h1 className="text-[10px] md:text-xs font-black text-white uppercase tracking-[0.1em] truncate w-full">
                    {tenantName}
                  </h1>
                  <div className="flex items-center justify-center gap-1.5 md:gap-2 text-[8px] md:text-[9px] font-bold text-white/60 w-full">
                    <span className="rounded bg-primary/20 px-1 py-0.5 text-primary border border-primary/30 uppercase tracking-tighter shrink-0">
                      {packageInfo.paket === "sharing_core" ? "SHARING CORE" : "CORE"}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20 backdrop-blur-md shrink-0"></span>
                    <span className="uppercase tracking-widest truncate">
                      {providerDisplayName}
                    </span>
                  </div>
                </header>
              }
              customExitButton={
                <button
                  className="pointer-events-auto flex w-9 h-9 md:w-10 md:h-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/80 backdrop-blur-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 shadow-glass-depth transition-all"
                  onClick={onBack}
                  title="Tutup Planner"
                  type="button"
                >
                  <span className="material-symbols-outlined text-base md:text-lg">
                    meeting_room
                  </span>
                </button>
              }
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2 pb-24">
        {/* ══════ MOBILE STICKY HEADER (TABS) ══════ */}
        {!isTeknisi && (
          <div className="md:hidden fixed top-4 left-4 z-[45]">
            <div className="relative">
              <button
                onClick={() => setIsMobileTabMenuOpen(!isMobileTabMenuOpen)}
                className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 shadow-sm p-1.5 pl-3 pr-4 anim-surface hover:bg-white/20"
                type="button"
              >
                <span className="material-symbols-outlined text-base text-gold-accent">menu</span>
                <span className="text-[10px] font-black tracking-widest uppercase text-white">
                  {[
                    { id: "overview", label: "Ringkasan" },
                    { id: "contracts", label: "Kontrak" },
                    { id: "invoices", label: "Invoice" },
                    { id: "payment-realizations", label: "Realisasi" },
                    { id: "jalur", label: "Jalur" },
                    { id: "documents", label: "Dokumen" },
                    { id: "timeline", label: "Timeline" }
                  ].find(t => t.id === activeTab)?.label || "Menu"}
                </span>
              </button>

              {isMobileTabMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMobileTabMenuOpen(false)}></div>
                  <div className="absolute top-full left-0 mt-3 w-52 origin-top-left p-2 rounded-2xl glass-popover shadow-glass-depth z-50 flex flex-col gap-1 animate-in fade-in zoom-in duration-300">
                    {[
                      { id: "overview", label: "Ringkasan", icon: "dashboard" },
                      { id: "contracts", label: "Kontrak", icon: "description" },
                      { id: "invoices", label: "Invoice", icon: "receipt_long" },
                      { id: "payment-realizations", label: "Realisasi", icon: "payments" },
                      { id: "jalur", label: "Jalur", icon: "map" },
                      { id: "documents", label: "Dokumen", icon: "inventory_2" },
                      { id: "timeline", label: "Timeline", icon: "history" }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setIsMobileTabMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${activeTab === tab.id
                          ? 'bg-gold-accent/10 text-gold-accent border border-gold-accent/20'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">{tab.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Top Bar: Back & Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-gold-accent transition-all group"
              onClick={onBack}
              type="button"
            >
              <span className="material-symbols-outlined text-[10px] transition-transform group-hover:-translate-x-1">arrow_back</span>
              {backLabel}
            </button>
          </div>

          {!isTeknisi && (
            <div className="flex items-center gap-2">

              <button
                className="hidden md:flex h-7 px-3 items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all shadow-sm group text-[8px] font-black uppercase tracking-widest backdrop-blur-md"
                onClick={() => void Promise.all([loadDetail(), onRefreshAll?.()])}
                title="Refresh Data"
              >
                <span className="material-symbols-outlined text-[10px] group-hover:rotate-180 transition-transform duration-500">sync</span>
                Refresh
              </button>
              {canEditTenant && (
                <button
                  className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white transition-all shadow-sm text-[8px] font-black uppercase tracking-widest"
                  onClick={() => onEditTenant?.(detail ?? customer)}
                  title="Edit Tenant"
                >
                  <span className="material-symbols-outlined text-[10px]">edit_note</span>
                  Edit Lokasi
                </button>
              )}
              {canDeleteTenant && (
                <button
                  className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-[#ff2400]/10 border border-[#ff2400]/20 text-[#ff2400] hover:bg-[#ff2400] hover:text-white transition-all shadow-sm text-[8px] font-black uppercase tracking-widest"
                  onClick={handleOpenDeleteModal}
                  title="Hapus Tenant"
                >
                  <span className="material-symbols-outlined text-[10px]">delete_forever</span>
                  Hapus Lokasi
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── ISP POPUP STATE ─────────────────────────────────────── */}
        {ispPopupOpen && createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={() => setIspPopupOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[#0a0f18]/80 backdrop-blur-md" />

            {/* Modal */}
            <div
              className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1220]/95 shadow-2xl backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top accent */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-accent/40 to-transparent" />

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-accent/20 bg-gold-accent/10 text-gold-accent backdrop-blur-md">
                    <span className="material-symbols-outlined text-lg">corporate_fare</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/20">Penyedia Layanan</p>
                    <p className="text-sm font-black text-white uppercase tracking-tight">Akun ISP Terhubung</p>
                  </div>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white backdrop-blur-md"
                  onClick={() => setIspPopupOpen(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              <div className="h-px bg-white/[0.05]" />

              {/* ISP List */}
              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 no-scrollbar">
                {isps.length > 0 ? isps.map((ispItem) => (
                  <div
                    key={ispItem.id}
                    className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-gold-accent/20 hover:bg-white/[0.04]"
                  >
                    <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gold-accent/[0.03] blur-2xl transition-all group-hover:bg-gold-accent/[0.06]" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {ispItem.logoUrl ? (
                          <img
                            src={ispItem.logoUrl}
                            alt={ispItem.name}
                            className="h-10 w-10 rounded-xl object-cover border border-white/10 bg-white/5 shrink-0 backdrop-blur-md"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/30 backdrop-blur-md">
                            <span className="material-symbols-outlined text-xl">business</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-white uppercase tracking-wide truncate">{ispItem.name}</p>
                          {ispItem.contractReference && (
                            <p className="text-[9px] font-bold text-gold-accent/60 tracking-widest mt-0.5">
                              Ref: {ispItem.contractReference}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gold-accent/20 bg-gold-accent/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-gold-accent transition-all hover:bg-gold-accent hover:text-[#0f141e] backdrop-blur-md"
                        onClick={() => { setIspPopupOpen(false); onNavigate?.("isp-detail", ispItem); }}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                        Lihat
                      </button>
                    </div>
                    {/* Meta row */}
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 pl-[52px]">
                      {ispItem.status && (
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${ispItem.status === "aktif" ? "bg-emerald-400" : "bg-white/20"}`} />
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{ispItem.status}</span>
                        </div>
                      )}
                      {ispItem.contractPeriodEnd && (
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[10px] text-white/20">event</span>
                          <span className="text-[8px] font-bold text-white/30">s/d {formatDate(ispItem.contractPeriodEnd)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
                      <span className="material-symbols-outlined text-3xl text-white/20">corporate_fare</span>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Belum ada ISP terhubung</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="h-px bg-white/[0.05]" />
              <div className="px-6 py-4">
                <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest text-center">
                  {isps.length} ISP terhubung ke lokasi ini
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* ── PROFILE CARD ─────────────────────────────────────────── */}
        {(() => {
          const rawStatus = resolveCustomerOperationalStatus(detail ?? customer);
          // Contract status
          let cLabel = "Beroperasi";
          let cIcon = "check_circle";
          let cBg = "bg-emerald-500/10";
          let cBorder = "border-emerald-500/20";
          let cText = "text-emerald-400";
          if (rawStatus === "expired") {
            cLabel = "Belum Diperpanjang";
            cIcon = "warning";
            cBg = "bg-[#ff2400]/10";
            cBorder = "border-[#ff2400]/20";
            cText = "text-[#ff2400]";
          } else if (rawStatus === "belum_beroperasi") {
            cLabel = "Belum Beroperasi";
            cIcon = "schedule";
            cBg = "bg-sky-500/10";
            cBorder = "border-sky-500/20";
            cText = "text-sky-400";
          } else if (rawStatus === "berhenti") {
            cLabel = "Berhenti";
            cIcon = "cancel";
            cBg = "bg-white/5";
            cBorder = "border-white/10";
            cText = "text-white/30";
          }

          // Route status
          const rawR = rawStatus === "berhenti" || rawStatus === "nonaktif" || rawStatus === "belum_beroperasi" ? "nonaktif" : activeRouteStatus.toLowerCase();
          let rLabel = "Jalur Aktif";
          let rIcon = "cable";
          let rBg = "bg-emerald-500/10";
          let rBorder = "border-emerald-500/20";
          let rText = "text-emerald-400";
          if (rawR === "nonaktif") {
            rLabel = "Jalur Nonaktif";
            rIcon = "cable";
            rBg = "bg-white/5";
            rBorder = "border-white/10";
            rText = "text-white/30";
          } else if (rawR === "gangguan") {
            rLabel = "Jalur Gangguan";
            rIcon = "report";
            rBg = "bg-[#ff2400]/10";
            rBorder = "border-[#ff2400]/20";
            rText = "text-[#ff2400]";
          } else if (rawR === "sedang perbaikan") {
            rLabel = "Sedang Perbaikan";
            rIcon = "construction";
            rBg = "bg-amber-500/10";
            rBorder = "border-amber-500/20";
            rText = "text-amber-400";
          }

          const paketVal = packageInfo.paket === "sharing_core" ? "SHARING CORE" : "CORE";
          const jumlahVal = packageInfo.jumlah ?? "—";
          const alamatVal = detail?.alamat || customer?.alamat || null;
          const periodStart = contractPeriodInfo.contractPeriodStart;
          const periodEnd = contractPeriodInfo.contractPeriodEnd;

          return (
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl shadow-glass-depth">
              {/* Ambient glow */}
              <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-gold-accent/[0.04] blur-[100px]" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-blue-500/[0.03] blur-[80px]" />

              {/* Top accent line */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-accent/30 to-transparent" />

              <div className="relative p-4 md:p-5 pb-1 md:pb-1 space-y-3">

                {/* ── Row 1: Identity + Status ── */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: icon + label + name + ISP info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/20">Lokasi Operasional</p>
                    <h1 className="text-lg md:text-xl font-black tracking-tight text-white uppercase leading-tight">
                      {tenantName}
                    </h1>
                    <p className="text-[9px] font-black text-white/40 tracking-widest uppercase">
                      {formatDisplayContractNumber(versions?.[0]?.contractNumber ?? versions?.[0]?.contract_number ?? contract?.contractNumber ?? contract?.contract_number)}
                    </p>
                    {/* ISP info row */}
                    {!isIsp && (
                      <div className="flex items-center gap-3 pt-3">
                        <span className="material-symbols-outlined text-[15px] text-gold-accent/50">corporate_fare</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                          {providerDisplayName}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: status pills (Desktop Only) */}
                  <div className="hidden md:flex shrink-0 flex-wrap items-start gap-2">
                    {/* Contract status pill */}
                    <div className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 ${cBg} ${cBorder}`}>
                      <span className={`material-symbols-outlined text-[12px] ${cText}`}>{cIcon}</span>
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20">Kontrak</p>
                        <p className={`text-[9px] font-black uppercase tracking-widest ${cText}`}>{cLabel}</p>
                      </div>
                    </div>

                    {/* Route status pill */}
                    <div className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 ${rBg} ${rBorder}`}>
                      <span className={`material-symbols-outlined text-[12px] ${rText}`}>{rIcon}</span>
                      <div>
                        <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20">Jalur FO</p>
                        <p className={`text-[9px] font-black uppercase tracking-widest ${rText}`}>{rLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Container (Desktop always visible, Mobile is toggleable) */}
                <div className={`mt-2 md:mt-3 md:block space-y-2.5 md:space-y-3 ${isProfileExpanded ? 'block' : 'hidden'}`}>
                  {/* Divider */}
                  <div className="h-px bg-white/[0.05]" />

                  {/* ── Row 2: Metadata grid ── */}
                  <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:gap-y-3.5 sm:grid-cols-4 lg:grid-cols-4">
                    {/* Paket */}
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Paket</p>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <span className="material-symbols-outlined text-[10px] sm:text-[12px] scale-[0.75] sm:scale-100 origin-center text-gold-accent/60">package_2</span>
                        <p className="text-[11px] font-black text-white uppercase tracking-wide">{paketVal}</p>
                      </div>
                    </div>

                    {/* Jumlah */}
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Jumlah</p>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <span className="material-symbols-outlined text-[10px] sm:text-[12px] scale-[0.75] sm:scale-100 origin-center text-blue-400/60">speed</span>
                        <p className="text-[11px] font-black text-white uppercase tracking-wide">{jumlahVal}</p>
                      </div>
                    </div>

                    {/* Periode Awal Kontrak */}
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Periode Awal Kontrak</p>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <span className="material-symbols-outlined text-[10px] sm:text-[12px] scale-[0.75] sm:scale-100 origin-center text-emerald-400/60">event_available</span>
                        <p className="text-[11px] font-black text-white tracking-wide">
                          {contractPeriodInfo.contractStartDate ? formatDate(contractPeriodInfo.contractStartDate) : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Periode Berjalan */}
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Periode Berjalan</p>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <span className="material-symbols-outlined text-[10px] sm:text-[12px] scale-[0.75] sm:scale-100 origin-center text-sky-400/60">date_range</span>
                        <p className="text-[11px] font-black text-white tracking-wide font-mono">
                          {periodStart || periodEnd
                            ? <>{periodStart ? formatDate(periodStart) : "—"}<span className="mx-1.5 text-white/20 font-normal">—</span>{periodEnd ? formatDate(periodEnd) : "—"}</>
                            : "—"
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Row 3: Alamat (full width, only if exists) ── */}
                  {alamatVal && (
                    <div className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-gold-accent/40">pin_drop</span>
                      <div>
                        <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.35em] text-white/20">Alamat Fisik</p>
                        <p className="text-[11px] font-medium leading-relaxed text-white/50">{alamatVal}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Footer: Status + Toggle (Mobile Only) ── */}
                <div className="md:hidden mt-3 pt-2 pb-1 border-t border-white/[0.05] flex items-center justify-between">
                  {/* Left: Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {/* Contract status Badge */}
                    <div className={`flex items-center px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-sm ${cBg} ${cBorder} ${cText}`}>
                      <span className="text-[7px] font-black uppercase tracking-[0.2em]">{cLabel}</span>
                    </div>

                    {/* Route status Badge */}
                    <div className={`flex items-center px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-sm ${rBg} ${rBorder} ${rText}`}>
                      <span className="text-[7px] font-black uppercase tracking-[0.2em]">{rLabel}</span>
                    </div>
                  </div>

                  {/* Right: Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setIsProfileExpanded(!isProfileExpanded)}
                    className="flex items-center gap-1 text-[8.5px] font-black tracking-[0.2em] text-white/40 hover:text-gold-accent transition-colors"
                  >
                    {isProfileExpanded ? "Lebih Sedikit" : "Lebih Lengkap"}
                    <span className="material-symbols-outlined text-[10px]">{isProfileExpanded ? "expand_less" : "expand_more"}</span>
                  </button>
                </div>

              </div>

              {/* Bottom accent line */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            </div>
          );
        })()}

        {error && (
          <div className="rounded-2xl border border-[#ff2400]/20 bg-[#ff2400]/5 px-6 py-4 text-[11px] font-bold tracking-wide text-[#ff2400] animate-in fade-in slide-in-from-top-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-lg">error</span>
            {error}
          </div>
        )}

        {/* 2. TABS NAVIGATION */}
        {!isTeknisi && (
          <section className="hidden md:block glass-card backdrop-blur-xl rounded-2xl p-1 border-white/10 shadow-glass-depth relative overflow-hidden">
            <div className="absolute inset-0 bg-white/[0.02] pointer-events-none" />
            <nav className="relative flex flex-wrap gap-1">
              {[
                { id: "overview", label: "Ringkasan", icon: "dashboard" },
                { id: "contracts", label: "Kontrak", icon: "description" },
                { id: "invoices", label: "Invoice", icon: "receipt_long" },
                { id: "payment-realizations", label: "Realisasi", icon: "payments" },
                { id: "jalur", label: "Jalur", icon: "map" },
                { id: "documents", label: "Dokumen", icon: "inventory_2" },
                { id: "timeline", label: "Timeline", icon: "history" },
              ]
                .map((tab) => (
                  <button
                    key={tab.id}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[9px] font-black tracking-[0.1em] transition-all duration-500 relative overflow-hidden ${activeTab === tab.id ? "text-white bg-gold-accent shadow-gold-glow" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    <span className={`material-symbols-outlined relative z-10 ${activeTab === tab.id ? "scale-110 text-white" : ""}`} style={{ fontSize: "18px" }}>{tab.icon}</span>
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                ))}
            </nav>
          </section>
        )}

        {activeTab === "overview" && (
          <div className="flex flex-col gap-3 md:gap-4">
            {/* ── Row 1: Stats strip ─────────────────────────────────── */}
            <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">

              {/* Card 1: Invoice Bulanan */}
              <div className="glass-card rounded-xl px-3 py-2.5 border-white/10 shadow-glass-depth overflow-hidden relative">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gold-accent/50 via-gold-accent/20 to-transparent" />
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mb-1.5">Invoice Bulanan</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[22px] font-black text-white leading-none">{invoiceRows.length}</span>
                  <div className="text-right">
                    <p className="text-[8px] font-black text-emerald-400">{paidInvoiceCount}<span className="text-white/20">/{invoiceRows.length}</span></p>
                    <p className="text-[7px] text-white/30 font-bold uppercase tracking-widest">Lunas</p>
                  </div>
                </div>
                {!isIsp && !isTeknisi && (
                  <div className="mt-2 h-[2px] w-full rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${(paidInvoiceCount / (invoiceRows.length || 1)) * 100}%` }} />
                  </div>
                )}
              </div>

              {/* Card 2: Butuh Perhatian */}
              <div className={`glass-card rounded-xl px-3 py-2.5 border-white/10 shadow-glass-depth overflow-hidden relative`}>
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${totalActionItems > 0 ? 'from-amber-400/60 via-amber-400/20 to-transparent' : 'from-emerald-400/40 via-emerald-400/10 to-transparent'}`} />
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mb-1.5">Perhatian</p>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[22px] font-black leading-none ${totalActionItems > 0 ? 'text-amber-400' : 'text-white/20'}`}>{totalActionItems}</span>
                  <p className={`text-right text-[7.5px] font-black uppercase tracking-wide leading-tight whitespace-pre-line ${totalActionItems > 0 ? 'text-amber-400/80' : 'text-emerald-400/60'}`}>
                    {totalActionItems > 0 ? 'Perlu\nditindaklanjuti' : 'Semua\naman'}
                  </p>
                </div>
              </div>

              {/* Card 3: Biaya Aktivasi */}
              <div className="glass-card rounded-xl px-3 py-2.5 border-white/10 shadow-glass-depth overflow-hidden relative">
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${detail?.activationFeePaidAt ? 'from-emerald-400/60 via-emerald-400/20 to-transparent' : 'from-red-400/60 via-red-400/20 to-transparent'}`} />
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mb-1.5">Biaya Aktivasi</p>
                <div className="flex items-end justify-between gap-1 mb-1.5">
                  <span className={`text-[12px] font-black leading-none min-w-0 overflow-hidden ${detail?.activationFeePaidAt ? 'text-emerald-400' : 'text-red-400/80'}`} style={{ fontSize: 'clamp(9px, 2.5vw, 12px)' }}>
                    {formatCurrency(detail?.activationFeeAmount ?? customer?.activationFeeAmount)}
                  </span>
                  <span className={`shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${detail?.activationFeePaidAt ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                    {detail?.activationFeePaidAt ? 'Lunas' : 'Belum'}
                  </span>
                </div>
                {canEditTenant && (
                  <button
                    className={`h-5 w-full rounded flex items-center justify-center gap-1 text-[6.5px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${detail?.activationFeePaidAt ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-[#0f141e]'}`}
                    disabled={isMarkingActivationFeePaid}
                    onClick={() => detail?.activationFeePaidAt ? void handleRevertActivationFeePaid() : void handleMarkActivationFeePaid()}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[9px]">{detail?.activationFeePaidAt ? 'undo' : 'check'}</span>
                    {detail?.activationFeePaidAt ? 'Batalkan' : 'Tandai Lunas'}
                  </button>
                )}
              </div>

              {/* Card 4: Periode Tagihan */}
              <div className="glass-card rounded-xl px-3 py-2.5 border-white/10 shadow-glass-depth overflow-hidden relative">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-400/50 via-blue-400/20 to-transparent" />
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mb-1.5">Periode Tagihan</p>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[22px] font-black text-white leading-none">{billingEvery}</span>
                    <span className="text-[10px] font-black text-blue-400 uppercase ml-1">{billingUnitLabel}</span>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-blue-400/30">autorenew</span>
                </div>
              </div>

            </section>


            <section className="grid grid-cols-1 gap-3 md:gap-4 xl:grid-cols-[1fr_380px]">
              {/* Status Kelengkapan Berkas */}
              <div className="glass-card backdrop-blur-xl rounded-xl p-4 border-white/10 shadow-glass-depth relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-gold-accent/10 border border-gold-accent/20 flex items-center justify-center text-gold-accent backdrop-blur-md">
                    <span className="material-symbols-outlined text-[16px]">fact_check</span>
                  </div>
                  <div>
                    <h2 className="text-[13px] font-black text-white tracking-tight uppercase">Kelengkapan Berkas</h2>
                    <p className="text-[8px] font-bold text-white/40 tracking-wide mt-0.5">Kepatuhan administrasi sistem</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-0.5">
                  {allBerkasTodos.length > 0 ? (
                    <>
                      {paginatedPriorityTodos.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="h-px flex-1 bg-gradient-to-r from-red-500/40 to-transparent" />
                            <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">Prioritas Tinggi</span>
                          </div>
                          {paginatedPriorityTodos.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10 group/item hover:bg-red-500/10 transition-all backdrop-blur-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400/40"
                              onClick={() => handleOverviewTodoNavigation(item)}
                              onKeyDown={(event) => handleOverviewTodoKeyDown(event, item)}
                              role="button"
                              tabIndex={0}
                              title="Buka halaman penyelesaian"
                            >
                              <div className="flex gap-3">
                                <span className="material-symbols-outlined text-[16px] text-red-400 mt-0.5">error</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-black text-white group-hover/item:text-red-400 transition-colors truncate">{item.title}</p>
                                  <p className="text-[9px] font-bold text-white/40 leading-snug mt-0.5">{item.message}</p>
                                  {item.dueDate && (
                                    <div className="mt-2 flex items-center gap-1.5 text-[8px] font-black uppercase text-red-400/60">
                                      <span className="material-symbols-outlined text-[12px]">event_busy</span>
                                      Bulan jatuh tempo: {formatMonthYear(item.dueDate)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {paginatedNeedActionTodos.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="flex items-center gap-1.5">
                            <div className="h-px flex-1 bg-gradient-to-r from-amber-500/40 to-transparent" />
                            <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">Perlu Tindakan</span>
                          </div>
                          {paginatedNeedActionTodos.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10 group/item hover:bg-amber-500/10 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                              onClick={() => handleOverviewTodoNavigation(item)}
                              onKeyDown={(event) => handleOverviewTodoKeyDown(event, item)}
                              role="button"
                              tabIndex={0}
                              title="Buka halaman penyelesaian"
                            >
                              <div className="flex gap-3">
                                <span className="material-symbols-outlined text-[16px] text-amber-400 mt-0.5">warning</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-black text-white group-hover/item:text-amber-400 transition-colors truncate">{item.title}</p>
                                  <p className="text-[9px] font-bold text-white/40 leading-snug mt-0.5">{item.message}</p>
                                  {item.code === "contract_number_missing_local" && (
                                    <div
                                      className="mt-3 flex flex-wrap items-center gap-2"
                                      onClick={(event) => event.stopPropagation()}
                                      onKeyDown={(event) => event.stopPropagation()}
                                    >
                                      <div className="relative group/input flex-1 min-w-[150px]">
                                        <input
                                          className="w-full h-8 px-3 rounded-lg bg-black/40 border border-white/5 text-[10px] text-white focus:border-amber-500/50 focus:outline-none transition-all placeholder:text-white/10"
                                          onChange={(event) => setContractNumberInputs((previous) => ({ ...previous, overview: event.target.value }))}
                                          placeholder="Nomor kontrak..."
                                          type="text"
                                          value={contractNumberInputs.overview ?? ""}
                                        />
                                      </div>
                                      <button
                                        className="h-8 px-3 rounded-lg bg-amber-500 text-[#0f141e] text-[9px] font-black uppercase tracking-widest shadow-gold-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                        disabled={isSavingContractNumber}
                                        onClick={() => void handleSaveContractNumber({ id: "overview", contractId: contract?.id })}
                                      >
                                        {isSavingContractNumber ? "Saving..." : "Simpan"}
                                      </button>
                                      <button
                                        className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-white/40 text-[8px] font-black uppercase tracking-widest hover:bg-white/10 transition-all backdrop-blur-md"
                                        disabled={!primaryContractRowMarkerId || isSavingContractNumber}
                                        onClick={() => primaryContractRowMarkerId && toggleContractNumberEmptyMark(primaryContractRowMarkerId)}
                                      >
                                        Tandai Kosong
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {allBerkasTodos.length > 10 && (
                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                          <div className="flex items-center gap-3">
                            <div className="relative z-[50] w-12">
                              <div className="relative group h-8 rounded-lg bg-white/5 border border-white/10 focus-within:border-gold-accent/40 focus-within:bg-black/40 transition-all backdrop-blur-md">
                                <CustomDropdown
                                  value={berkasItemsPerPage}
                                  onChange={(val) => { setBerkasItemsPerPage(Number(val)); setBerkasCurrentPage(1); }}
                                  options={[10, 20, 50, 100].map(n => ({ value: n, label: String(n) }))}
                                  triggerClass="text-[8px] font-black uppercase tracking-widest text-white/50 group-hover:text-white px-3 cursor-pointer text-center"
                                  position="top"
                                  hideArrow={true}
                                  itemAlign="center"
                                  menuWidth="min-w-[60px]"
                                />
                              </div>
                            </div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/30 hidden xs:block">
                              {berkasStartIndex + 1}–{Math.min(berkasStartIndex + berkasItemsPerPage, allBerkasTodos.length)} dari {allBerkasTodos.length}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                            <button
                              className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-[8px] font-black uppercase tracking-widest text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 backdrop-blur-md"
                              type="button" disabled={berkasCurrentPage <= 1} onClick={() => handleBerkasPageChange(Math.max(1, berkasCurrentPage - 1))}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_left</span> Prev
                            </button>

                            <div
                              ref={berkasPaginationRef}
                              onScroll={handleBerkasPaginationScroll}
                              className="flex items-center gap-1.5 w-[96px] justify-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden"
                              style={{ scrollbarWidth: 'none' }}
                            >
                              <div className="shrink-0 w-7 h-7 snap-center pointer-events-none opacity-0"></div>

                              {berkasPageNumbers.map((page) => {
                                const distance = Math.abs(berkasCurrentPage - page);
                                const isActive = distance === 0;

                                let scaleClass = "scale-100 opacity-100 z-10";
                                if (distance === 1) scaleClass = "scale-90 opacity-70 z-0";
                                if (distance > 1) scaleClass = "scale-75 opacity-30 -z-10";

                                return (
                                  <button
                                    key={`berkas-page-${page}`}
                                    onClick={() => handleBerkasPageChange(page)}
                                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 snap-center ${isActive ? "bg-gold-accent text-white shadow-lg shadow-gold-accent/20" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"} ${scaleClass}`}
                                    type="button"
                                  >
                                    {page}
                                  </button>
                                );
                              })}

                              <div className="shrink-0 w-7 h-7 snap-center pointer-events-none opacity-0"></div>
                            </div>

                            <button
                              className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-[8px] font-black uppercase tracking-widest text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 backdrop-blur-md"
                              type="button" disabled={berkasCurrentPage >= berkasTotalPages} onClick={() => handleBerkasPageChange(Math.min(berkasTotalPages, berkasCurrentPage + 1))}
                            >
                              Next <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_right</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2.5 backdrop-blur-md">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 backdrop-blur-md">
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                      </div>
                      <p className="text-xs font-black text-emerald-400 tracking-tight leading-tight">Seluruh berkas lengkap & terverifikasi</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kanan: Biaya Aktivasi + Jejak Aktivitas */}
              <div className="flex flex-col gap-3 md:gap-4">
                {/* Nominal Bulanan & Tahunan */}
                <div className="glass-card backdrop-blur-xl rounded-xl p-4 border-white/10 shadow-glass-depth">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-xl bg-gold-accent/10 border border-gold-accent/20 flex items-center justify-center text-gold-accent shrink-0 backdrop-blur-md">
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                    </div>
                    <div>
                      <h2 className="text-[13px] font-black text-white tracking-tight uppercase">Nominal Layanan</h2>
                      <p className="text-[8px] font-bold text-white/40 tracking-wide mt-0.5">Hitungan & Estimasi Tagihan</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col gap-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Bulanan</p>
                      <p className="text-[14px] font-black text-white tracking-tighter">{formatCurrency(invoiceRows?.[0]?.amount ?? 0)}</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col gap-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Tahunan</p>
                      <p className="text-[14px] font-black text-white tracking-tighter">{formatCurrency((invoiceRows?.[0]?.amount ?? 0) * 12)}</p>
                    </div>
                  </div>
                </div>

                {/* Jejak Aktivitas */}
                <div className="glass-card backdrop-blur-xl rounded-xl p-4 border-white/10 shadow-glass-depth">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 backdrop-blur-md">
                      <span className="material-symbols-outlined text-[16px]">history</span>
                    </div>
                    <div>
                      <h2 className="text-[13px] font-black text-white tracking-tight uppercase">Jejak Aktivitas</h2>
                      <p className="text-[8px] font-bold text-white/40 tracking-wide mt-0.5">Riwayat operasional terakhir</p>
                    </div>
                  </div>
                  {displayTimeline.length > 0 ? (
                    <div className="space-y-2">
                      {displayTimeline.slice(0, 6).map((event, idx) => (
                        <div key={event.id} className="p-2.5 rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all flex items-start gap-2.5 group/item">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${idx === 0 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-white/20'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-[10px] font-black text-white uppercase tracking-tight truncate group-hover/item:text-emerald-400 transition-colors">{event.title}</h4>
                              <p className="text-[7.5px] font-black text-white/30 uppercase tracking-widest shrink-0">{formatDate(event.date)}</p>
                            </div>
                            <p className="text-[9.5px] font-medium text-white/40 leading-normal mt-0.5 line-clamp-2">{event.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center border border-dashed border-white/5 rounded-xl">
                      <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest">Belum ada aktivitas tercatat</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "jalur" && (
          <div className={`flex flex-col gap-4 ${isTeknisi ? "mt-4" : ""}`}>
            <FoRoutePlanner
              mode="preview"
              onPreviewClick={canManageRoute ? () => onOpenRoutePlanner?.(detail ?? customer) : undefined}
              previewGeometryCoordinates={previewGeometryCoordinates}
              previewRoads={previewRoads}
              previewPoints={previewRoutePoints}
              providerEntryPoints={availableIspEntryPoints}
              selectedProviderEntryPointIds={visibleTenantEntryPointIds}
              providerIconUrl={primaryProviderIconUrl}
              customerIconUrl={detail?.logo_url || ""}
            />

            {/* Unified Route Management Card */}
            <section className="glass-card backdrop-blur-xl rounded-xl border border-white/10 shadow-glass-depth overflow-hidden relative bg-white/[0.02]">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

              {/* Header Section */}
              <div className="px-4 py-2.5 lg:px-5 lg:py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-lg text-blue-400 drop-shadow-md">conversion_path</span>
                    <div className="space-y-0.5">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.1em] text-white drop-shadow-md">Manajemen Jalur Lintasan</h3>
                      <p className="text-[9px] font-bold text-white/40 tracking-wide">Konfigurasi infrastruktur fiber optik</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2.5 w-full lg:w-auto border-t border-white/5 pt-2.5 mt-1 lg:border-none lg:pt-0 lg:mt-0">
                    <div className="flex items-center justify-end gap-2 w-full lg:w-auto mr-0 lg:mr-2">
                      <span className="text-[8px] font-black text-white/40 bg-white/5 px-3 py-1 rounded-md uppercase tracking-widest border border-white/10">
                        {(isRouteDrafting ? draftRoutePoints : routePoints).filter((point) => point.pointType !== "transit").length} Titik
                      </span>
                      <span className="text-[8px] font-black text-blue-400/70 bg-blue-500/10 px-3 py-1 rounded-md uppercase tracking-widest border border-blue-500/20">
                        {displayNamedRoads.length} Ruas Aktif
                      </span>
                    </div>
                    {(!isRouteDrafting || !canManageRoute) ? (
                      <>
                        {!isPlannerJalurView && canManageRoute && (
                          <button
                            className="h-7 px-3.5 flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-sm text-[8px] font-black uppercase tracking-widest group"
                            onClick={() => onOpenRoutePlanner?.(detail ?? customer)}
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[10px] group-hover:rotate-12 transition-transform">conversion_path</span>
                            Atur Jalur
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                        <div className="flex flex-col items-end mr-1">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gold-accent animate-pulse">Mode Draft Aktif</span>
                        </div>
                        <button
                          className="h-7 px-3 rounded-lg border border-white/10 bg-white/5 text-white/40 text-[8px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                          onClick={cancelDraftingSession}
                          type="button"
                        >
                          Batal
                        </button>
                        <button
                          className="h-7 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-[#0f141e] transition-all disabled:opacity-50 flex items-center gap-1.5"
                          onClick={() => void handleCommitDraft()}
                          disabled={routeBusy}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                          {routeBusy ? "Menyimpan..." : "Aktifkan"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {!canManageRoute && (
                  <div className="mt-3 hidden md:block rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-[9px] font-black uppercase tracking-widest text-sky-200 shadow-inner">
                    Mode lihat saja: role ini tidak dapat mengubah titik maupun jalur peta.
                  </div>
                )}
                {canManageRoute && isRouteDrafting && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 animate-in zoom-in-95 duration-300 shadow-inner">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <div className="flex-1 w-full space-y-1">
                        <label className="block text-[8px] font-black uppercase tracking-widest text-amber-400/80">Alasan Perubahan / Catatan (Wajib)</label>
                        <div className="relative group">
                          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500/50 text-[14px]">draw</span>
                          <input
                            className="w-full rounded-lg border border-amber-500/20 bg-black/40 pl-8 pr-3 py-1.5 text-[9px] font-semibold text-white focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 shadow-inner transition-all placeholder:text-white/20"
                            onChange={(event) => setRouteChangeNote(event.target.value)}
                            placeholder="Contoh: Penyesuaian jalur akibat pembangunan jalan baru atau upgrade kabel..."
                            type="text"
                            value={routeChangeNote}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {(routeError || routeFeedback) && (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-[10px] font-bold animate-in slide-in-from-top-2 shadow-sm flex items-center gap-2 ${routeError ? "border-rose-500/20 bg-rose-500/10 text-rose-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
                    <span className="material-symbols-outlined text-[14px]">{routeError ? 'error' : 'check_circle'}</span>
                    {routeError || routeFeedback}
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div className="relative bg-black/40">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                <div className="overflow-x-auto relative z-10 pb-2">
                  {(() => {
                    const activePoints = isRouteDrafting ? draftRoutePoints : routePoints;
                    const startPoints = activePoints.filter(p => p.pointType === "awal");
                    const endPoints = activePoints.filter(p => p.pointType === "tujuan");

                    const combinedItems = [
                      ...startPoints.map(p => ({ ...p, _rowType: 'point' })),
                      ...displayNamedRoads.map((r, i) => ({ ...r, _rowType: 'road', _index: i })),
                      ...endPoints.map(p => ({ ...p, _rowType: 'point' }))
                    ];

                    if (combinedItems.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center min-h-[220px] gap-3 text-center px-4">
                          <div className="h-12 w-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mb-1">
                            <span className="material-symbols-outlined text-[20px] text-white/20">conversion_path</span>
                          </div>
                          <p className="text-[10px] font-bold text-white/30 tracking-widest">Belum ada jalur FO terdaftar.</p>
                        </div>
                      );
                    }

                    return isDesktopViewport ? (
                      <div className="w-full">
                          <table className="w-full text-left">
                            <thead className="bg-white/[0.03] border-b border-white/5">
                              <tr>
                                <th className="pl-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/50 w-40">Status</th>
                                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/50">Nama Lokasi</th>
                                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/50">Panduan</th>
                                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/50 w-28">Jarak</th>
                                <th className="pr-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white/50 text-right w-24">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.02]">
                              {combinedItems.map((item, index) => {
                                if (item._rowType === 'point') {
                                  const point = item;
                                  return (
                                    <tr key={`point-${point.id}`} className="hover:bg-white/[0.03] transition-colors group/row relative">
                                      <td className="pl-5 py-3 align-middle">
                                        <div className="flex items-center gap-2">
                                          <div className={`w-7 h-7 shrink-0 rounded border flex items-center justify-center shadow-sm ${point.pointType === 'awal' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                            point.pointType === 'tujuan' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'
                                            }`}>
                                            <span className="material-symbols-outlined text-[14px]">{routePointTypeMeta[point.pointType]?.icon}</span>
                                          </div>
                                          <span className={`text-[10px] font-black uppercase tracking-widest ${point.pointType === "awal" ? "text-blue-400" :
                                            point.pointType === "tujuan" ? "text-emerald-400" :
                                              "text-white/50"
                                            }`}>
                                            {routePointTypeLabelMap[point.pointType]}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 min-w-[200px] align-middle">
                                        <p className="text-[11px] font-black text-white tracking-tight">
                                          {point.pointType === 'tujuan' ? (tenantName || point.pathName) :
                                            point.pointType === 'awal' ? (isps.length > 0 ? `ISP: ${isps.map(i => i.name).join(', ')}` : point.pathName) :
                                              point.pathName}
                                        </p>
                                      </td>
                                      <td className="px-4 py-3 align-middle">
                                        <p className="text-[10px] font-bold text-white/40 italic group-hover/row:text-white/70 transition-colors max-w-[200px] truncate">
                                          {splitRoutePointNote(point.note).displayNote || "—"}
                                        </p>
                                      </td>
                                      <td className="px-4 py-3 align-middle">
                                        <span className="text-[11px] font-bold text-white/20">—</span>
                                      </td>
                                      <td className="pr-5 py-3 text-right align-middle">
                                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                          <button
                                            className="w-7 h-7 rounded bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-10 backdrop-blur-md"
                                            disabled={!canManageRoute || routeBusy || point.pointType !== "transit"}
                                            onClick={() => handleMoveRoutePoint(point.id, "up")}
                                            title="Geser ke atas"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">expand_less</span>
                                          </button>
                                          <button
                                            className="w-7 h-7 rounded bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-10 backdrop-blur-md"
                                            disabled={!canManageRoute || routeBusy || point.pointType !== "transit"}
                                            onClick={() => handleMoveRoutePoint(point.id, "down")}
                                            title="Geser ke bawah"
                                          >
                                            <span className="material-symbols-outlined text-[15px]">expand_more</span>
                                          </button>
                                          <div className="w-px h-4 bg-white/10 mx-0.5" />
                                          <button
                                            className="w-7 h-7 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-10"
                                            disabled={!canManageRoute || routeBusy || point.pointType !== "transit"}
                                            onClick={() => void handleDeleteRoutePoint(point.id)}
                                            title="Hapus titik"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">delete</span>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                } else {
                                  const road = item;
                                  return (
                                    <tr key={`road-${road.id || index}`} className="hover:bg-white/[0.03] transition-colors group/row bg-blue-500/[0.02]">
                                      <td className="pl-5 py-2.5 align-middle">
                                        <div className="flex items-center gap-2 pl-2">
                                          <div className="flex flex-col items-center justify-center gap-1 w-3 opacity-40 group-hover/row:opacity-100 transition-opacity">
                                            <div className="w-[1.5px] h-1.5 bg-blue-400/30 rounded-full" />
                                            <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]" />
                                            <div className="w-[1.5px] h-1.5 bg-blue-400/30 rounded-full" />
                                          </div>
                                          <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest opacity-60 group-hover/row:opacity-100 transition-opacity ml-1.5">
                                            Ruas Jalan
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 min-w-[200px] align-middle">
                                        <div className="flex items-center gap-2 opacity-80 group-hover/row:opacity-100 transition-opacity">
                                          <span className="text-[11px] font-black text-blue-200 tracking-tight">{road.name}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 align-middle">
                                        <span className="text-[10px] font-bold text-white/40 italic group-hover/row:text-white/70 transition-colors uppercase tracking-widest max-w-[250px] truncate block">
                                          {road?.instruction || "—"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 align-middle">
                                        <span className="text-[11px] font-mono font-black text-blue-400/70 group-hover/row:text-blue-400 transition-colors">
                                          {Number.isFinite(Number(road?.distance)) && Number(road.distance) > 0 ? `${(Number(road.distance) / 1000).toFixed(2)} km` : "—"}
                                        </span>
                                      </td>
                                      <td className="pr-5 py-2.5 text-right align-middle">
                                        <div className="flex items-center justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                                          <button
                                            className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 hover:bg-blue-500 hover:text-white transition-all disabled:opacity-10 backdrop-blur-md"
                                            onClick={() => {
                                              alert(`Fitur ubah penamaan ruas jalan (${road.name}) tanpa mengubah titik koordinat akan segera tersedia.`);
                                            }}
                                            title="Ubah Nama Jalan"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">edit</span>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }
                              })}
                            </tbody>
                          </table>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 relative z-10 px-2.5 mt-0 pb-2.5">
                          {combinedItems.map((item, index) => {
                            if (item._rowType === 'point') {
                              const point = item;
                              return (
                                <div key={`point-mobile-${point.id}`} className="glass-card rounded-xl border border-white/10 p-2 shadow-glass-depth transition-all flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center shadow-sm ${point.pointType === 'awal' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : point.pointType === 'tujuan' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
                                      <span className="material-symbols-outlined text-[14px]">{routePointTypeMeta[point.pointType]?.icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                      <span className={`text-[8.5px] font-black uppercase tracking-widest ${point.pointType === "awal" ? "text-blue-400" : point.pointType === "tujuan" ? "text-emerald-400" : "text-white/50"}`}>{routePointTypeLabelMap[point.pointType]}</span>
                                      <p className="text-[12px] font-black text-white tracking-tight truncate mt-0.5">
                                        {point.pointType === 'tujuan' ? (tenantName || point.pathName) : point.pointType === 'awal' ? (isps.length > 0 ? `ISP: ${isps.map(i => i.name).join(', ')}` : point.pathName) : point.pathName}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="bg-white/[0.02] rounded-lg border border-white/5 px-2 py-1">
                                    <p className="text-[7.5px] font-black text-white/30 uppercase tracking-widest mb-1">Panduan Lokasi</p>
                                    <p className="text-[9.5px] font-bold text-white/70 leading-relaxed italic">
                                      {splitRoutePointNote(point.note).displayNote || "Tidak ada panduan khusus."}
                                    </p>
                                  </div>
                                </div>
                              );
                            } else {
                              const road = item;
                              return (
                                <div key={`road-mobile-${road.id || index}`} className="glass-card rounded-xl border border-blue-500/20 bg-blue-500/[0.02] p-2 shadow-glass-depth flex items-center gap-2">
                                  <div className="flex flex-col items-center justify-center gap-0.5 w-7 shrink-0">
                                    <div className="w-[1.5px] h-1.5 bg-blue-400/30 rounded-full" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                                    <div className="w-[1.5px] h-1.5 bg-blue-400/30 rounded-full" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[8.5px] font-black text-blue-400/60 uppercase tracking-widest block mb-0.5">Ruas Jalan</span>
                                    <p className="text-[11.5px] font-black text-blue-200 tracking-tight truncate">{road.name}</p>
                                    {road?.instruction && (
                                      <p className="text-[9.5px] font-bold text-white/50 italic mt-0.5 truncate">{road.instruction}</p>
                                    )}
                                  </div>
                                  <div className="shrink-0 text-right bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg">
                                    <span className="text-[10px] font-mono font-black text-blue-400 block">
                                      {Number.isFinite(Number(road?.distance)) && Number(road.distance) > 0 ? `${(Number(road.distance) / 1000).toFixed(2)} km` : "—"}
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                          })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
            {/* Riwayat Jalur Section */}
            <section className="glass-card backdrop-blur-xl rounded-xl border border-white/10 shadow-glass-depth overflow-hidden relative">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

              <div className="px-4 py-2.5 lg:px-5 lg:py-4 border-b border-white/5 bg-white/[0.02] flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4 relative z-10">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-lg text-amber-400 drop-shadow-md">history_edu</span>
                  <div className="space-y-0.5">
                    <h2 className="text-[13px] font-black text-white tracking-[0.1em] uppercase drop-shadow-md">Ledger Perubahan Jalur</h2>
                    <p className="text-[9px] font-bold text-white/40 tracking-wide">Jejak audit & histori topologi</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2 w-full lg:w-auto border-t border-white/5 pt-2.5 mt-1 lg:border-none lg:pt-0 lg:mt-0">
                  <div className="flex -space-x-px shadow-sm">
                    <div className="h-6 md:h-8 px-2 md:px-3 rounded-l-lg bg-white/5 border border-white/10 flex items-center text-[8px] md:text-[9px] font-black text-white/40 uppercase tracking-widest backdrop-blur-md z-10 relative">{routeHistoryRows.length} Log</div>
                    <div className="h-6 md:h-8 px-2 md:px-3 rounded-r-lg bg-amber-500/10 border border-amber-500/20 flex items-center text-[8px] md:text-[9px] font-black text-amber-400 uppercase tracking-widest relative">{routeVersions.length} Versi</div>
                  </div>
                  <button
                    className="h-6 md:h-8 px-2.5 md:px-4 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-[8px] md:text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-rose-500/5 disabled:hover:text-rose-400 backdrop-blur-md shadow-sm"
                    disabled={routeBusy || routeHistoryRows.length === 0}
                    onClick={() => void handleDeleteAllHistory()}
                    type="button"
                  >
                    Reset Ledger
                  </button>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto custom-scrollbar relative z-10 p-2.5 lg:p-4 bg-black/40">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
                {routeHistoryRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[160px] gap-3 text-center px-4">
                    <div className="h-12 w-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mb-1">
                      <span className="material-symbols-outlined text-[20px] text-white/20">history_toggle_off</span>
                    </div>
                    <p className="text-[10px] font-bold text-white/30 tracking-widest">Arsip riwayat masih kosong.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {routeHistoryRows.map((item) => {
                      const isExpanded = expandedHistoryIds.includes(item.id);
                      return (
                        <div key={item.id} className={`rounded-xl transition-all duration-300 border ${isExpanded ? 'bg-white/[0.03] border-white/10 shadow-sm' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}>
                          <div
                            className="px-2.5 py-2 flex flex-col md:flex-row md:items-center justify-between gap-1.5 cursor-pointer group/header"
                            onClick={() => toggleHistoryExpand(item.id)}
                          >
                            <div className="flex items-start md:items-center gap-2 md:gap-3">
                              <div className={`h-6 w-6 md:h-8 md:w-8 shrink-0 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-amber-500 text-[#0f141e] shadow-sm' : 'bg-white/5 border border-white/10 text-white/40 group-hover/header:text-white group-hover/header:border-white/20'}`}>
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tight">V{item.changeNumber}</span>
                              </div>
                              <div className="min-w-0">
                                <h4 className={`text-[11px] font-black uppercase tracking-tight transition-colors truncate ${isExpanded ? 'text-amber-400' : 'text-white group-hover/header:text-amber-400'}`}>
                                  {item.changeReason || "Pemutakhiran Jalur Rutin"}
                                </h4>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">{formatDateTime(item.createdAt)}</span>
                                  {/* Operator inline on mobile */}
                                  <span className="md:hidden inline-flex items-center gap-1 text-[8px] font-bold text-white/40 uppercase bg-white/5 px-1.5 py-0.5 rounded">
                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>person</span>
                                    {item.actorName || "SYSTEM"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-3 w-full md:w-auto mt-1 md:mt-0">
                              <div className="text-right hidden md:block">
                                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Operator</p>
                                <p className="text-[9px] font-bold text-white/60 uppercase tracking-tight mt-0.5">{item.actorName || "SYSTEM"}</p>
                              </div>
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center border transition-all shrink-0 ${isExpanded ? 'bg-white/10 border-white/20 text-white rotate-180' : 'bg-white/5 border-white/10 text-white/30 group-hover/header:text-white group-hover/header:border-white/20'}`}>
                                <span className="material-symbols-outlined text-[14px]">expand_more</span>
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 animate-in slide-in-from-top-2 duration-300">
                              <div className="h-px bg-white/5 mb-2 w-full" />
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-gold-accent text-[12px]">alt_route</span>
                                    <p className="text-[8px] font-black text-gold-accent uppercase tracking-widest">Topologi Lintasan</p>
                                  </div>
                                  <div className="relative pl-3 ml-1.5 space-y-1.5 border-l-2 border-white/5">
                                    {item.points.map((p, idx) => (
                                      <div key={p.id} className="relative flex items-center gap-2 group/p">
                                        <div className={`absolute -left-[16px] w-1.5 h-1.5 rounded-full border border-[#0f141e] ${idx === 0 ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]' : idx === item.points.length - 1 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-white/30'}`} />
                                        <div className="flex-1 px-2 py-1 rounded-md bg-white/[0.02] border border-white/5 group-hover/p:bg-white/[0.04] transition-colors">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] font-black text-white/60 uppercase tracking-tight truncate">{p.pathName}</span>
                                            <span className="text-[7px] font-bold text-white/20 uppercase tracking-widest shrink-0">{routePointTypeLabelMap[p.pointType]}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-blue-400 text-[12px]">info</span>
                                    <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Informasi Tambahan</p>
                                  </div>
                                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <p className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1.5">Metadata Perubahan</p>
                                    <p className="text-[9px] font-bold text-white/50 leading-relaxed italic">
                                      {item.changeDescription || "Tidak ada catatan untuk revisi rute ini."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <section className="glass-card backdrop-blur-xl rounded-xl border border-white/10 shadow-glass-depth overflow-hidden bg-white/[0.02]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.05]">
                <div className="space-y-1">
                  <h2 className="text-[14px] md:text-base font-black text-white tracking-tight uppercase">Manajemen Kontrak Tenant</h2>
                  <p className="text-[10px] font-bold text-white/50 leading-relaxed mt-0.5">Arsip legal dan perpanjangan layanan.</p>
                </div>
                {canManageTenantContracts && (
                  <button
                    className="h-8 px-4 flex items-center gap-2 rounded-lg bg-gold-accent text-[#0f141e] hover:scale-105 active:scale-95 transition-all shadow-gold-glow text-[9px] font-black uppercase tracking-widest shrink-0"
                    onClick={openVersionEditor}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[14px]">upgrade</span>
                    Ubah / Upgrade Paket
                  </button>
                )}
              </div>

              {documentFeedback && (
                <div className="mx-4 mt-3 mb-0 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-2 animate-in fade-in zoom-in-95 backdrop-blur-md">
                  <span className="material-symbols-outlined text-base">verified</span>
                  {documentFeedback}
                </div>
              )}

              <div className="mb-1.5 px-4 flex items-center gap-1.5 w-full relative z-50 mt-3">
                <div className="relative group flex-1 min-w-0">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-accent transition-colors" style={{ fontSize: "16px" }}>search</span>
                  <input
                    type="text"
                    placeholder="Cari nomor kontrak atau keterangan..."
                    value={contractSearch}
                    onChange={(e) => setContractSearch(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-black/20 border border-white/10 text-[9px] font-bold text-white outline-none focus:border-gold-accent/40 focus:bg-black/40 transition-all shadow-inner-glass"
                  />
                </div>
                <button
                  className="group relative flex h-8 w-8 xl:w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/20 text-white/60 transition-all hover:border-white/20 hover:bg-black/40 hover:text-white"
                  onClick={() => setContractSort((prev) => (prev === "desc" ? "asc" : "desc"))}
                  title={contractSort === "desc" ? "Urutkan Terlama" : "Urutkan Terbaru"}
                  type="button"
                >
                  <div className="relative flex h-full items-center justify-center">
                    <span className={`material-symbols-outlined transition-all duration-300 ${contractSort === "desc" ? "rotate-0 opacity-100 scale-100" : "-rotate-180 opacity-0 scale-75 absolute"}`} style={{ fontSize: "15px" }}>arrow_downward</span>
                    <span className={`material-symbols-outlined transition-all duration-300 ${contractSort === "asc" ? "rotate-0 opacity-100 scale-100" : "rotate-180 opacity-0 scale-75 absolute"}`} style={{ fontSize: "15px" }}>arrow_upward</span>
                  </div>
                  <span className="hidden xl:inline text-[9px] font-black uppercase tracking-widest text-white/70 transition-colors group-hover:text-white">
                    {contractSort === "desc" ? "Terbaru" : "Terlama"}
                  </span>
                </button>
              </div>

              {(() => {
                if (!activeContractRenewalMeta?.periodEnd || !Number.isFinite(activeContractRenewalMeta.daysUntilEnd)) return null;
                const { daysUntilEnd, hasRenewalUpload, hasResponse } = activeContractRenewalMeta;

                let warningLevel = null;
                let warningMessage = null;

                if (daysUntilEnd <= 90 && daysUntilEnd > 60 && !hasRenewalUpload) {
                  warningLevel = "h3";
                  warningMessage = `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-3 bulan). Segera buat dan upload surat perpanjangan kontrak.`;
                } else if (daysUntilEnd <= 60 && daysUntilEnd > 30 && hasRenewalUpload && !hasResponse) {
                  warningLevel = "h2";
                  warningMessage = `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-2 bulan). Surat perpanjangan sudah diupload. Menunggu tanggapan dari lokasi.`;
                } else if (daysUntilEnd <= 30 && daysUntilEnd > 0 && !hasResponse) {
                  warningLevel = "h1";
                  warningMessage = `Kontrak akan berakhir dalam ${daysUntilEnd} hari (H-1 bulan). ${hasRenewalUpload ? 'Belum ada tanggapan perpanjangan. Segera follow up dengan lokasi.' : 'Segera upload surat perpanjangan kontrak!'}`;
                }

                if (!warningLevel) return null;

                const warningStyles = warningLevel === "h1"
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : warningLevel === "h2"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-400";

                return (
                  <div className={`mx-4 mt-3 mb-0 p-2.5 rounded-xl border backdrop-blur-md ${warningStyles} text-[10px] font-bold flex items-center gap-2 animate-in fade-in zoom-in-95`}>
                    <span className="material-symbols-outlined text-base">schedule</span>
                    {warningMessage}
                  </div>
                );
              })()}

              {/* ── Mobile Cards (hidden on desktop) ── */}
              <div className="xl:hidden flex flex-col gap-2 px-4 mt-2 mb-4">
                {filteredContractRowsForTable.length === 0 ? (
                  <p className="text-center text-[9px] text-white/20 italic uppercase tracking-[0.2em] py-6">Belum ada data kontrak.</p>
                ) : filteredContractRowsForTable.map((row, idx) => {
                  const statusForBadge = (() => {
                    const n = (row.note ?? "").toLowerCase();
                    if (n.includes("berhenti")) return "berhenti";
                    if (n.includes("belum diperpanjang") || n.includes("expired")) return "expired";
                    return "beroperasi";
                  })();
                  const statusLabel = statusForBadge === 'expired' ? 'Belum Diperpanjang' : statusForBadge === 'berhenti' ? 'Berhenti' : 'Beroperasi';
                  const statusClasses = statusForBadge === 'berhenti'
                    ? 'bg-white/5 text-white/30 border-white/10'
                    : statusForBadge === 'expired'
                      ? 'bg-[#ff2400]/10 text-[#ff2400] border-[#ff2400]/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  const isExpanded = !!expandedContracts[row.id];

                  return (
                    <div
                      key={row.id}
                      className={`glass-card rounded-xl border shadow-glass-depth flex flex-col transition-all ${row.isHistory ? 'border-white/5 opacity-60' : row.isFuture ? 'border-blue-500/20' : 'border-white/10'
                        }`}
                    >
                      {/* Header — always visible, tap to expand */}
                      <button
                        type="button"
                        className="flex items-center justify-between gap-2 w-full text-left px-3 py-2.5"
                        onClick={() => setExpandedContracts(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[9px] font-black text-gold-accent/50 shrink-0">#{String(idx + 1).padStart(2, '0')}</span>
                          <span className="text-[10px] font-black uppercase tracking-tight text-white truncate">
                            {row.contractNumber || <span className="text-white/20">Nomor kontrak / BAK</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[7.5px] font-black uppercase tracking-wider ${statusClasses}`}>{statusLabel}</span>
                          <span className={`material-symbols-outlined text-[14px] text-white/30 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] px-3 pb-3 pt-2">

                          {/* Tanggal */}
                          <div className="flex flex-col divide-y divide-white/[0.04] bg-white/[0.02] border border-white/[0.05] rounded-xl px-2.5 py-1">
                            {[
                              { icon: 'calendar_today', label: 'Awal Kontrak', value: formatDate(contractPeriodInfo?.contractStartDate) },
                              { icon: 'event_repeat', label: 'Berjalan Awal', value: formatDate(row.periodStart) },
                              { icon: 'event_busy', label: 'Berjalan Akhir', value: formatDate(row.periodEnd) },
                            ].map(({ icon, label, value }) => (
                              <div key={label} className="flex items-center justify-between gap-3 py-1.5">
                                <span className="flex items-center gap-1.5 text-[9px] font-bold text-white/40">
                                  <span className="material-symbols-outlined text-white/25" style={{ fontSize: '11px' }}>{icon}</span>
                                  {label}
                                </span>
                                <span className="text-[9px] font-black text-white">{value || <span className="text-white/20">—</span>}</span>
                              </div>
                            ))}
                          </div>

                          {/* Paket + Jumlah + Nominal */}
                          <div className="flex flex-col gap-1 bg-white/[0.02] border border-white/[0.05] rounded-xl px-2.5 py-2">
                            {/* Paket + Jumlah dalam satu baris */}
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-white/30" style={{ fontSize: '13px' }}>package_2</span>
                              <span className="text-[10px] font-black text-white/80">{row.jumlahPaket || '—'}</span>
                              <span className="text-[9px] font-black text-white uppercase tracking-tight">{row.paket || <span className="text-white/20">—</span>}</span>
                            </div>
                            {/* Nominal */}
                            <div className="flex items-center justify-between">
                              <span className="text-[7.5px] font-black uppercase tracking-widest text-white/30">Nominal/Bulan</span>
                              <span className="text-[9px] font-black text-emerald-400">{formatRupiahInput(row.monthlyAmount) || <span className="text-white/20">—</span>}</span>
                            </div>
                          </div>


                          {/* Berkas: Kontrak + BAK */}
                          <div className="flex flex-col gap-1 bg-black/30 border border-white/[0.04] rounded-xl p-2">
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-0.5 flex items-center gap-1">
                              <span className="material-symbols-outlined text-white/25" style={{ fontSize: '10px' }}>folder_open</span>
                              Lampiran Berkas
                            </p>
                            {/* Berkas Kontrak */}
                            <div className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-2 py-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="material-symbols-outlined text-gold-accent/40" style={{ fontSize: '13px' }}>history_edu</span>
                                <div className="min-w-0">
                                  <p className="text-[7px] font-black uppercase tracking-widest text-white/30">Berkas Kontrak</p>
                                  <p className="text-[8px] font-bold text-white/50 truncate max-w-[130px]">{row.contractFileName || <span className="text-white/20">Belum ada</span>}</p>
                                </div>
                              </div>
                              {row.contractFileUrl ? (
                                <a href={row.contractFileUrl} target="_blank" rel="noopener noreferrer"
                                  className="h-6 px-2 rounded-lg bg-gold-accent/10 border border-gold-accent/20 text-gold-accent text-[7.5px] font-black uppercase tracking-wider hover:bg-gold-accent hover:text-[#0f141e] transition-all shrink-0 flex items-center">
                                  Lihat
                                </a>
                              ) : <span className="text-[9px] text-white/20">—</span>}
                            </div>
                            {/* BAK */}
                            <div className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-2 py-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="material-symbols-outlined text-blue-400/40" style={{ fontSize: '13px' }}>gavel</span>
                                <div className="min-w-0">
                                  <p className="text-[7px] font-black uppercase tracking-widest text-white/30">BAK</p>
                                  <p className="text-[8px] font-bold text-white/50 truncate max-w-[130px]">{row.bakFileName || <span className="text-white/20">Belum ada</span>}</p>
                                </div>
                              </div>
                              {row.bakFileUrl ? (
                                <a href={row.bakFileUrl} target="_blank" rel="noopener noreferrer"
                                  className="h-6 px-2 rounded-lg bg-gold-accent/10 border border-gold-accent/20 text-gold-accent text-[7.5px] font-black uppercase tracking-wider hover:bg-gold-accent hover:text-[#0f141e] transition-all shrink-0 flex items-center">
                                  Lihat
                                </a>
                              ) : <span className="text-[9px] text-white/20">—</span>}
                            </div>
                          </div>

                          {/* Perpanjangan + Tanggapan */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2">
                              <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-1">Perpanjangan</p>
                              <div className="flex flex-wrap gap-1">{renderTenantRenewalFollowUps(row, "renewal")}</div>
                            </div>
                            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2">
                              <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-1">Tanggapan</p>
                              <div className="flex flex-wrap gap-1">{renderTenantRenewalFollowUps(row, "response")}</div>
                            </div>
                          </div>

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Desktop Table ── */}
              <div className="hidden xl:block overflow-x-auto rounded-lg border border-white/10 bg-black/55 backdrop-blur-3xl shadow-2xl custom-scrollbar mx-4 mb-4 mt-1.5">
                <table className="min-w-full border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">No</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-gold-accent border-r border-white/10 w-[240px]" rowSpan="2">Nomor Kontrak</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">Berkas Kontrak</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">Keterangan</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10 w-[90px]" rowSpan="2">Periode Awal Kontrak</th>
                      <th className="px-3 py-1.5 text-center text-[8px] font-black tracking-[0.4em] text-white/30 uppercase border-b border-white/10 border-r border-white/10" colSpan="2">Periode Berjalan</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">Paket</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">Jumlah</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-r border-white/10" rowSpan="2">Nominal/Bulan</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-l border-white/10" rowSpan="2">BAK</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-l border-white/10" rowSpan="2">Perpanjangan</th>
                      <th className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.3em] text-white/40 border-l border-white/10" rowSpan="2">Tanggapan</th>
                    </tr>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-3 py-2 text-[9px] font-bold tracking-[0.3em] text-white/30 text-center border-r border-white/10 w-[90px]">Awal</th>
                      <th className="px-3 py-2 text-[9px] font-bold tracking-[0.3em] text-white/30 text-center border-r border-white/10 w-[90px]">Akhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContractRowsForTable.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-[9px] text-white/20 italic uppercase tracking-[0.2em] border border-white/5" colSpan="13">Belum ada data kontrak.</td>
                      </tr>
                    )}
                    {filteredContractRowsForTable.map((row) => {
                      const isEditingContractRow = contractRowEditor?.rowId === row.id;
                      const contractNumberValue = isEditingContractRow ? (contractRowEditor.contractNumber ?? "") : (row.contractNumber ?? "");
                      const contractNumberTextSizeClass = (() => {
                        const length = String(contractNumberValue).trim().length;
                        if (length > 42) return "text-[8px]";
                        if (length > 32) return "text-[9px]";
                        if (length > 24) return "text-[10px]";
                        return "text-[11px]";
                      })();

                      // Keterangan badge
                      const noteStyle = (() => {
                        const n = (row.note ?? "").toLowerCase();
                        if (n.includes("beroperasi") || n.includes("awal")) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                        if (n.includes("belum diperpanjang") || n.includes("expired")) return "bg-[#ff2400]/10 border-[#ff2400]/20 text-[#ff2400]";
                        if (n.includes("berhenti")) return "bg-white/5 border-white/10 text-white/30";
                        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
                      })();

                      const rowStateClass = row.isHistory
                        ? "bg-white/[0.01] opacity-55 hover:bg-white/[0.015]"
                        : row.isFuture
                          ? "bg-blue-500/[0.03] hover:bg-blue-500/[0.05]"
                          : "hover:bg-white/[0.02]";

                      return (
                        <tr
                          key={row.id}
                          className={`${rowStateClass} transition-colors group/row`}
                          onBlur={(e) => {
                            if (!isEditingContractRow) return;
                            const currentTarget = e.currentTarget;
                            setTimeout(() => {
                              if (!currentTarget.contains(document.activeElement)) {
                                void triggerAutoSave();
                              }
                            }, 100);
                          }}
                        >

                          {/* No */}
                          <td className="px-3 py-2.5 text-[11px] font-bold text-white/20 whitespace-nowrap border-r border-white/10 text-center">
                            {String(row.number).padStart(2, '0')}
                          </td>

                          {/* Nomor Kontrak */}
                          <td className="border-r border-white/10 p-0 min-w-[240px] w-[240px]">
                            {isEditingContractRow ? (
                              <div className="flex items-center gap-1.5 px-2 bg-black/40 min-h-9 w-full border border-gold-accent/40">
                                <input
                                  className={`flex-1 w-full bg-transparent px-2 py-1 ${contractNumberTextSizeClass} font-black uppercase tracking-tight text-white outline-none disabled:opacity-50`}
                                  placeholder="Nomor kontrak / BAK"
                                  title={String(contractNumberValue)}
                                  disabled={isSavingContractRow}
                                  value={contractNumberValue}
                                  onChange={(e) => {
                                    setContractRowEditor((previous) => previous ? { ...previous, contractNumber: e.target.value } : previous);
                                  }}
                                  autoFocus={!contractRowEditor?.focusField || contractRowEditor.focusField === "contractNumber"}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void triggerAutoSave();
                                    } else if (e.key === "Escape") {
                                      setContractRowEditor(null);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => void triggerAutoSave()}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                                  title="Simpan"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setContractRowEditor(null)}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#ff2400]/20 text-[#ff2400] hover:bg-[#ff2400] hover:text-white transition-all"
                                  title="Batal"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                className={`min-h-9 w-full px-4 py-2 text-left ${contractNumberTextSizeClass} font-black uppercase tracking-tight leading-snug text-white whitespace-normal break-words hover:bg-white/[0.02] focus:bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-gold-accent/40 transition-all`}
                                title={String(contractNumberValue)}
                                type="button"
                                disabled={!canManageTenantContracts}
                                onClick={() => openContractRowEditor(row, "contractNumber")}
                              >
                                {contractNumberValue || <span className="text-white/20">Nomor kontrak / BAK</span>}
                              </button>
                            )}
                          </td>

                          {/* Berkas Kontrak */}
                          <td className="px-3 py-2.5 whitespace-nowrap border-r border-white/10 p-0 text-center">
                            <div className="flex items-center justify-center gap-1.5 p-2">
                              {isEditingContractRow && contractRowEditor.contractUploadedFile ? (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 max-w-[150px]">
                                  <span className="text-[8px] font-bold text-blue-400 truncate" title={contractRowEditor.contractUploadedFileName}>
                                    {contractRowEditor.contractUploadedFileName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setContractRowEditor(prev => prev ? {
                                        ...prev,
                                        contractUploadedFile: null,
                                        contractUploadedFileName: ""
                                      } : null);
                                    }}
                                    className="text-white/40 hover:text-white flex items-center justify-center"
                                    title="Batal berkas baru"
                                  >
                                    <span className="material-symbols-outlined text-[9px]">close</span>
                                  </button>
                                </div>
                              ) : (isEditingContractRow ? contractRowEditor.contractFileUrl : row.contractFileUrl) ? (
                                <div className="flex items-center gap-1.5">
                                  <a
                                    className="inline-flex h-6 items-center justify-center gap-1 px-2 rounded-md border border-gold-accent/20 bg-gold-accent/10 text-[8px] font-black text-gold-accent uppercase tracking-wider hover:bg-gold-accent hover:text-[#0f141e] transition-all"
                                    href={isEditingContractRow ? contractRowEditor.contractFileUrl : row.contractFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                                    Lihat
                                  </a>
                                  {canManageTenantContracts && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const baseEditorState = isEditingContractRow
                                          ? contractRowEditor
                                          : buildContractRowEditorState(row, null);
                                        const nextEditorState = { ...baseEditorState, contractFileUrl: "" };
                                        setContractRowEditor(nextEditorState);
                                        void handleSaveContractRow(null, { __editorState: nextEditorState });
                                      }}
                                      className="h-6 w-6 rounded-md border border-[#ff2400]/20 bg-[#ff2400]/10 flex items-center justify-center text-[#ff2400] hover:bg-[#ff2400] hover:text-white transition-all shrink-0"
                                      title="Hapus berkas"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                                    </button>
                                  )}
                                </div>
                              ) : canManageTenantContracts ? (
                                <button
                                  type="button"
                                  onClick={() => openContractRowEditor(row, "contractFile")}
                                  className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[8px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white transition-all shrink-0"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                  Upload
                                </button>
                              ) : (
                                <span className="text-[10px] font-black text-white/20">—</span>
                              )}

                              {isEditingContractRow ? (
                                <label
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20 transition-all shrink-0"
                                  onClick={() => { isSelectingFileRef.current = true; }}
                                  title="Ganti berkas"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={isSavingContractRow}
                                    onChange={async (event) => {
                                      isSelectingFileRef.current = false;
                                      const file = event.target.files?.[0] ?? null;
                                      if (file) {
                                        setContractRowEditor((previous) => (
                                          previous ? {
                                            ...previous,
                                            contractUploadedFile: file,
                                            contractUploadedFileName: file.name,
                                          } : previous
                                        ));
                                        await handleSaveContractRow(null, { contractUploadedFile: file });
                                      }
                                    }}
                                    ref={(el) => {
                                      if (el && contractRowEditor?.focusField === "contractFile") {
                                        isSelectingFileRef.current = true;
                                        el.click();
                                        setContractRowEditor((prev) => prev ? { ...prev, focusField: null } : null);
                                      }
                                    }}
                                  />
                                </label>
                              ) : canManageTenantContracts && row.contractFileUrl && (
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20 transition-all shrink-0"
                                  onClick={() => openContractRowEditor(row, "contractFile")}
                                  title="Ganti berkas"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Keterangan */}
                          <td className="px-3 py-2.5 text-center border-r border-white/10">
                            {row.note ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded-md border text-[8px] font-black uppercase tracking-widest ${noteStyle}`}>
                                {(() => {
                                  let note = row.note;
                                  return note.replace(/^Kontrak\s+/i, "").replace(/\./g, "").trim();
                                })()}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-white/20">—</span>
                            )}
                          </td>

                          {/* Periode Awal Kontrak */}
                          <td className="border-r border-white/10 text-center p-0">
                            <DateInput
                              className="h-9 w-full"
                              hideIcon={true}
                              inputClass="w-full h-full bg-transparent px-2 text-[10px] font-black text-white border-transparent focus:border-gold-accent/40 focus:bg-white/[0.04] hover:bg-white/[0.02] outline-none transition-all text-center disabled:opacity-50"
                              disabled={true}
                              value={(contractPeriodInfo.contractStartDate ?? "").slice(0, 10)}
                              onChange={() => { }}
                              onFocus={() => { }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setContractRowEditor(null);
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </td>

                          {/* Periode Berjalan Awal */}
                          <td className="border-r border-white/10 p-0">
                            <DateInput
                              className="h-9 w-full"
                              hideIcon={true}
                              inputClass="w-full h-full bg-transparent px-2 text-[10px] font-black text-white border-transparent focus:border-gold-accent/40 focus:bg-white/[0.04] hover:bg-white/[0.02] outline-none transition-all text-center disabled:opacity-50"
                              disabled={isSavingContractRow || !canManageTenantContracts}
                              value={isEditingContractRow ? (contractRowEditor.startDate ?? "") : (row.periodStart ?? "").slice(0, 10)}
                              onChange={(val) => {
                                setContractRowEditor((previous) => previous ? { ...previous, startDate: val } : previous);
                              }}
                              onFocus={() => {
                                if (!isEditingContractRow) {
                                  openContractRowEditor(row, "startDate");
                                }
                              }}
                              autoFocus={contractRowEditor?.focusField === "startDate"}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setContractRowEditor(null);
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </td>

                          {/* Periode Berjalan Akhir */}
                          <td className="border-r border-white/10 p-0">
                            <DateInput
                              className="h-9 w-full"
                              hideIcon={true}
                              inputClass="w-full h-full bg-transparent px-2 text-[10px] font-black text-white border-transparent focus:border-gold-accent/40 focus:bg-white/[0.04] hover:bg-white/[0.02] outline-none transition-all text-center disabled:opacity-50"
                              disabled={isSavingContractRow || !canManageTenantContracts}
                              value={isEditingContractRow ? (contractRowEditor.endDate ?? "") : (row.periodEnd ?? "").slice(0, 10)}
                              onChange={(val) => {
                                setContractRowEditor((previous) => previous ? { ...previous, endDate: val } : previous);
                              }}
                              onFocus={() => {
                                if (!isEditingContractRow) {
                                  openContractRowEditor(row, "endDate");
                                }
                              }}
                              autoFocus={contractRowEditor?.focusField === "endDate"}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setContractRowEditor(null);
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </td>

                          {/* Paket */}
                          <td className="px-3 py-2.5 border-r border-white/10 text-center">
                            <span className="text-[11px] font-black text-white uppercase tracking-wide">{row.paket}</span>
                          </td>

                          {/* Jumlah */}
                          <td className="px-3 py-2.5 border-r border-white/10 text-center">
                            <span className="text-[11px] font-black text-white/80">{row.jumlahPaket ?? "—"}</span>
                          </td>

                          {/* Nominal */}
                          <td className="border-r border-white/10 p-0">
                            <input
                              className="h-9 w-full bg-transparent px-3 py-2.5 text-[11px] font-black text-white border-transparent focus:border-gold-accent/40 focus:bg-white/[0.04] hover:bg-white/[0.02] outline-none transition-all text-right disabled:opacity-50"
                              type="text"
                              placeholder="Nominal / bulan"
                              disabled={isSavingContractRow || !canManageTenantContracts}
                              value={isEditingContractRow ? (contractRowEditor.monthlyAmount ?? "") : (formatRupiahInput(row.monthlyAmount) ?? "")}
                              onChange={(e) => {
                                setContractRowEditor((previous) => previous ? { ...previous, monthlyAmount: formatRupiahInput(e.target.value) } : previous);
                              }}
                              onFocus={() => {
                                if (!isEditingContractRow) {
                                  openContractRowEditor(row, "monthlyAmount");
                                }
                              }}
                              autoFocus={contractRowEditor?.focusField === "monthlyAmount"}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setContractRowEditor(null);
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </td>

                          {/* BAK */}
                          <td className="border-r border-white/10 text-center p-0">
                            <div className="flex items-center justify-center gap-1.5 p-2">
                              {isEditingContractRow && contractRowEditor.bakUploadedFile ? (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 max-w-[150px]">
                                  <span className="text-[8px] font-bold text-blue-400 truncate" title={contractRowEditor.bakUploadedFileName}>
                                    {contractRowEditor.bakUploadedFileName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setContractRowEditor(prev => prev ? {
                                        ...prev,
                                        bakUploadedFile: null,
                                        bakUploadedFileName: ""
                                      } : null);
                                    }}
                                    className="text-white/40 hover:text-white flex items-center justify-center"
                                    title="Batal berkas baru"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                                  </button>
                                </div>
                              ) : (isEditingContractRow ? contractRowEditor.bakFileUrl : row.bakFileUrl) ? (
                                <div className="flex items-center gap-1.5">
                                  <a
                                    className="inline-flex h-6 items-center justify-center gap-1 px-2 rounded-md border border-gold-accent/20 bg-gold-accent/10 text-[8px] font-black text-gold-accent uppercase tracking-wider hover:bg-gold-accent hover:text-[#0f141e] transition-all"
                                    href={isEditingContractRow ? contractRowEditor.bakFileUrl : row.bakFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                                    Lihat
                                  </a>
                                  {canManageTenantContracts && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const baseEditorState = isEditingContractRow
                                          ? contractRowEditor
                                          : buildContractRowEditorState(row, null);
                                        const nextEditorState = { ...baseEditorState, bakFileUrl: "" };
                                        setContractRowEditor(nextEditorState);
                                        void handleSaveContractRow(null, { __editorState: nextEditorState });
                                      }}
                                      className="h-6 w-6 rounded-md border border-[#ff2400]/20 bg-[#ff2400]/10 flex items-center justify-center text-[#ff2400] hover:bg-[#ff2400] hover:text-white transition-all shrink-0"
                                      title="Hapus berkas"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                                    </button>
                                  )}
                                </div>
                              ) : canManageTenantContracts ? (
                                <button
                                  type="button"
                                  onClick={() => openContractRowEditor(row, "bakFile")}
                                  className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[8px] font-black uppercase tracking-wider text-white/40 hover:border-white/20 hover:text-white transition-all shrink-0"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                  Upload
                                </button>
                              ) : (
                                <span className="text-[10px] font-black text-white/20">—</span>
                              )}

                              {isEditingContractRow && canManageTenantContracts ? (
                                <label
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20 transition-all shrink-0"
                                  onClick={() => { isSelectingFileRef.current = true; }}
                                  title="Ganti berkas"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={isSavingContractRow}
                                    onChange={async (event) => {
                                      isSelectingFileRef.current = false;
                                      const file = event.target.files?.[0] ?? null;
                                      if (file) {
                                        setContractRowEditor((previous) => (
                                          previous ? {
                                            ...previous,
                                            bakUploadedFile: file,
                                            bakUploadedFileName: file.name,
                                          } : previous
                                        ));
                                        await handleSaveContractRow(null, { bakUploadedFile: file });
                                      }
                                    }}
                                    ref={(el) => {
                                      if (el && contractRowEditor?.focusField === "bakFile") {
                                        isSelectingFileRef.current = true;
                                        el.click();
                                        setContractRowEditor((prev) => prev ? { ...prev, focusField: null } : null);
                                      }
                                    }}
                                  />
                                </label>
                              ) : canManageTenantContracts && row.bakFileUrl && (
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20 transition-all shrink-0"
                                  onClick={() => openContractRowEditor(row, "bakFile")}
                                  title="Ganti berkas"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Perpanjangan */}
                          <td className="px-3 py-2.5 w-[200px] border-r border-white/10 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {renderTenantRenewalFollowUps(row, "renewal")}
                            </div>
                          </td>

                          {/* Tanggapan */}
                          <td className="px-3 py-2.5 w-[150px] border-r border-white/10 text-center">
                            {renderTenantRenewalFollowUps(row, "response")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-4">
            {/* Billing Header (Card 1) */}
            <section className="glass-card backdrop-blur-xl rounded-premium border-white/10 shadow-glass-depth relative overflow-hidden">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl backdrop-blur-md" />

              <div className="px-4 py-4 md:px-5 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 border-b border-white/5 bg-white/[0.01]">
                <div className="space-y-1 relative z-10">
                  <h2 className="text-[14px] md:text-base font-black text-white tracking-tight uppercase">Manajemen Tagihan Bulanan</h2>
                  <p className="text-[10px] font-bold text-white/50 leading-relaxed">Pemantauan siklus invoice dan rekonsiliasi pembayaran.</p>
                </div>
                {!isIsp && (
                  <button
                    className="h-9 md:h-10 px-3 md:px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gold-accent/10 border border-gold-accent/20 text-gold-accent hover:bg-gold-accent hover:text-[#0f141e] transition-all text-[8px] font-black uppercase tracking-widest backdrop-blur-md shadow-gold-glow relative z-10"
                    onClick={openBillingEditor}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[14px]">tune</span>
                    Ubah Periode Tagihan
                  </button>
                )}
              </div>

              <div className="p-4 md:p-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3 relative z-10">
                <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center gap-1">
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-50 text-white truncate">Total Tagihan</span>
                  <div className="flex items-baseline gap-1 md:gap-1.5 mt-0.5">
                    <span className="text-lg md:text-xl font-black text-white">{paidInvoiceCount} / {invoiceRows.length}</span>
                    <span className="text-[7px] md:text-[8px] font-bold text-white/40 uppercase tracking-widest hidden sm:inline">Tagihan</span>
                  </div>
                </div>
                <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center gap-1">
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-50 text-white truncate">Periode</span>
                  <span className="text-[10px] sm:text-sm md:text-sm font-black text-white tracking-tight leading-tight mt-0.5">
                    {(() => {
                      if (invoiceRows.length === 0) return "—";
                      if (invoiceRows.length === 1) return "Siklus Tunggal";
                      let diffMonths = null;
                      let diffDays = null;
                      let isSameMonth = true;
                      let isSameDay = true;

                      const items = [...invoiceRows].sort((a, b) => (a.paymentOrder || 0) - (b.paymentOrder || 0));
                      for (let i = 1; i < items.length; i++) {
                        const prev = items[i - 1];
                        const curr = items[i];

                        const prevDateStr = prev.periodStartDate || prev.dueDate;
                        const currDateStr = curr.periodStartDate || curr.dueDate;

                        if (!prevDateStr || !currDateStr) {
                          isSameMonth = false;
                          isSameDay = false;
                          break;
                        }

                        const d1 = new Date(prevDateStr);
                        const d2 = new Date(currDateStr);

                        if (!Number.isFinite(d1.getTime()) || !Number.isFinite(d2.getTime())) {
                          isSameMonth = false;
                          isSameDay = false;
                          break;
                        }

                        const mDiff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
                        if (diffMonths === null) diffMonths = mDiff;
                        else if (diffMonths !== mDiff) isSameMonth = false;

                        const dayDiff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays === null) diffDays = dayDiff;
                        else if (diffDays !== dayDiff) isSameDay = false;
                      }

                      if (isSameMonth && diffMonths > 0) return `Setiap ${diffMonths} Bulan`;
                      if (isSameDay && diffDays > 0) return `Setiap ${diffDays} Hari`;
                      return "Acak";
                    })()}
                  </span>
                </div>
                <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center gap-1">
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-50 text-white truncate">Estimasi Biaya</span>
                  <div className="flex items-center justify-between mt-0.5 md:mt-1">
                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/40">Bulan</span>
                    <span className="text-[9px] sm:text-sm md:text-sm font-black text-white tracking-tight">
                      {invoiceRows.length > 0 && Number(invoiceRows.find(i => Number(i.amount) > 0)?.amount || 0) > 0 ? formatCurrency(Number(invoiceRows.find(i => Number(i.amount) > 0).amount)) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/40">Tahun</span>
                    <span className="text-[8px] sm:text-xs font-black text-white/70 tracking-tight">
                      {invoiceRows.length > 0 && Number(invoiceRows.find(i => Number(i.amount) > 0)?.amount || 0) > 0 ? formatCurrency(Number(invoiceRows.find(i => Number(i.amount) > 0).amount) * 12) : "—"}
                    </span>
                  </div>
                </div>
                <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center gap-1">
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest opacity-50 text-white truncate">Status Global</span>
                  <span className={`text-[12px] sm:text-lg md:text-lg font-black truncate mt-0.5 ${unpaidInvoiceCount === 0 && invoiceRows.length > 0 ? "text-emerald-400" : unpaidInvoiceCount > 0 && unpaidInvoiceCount < 3 ? "text-orange-400" : unpaidInvoiceCount >= 3 ? "text-[#ff2400]" : "text-white/40"}`}>
                    {unpaidInvoiceCount === 0 && invoiceRows.length > 0 ? "Aman" : unpaidInvoiceCount > 0 && unpaidInvoiceCount < 3 ? "Peringatan" : unpaidInvoiceCount >= 3 ? "Tertunggak" : "—"}
                  </span>
                </div>
              </div>
            </section>

            {/* Controls (Card 2) */}
            {!isIsp && (
              <section className="glass-card backdrop-blur-xl rounded-premium border-white/10 shadow-glass-depth overflow-visible p-4 relative z-20">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-emerald-400 text-sm">tune</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Form Bulk Update</h3>
                        <span className="text-[9px] font-bold text-white/40 tracking-widest">Ubah Banyak Data Sekaligus</span>
                      </div>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-400/50 hidden sm:inline-block">
                      {selectedInvoiceIds.size > 0 ? `Mode Terpilih (${selectedInvoiceIds.size})` : "Mode Global (Semua)"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Bulan Jatuh Tempo</p>
                      <DateInput
                        value={invoiceBulkForm.dueDate}
                        onChange={(val) => setInvoiceBulkForm(p => ({ ...p, dueDate: val }))}
                        displayMode="month-year"
                        placeholder="Bulan Tahun"
                        className="h-8 w-32 rounded-lg border border-white/10 bg-white/[0.02] transition-all focus-within:border-gold-accent/50 focus-within:bg-white/5"
                        inputClass="w-full h-full bg-transparent px-2.5 text-[10px] font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canManageTenantContracts}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Nominal (Rp)</p>
                      <input
                        className="h-8 w-28 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 text-[10px] font-bold text-white outline-none focus:border-gold-accent/50 transition-all placeholder:text-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                        onChange={(e) => {
                          const val = formatRupiahInput(parseRupiahInput(e.target.value));
                          setInvoiceBulkForm(p => ({ ...p, amount: val }));
                        }}
                        disabled={!canManageTenantContracts}
                        type="text"
                        value={invoiceBulkForm.amount}
                        placeholder="Kosongkan..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Status Invoice</p>
                      <div className="w-36 relative z-50">
                        <GlassSelect
                          value={invoiceBulkForm.status}
                          onChange={(value) => setInvoiceBulkForm(p => ({ ...p, status: value }))}
                          options={[{ value: "", label: "Tidak Berubah" }, ...INVOICE_STATUS_OPTIONS]}
                          className="h-8"
                          textClass="text-[10px] font-bold tracking-wide"
                          optionTextClass="text-[10px] font-bold tracking-wide"
                          disabled={!canManageTenantContracts}
                        />
                      </div>
                    </div>

                    <button
                      className="h-8 w-auto px-4 ml-auto shrink-0 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-[#0f141e] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all disabled:opacity-40 backdrop-blur-md"
                      disabled={isSavingInvoice || invoiceRows.length === 0 || !canManageTenantContracts}
                      onClick={() => void handleApplyBulkInvoiceUpdates()}
                      type="button"
                      title="Terapkan Perubahan"
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Terapkan
                      </span>
                      <span className="material-symbols-outlined text-[14px]">done_all</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {invoiceError && (
              <div className="mb-4 rounded-2xl border border-[#ff2400]/20 bg-[#ff2400]/5 px-6 py-4 text-[11px] font-bold tracking-wide text-[#ff2400] animate-in fade-in slide-in-from-top-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">error</span>
                {invoiceError}
              </div>
            )}

            {invoiceFeedback && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold tracking-wide flex items-center gap-3 animate-in fade-in zoom-in-95 backdrop-blur-md">
                <span className="material-symbols-outlined text-lg">verified</span>
                {invoiceFeedback}
              </div>
            )}

            {/* Active Invoice Table */}
            <section className="glass-card backdrop-blur-xl rounded-premium border-white/10 shadow-glass-depth xl:overflow-visible overflow-hidden relative z-20">
              <div className="px-4 pt-4 pb-2.5 md:px-8 md:py-5 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 xl:rounded-t-[inherit]">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="h-8 w-8 rounded-lg bg-gold-accent/10 border border-gold-accent/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-gold-accent text-sm">payments</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Siklus Pembayaran Aktif</h3>
                    <span className="text-[9px] font-bold text-white/40 tracking-widest">{invoiceRows.length} Siklus Terjadwal</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 hidden sm:inline-block">Urutan</span>
                  <div className="flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.02]">
                    {[
                      { value: "asc", label: "Awal ke Akhir", icon: "arrow_downward" },
                      { value: "desc", label: "Akhir ke Awal", icon: "arrow_upward" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`inline-flex items-center gap-1 md:gap-1.5 h-6 md:h-7 px-2 md:px-3 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all ${invoicePaymentOrderSort === opt.value ? 'bg-gold-accent text-[#0f141e] shadow-gold-glow' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                        onClick={() => setInvoicePaymentOrderSort(opt.value)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[9px] md:text-[11px]">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto no-scrollbar px-3 md:px-5 pt-3 md:pt-4">
                {isDesktopViewport ? (
                <table className="w-full text-left min-w-[1200px] border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      {!isIsp && (
                        <th className="w-10 px-2.5 py-2 text-center border border-white/5">
                          <input
                            type="checkbox"
                            className="cursor-pointer rounded bg-white/[0.05] border-white/20 text-emerald-400 focus:ring-emerald-500/50 outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                            checked={displayInvoiceRows.length > 0 && selectedInvoiceIds.size === displayInvoiceRows.length}
                            onChange={handleToggleSelectAllInvoices}
                            disabled={displayInvoiceRows.length === 0 || isIsp}
                            title="Pilih Semua"
                          />
                        </th>
                      )}
                      <th className="w-12 px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">No</th>
                      <th className="w-16 px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Pembayaran Ke-</th>
                      <th className="min-w-[160px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Nomor Invoice</th>
                      <th className="min-w-[160px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Bulan Jatuh Tempo</th>
                      <th className="min-w-[140px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Jumlah (Rp)</th>
                      <th className="min-w-[160px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Status</th>
                      <th className="min-w-[120px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Waktu Bayar</th>
                      <th className="min-w-[180px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Berkas Invoice</th>
                      <th className="min-w-[120px] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Bukti Bayar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayInvoiceRows.length === 0 && (
                      <tr>
                        <td className="px-2.5 py-6 text-center text-[10px] text-white/30 italic tracking-wider border border-white/5" colSpan="10">Belum ada invoice aktif.</td>
                      </tr>
                    )}
                    {displayInvoiceRows.map((invoice, idx) => {
                      const draft = getInvoiceDraft(invoice);
                      const isSetDateLockedByGlobal = false;
                      const workflowMeta = invoice.workflowMeta ?? getInvoiceWorkflowMeta(invoice, workflowInvoiceRows);
                      const statusMeta = invoice.statusMeta ?? resolveInvoiceStatusMeta({ ...invoice, workflowMeta });
                      const hasInvoiceFile = isOpenableFileUrl(invoice?.invoiceFileUrl);
                      const hasPaymentProof = isOpenableFileUrl(invoice?.paymentProofFileUrl);
                      const hasAnyInvoiceFile = workflowMeta.hasAnyInvoiceFile;

                      const hasSecondFollowUp = Boolean(workflowMeta.secondFollowUp);
                      const hasSecondFollowUpFile = isOpenableFileUrl(workflowMeta.secondFollowUp?.invoiceFileUrl);
                      const hasThirdFollowUp = Boolean(workflowMeta.thirdFollowUp);
                      const hasThirdFollowUpFile = isOpenableFileUrl(workflowMeta.thirdFollowUp?.invoiceFileUrl);
                      const isSp2Visible = hasSecondFollowUp || manualSp2Visible.has(invoice.id);
                      const isSp3Visible = hasThirdFollowUp || manualSp3Visible.has(invoice.id);

                      const canUploadInvoiceFile = !isIsp && !isSavingInvoice;
                      const canUploadSecondWarning = !isIsp && !isSavingInvoice && hasInvoiceFile;
                      const canUploadThirdWarning = !isIsp && !isSavingInvoice && (hasSecondFollowUpFile || hasThirdFollowUpFile);
                      const canUploadPaymentProof = !isIsp && !isSavingInvoice && hasAnyInvoiceFile;

                      const statusStyle = (() => {
                        if (draft.status === "lunas") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                        if (draft.status === "terlambat") return "bg-[#ff2400]/10 border-[#ff2400]/30 text-[#ff2400]";
                        if (draft.status === "belum_bayar") return "bg-[#ffab00]/10 border-[#ffab00]/30 text-[#ffab00]";
                        if (draft.status === "belum_ditagih") {
                          if (statusMeta.key === "pending_setup") return "bg-rose-500/10 border-rose-500/20 text-rose-300";
                          if (statusMeta.key === "waiting_payment_confirmation") return "bg-blue-500/10 border-blue-500/20 text-blue-300";
                          return "bg-white/5 border-white/10 text-white/30";
                        }

                        if (statusMeta.key === "paid") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                        if (statusMeta.key === "warning_unpaid") return "bg-[#ff2400]/10 border-[#ff2400]/30 text-[#ff2400]";
                        if (statusMeta.key === "warning_required_h3") return "bg-[#ffab00]/10 border-[#ffab00]/30 text-[#ffab00]";
                        if (statusMeta.key === "warning_required_h7") return "bg-amber-500/10 border-amber-500/20 text-amber-300";
                        if (statusMeta.key === "waiting_payment_confirmation") return "bg-blue-500/10 border-blue-500/20 text-blue-300";
                        if (statusMeta.key === "pending_setup") return "bg-rose-500/10 border-rose-500/20 text-rose-300";
                        return "bg-white/5 border-white/10 text-white/30";
                      })();

                      return (
                        <tr key={invoice.id} className={`transition-colors group/row ${selectedInvoiceIds.has(invoice.id) ? "bg-emerald-500/5" : "hover:bg-white/[0.02]"}`}>
                          {!isIsp && (
                            <td className="px-2.5 py-2 text-center border border-white/5">
                              <input
                                type="checkbox"
                                className="cursor-pointer rounded bg-white/[0.05] border-white/20 text-emerald-400 focus:ring-emerald-500/50 outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                                checked={selectedInvoiceIds.has(invoice.id)}
                                onChange={() => handleToggleSelectInvoice(invoice.id)}
                                disabled={isIsp}
                                title="Pilih Baris"
                              />
                            </td>
                          )}
                          {/* No */}
                          <td className="px-2.5 py-2 text-[10px] font-black text-white/20 whitespace-nowrap border border-white/5 text-center">{idx + 1}</td>

                          {/* Pembayaran Ke */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-center">
                            <span className="text-[11px] font-black text-white">#{invoice.paymentOrder}</span>
                          </td>

                          {/* Nomor Invoice */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5">
                            {isIsp ? (
                              <span className="text-[10px] font-bold text-white">{draft.invoiceNumber || "-"}</span>
                            ) : (
                              <input
                                className="h-8 w-36 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[10px] font-bold text-white outline-none transition-all placeholder:text-white/15 focus:border-gold-accent/50 focus:bg-white/5 disabled:opacity-50"
                                disabled={isSavingInvoice || isIsp}
                                onBlur={() => handleInvoiceAutoSave(invoice)}
                                onChange={(e) => updateInvoiceDraftField(invoice.id, "invoiceNumber", e.target.value)}
                                placeholder="No. Invoice..."
                                type="text"
                                value={draft.invoiceNumber}
                              />
                            )}
                          </td>

                          {/* Bulan jatuh tempo (due date teknis) */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-center">
                            {isIsp ? (
                              <span className="text-[10px] font-bold text-white">{formatMonthYear(draft.dueDate)}</span>
                            ) : (
                              <div className="space-y-1 flex flex-col items-center">
                                <DateInput
                                  value={draft.dueDate}
                                  onChange={(val) => {
                                    updateInvoiceDraftField(invoice.id, "dueDate", val);
                                    handleInvoiceAutoSave(invoice, { dueDate: val });
                                  }}
                                  disabled={isSetDateLockedByGlobal || isSavingInvoice || isIsp}
                                  hideIcon={true}
                                  displayMode="month-year"
                                  placeholder="Bulan Tahun"
                                  className="h-8 w-36 rounded-lg border border-white/10 bg-white/[0.03] transition-all focus-within:border-gold-accent/50 focus-within:bg-white/5"
                                  inputClass="w-full h-full bg-transparent px-2.5 text-[10px] font-bold text-white text-center outline-none"
                                />
                                {isSetDateLockedByGlobal && (
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Global Locked</p>
                                )}
                                {workflowMeta.setupWarnings.some((warning) => warning.code === "missing_due_date") && !draft.dueDate && (
                                  <p className="text-[9px] font-bold text-rose-300 tracking-wide mt-0.5">Atur bulan jatuh tempo</p>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Jumlah Dibayar */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-right">
                            {isIsp ? (
                              <span className="text-[10px] font-bold text-white pr-2.5">{draft.amount ? `Rp ${draft.amount}` : "-"}</span>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center justify-end gap-1.5 h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] w-32 ml-auto transition-all focus-within:border-gold-accent/50 focus-within:bg-white/5">
                                  <input
                                    className="bg-transparent text-[10px] font-black text-white outline-none w-full text-right"
                                    disabled={isSavingInvoice || isIsp}
                                    onBlur={() => handleInvoiceAutoSave(invoice)}
                                    onChange={(e) => handleInvoiceDraftAmountChange(e, invoice.id)}
                                    placeholder="0"
                                    type="text"
                                    value={draft.amount}
                                  />
                                </div>
                                {workflowMeta.setupWarnings.some((warning) => warning.code === "missing_amount") && parseRupiahInput(draft.amount) <= 0 && (
                                  <p className="text-[9px] font-bold text-rose-300 tracking-wide text-right mt-0.5">Atur nominal</p>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-center">
                            {isIsp ? (
                              <div className={`mx-auto w-fit px-3 py-1.5 rounded-md border text-[10px] font-bold tracking-wide ${statusStyle}`}>
                                {INVOICE_STATUS_OPTIONS.find((opt) => opt.value === draft.status)?.label || draft.status || "-"}
                              </div>
                            ) : (
                              <div className="relative mx-auto w-36">
                                <button
                                  className={`flex h-8 w-full items-center justify-between rounded-md border px-2.5 text-[10px] font-bold tracking-wide outline-none transition-all ${statusStyle} hover:border-gold-accent/30 focus:border-gold-accent/50 disabled:opacity-50 shadow-sm backdrop-blur-md`}
                                  disabled={isSavingInvoice || isIsp}
                                  onClick={(e) => {
                                    if (openInvoiceStatusId === invoice.id) {
                                      setOpenInvoiceStatusId(null);
                                      setDropdownPosition(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const spaceBelow = window.innerHeight - rect.bottom;
                                      const topPos = spaceBelow < 180 ? rect.top - 180 : rect.bottom + 4;
                                      setDropdownPosition({
                                        top: topPos,
                                        left: rect.left,
                                        width: rect.width
                                      });
                                      setOpenInvoiceStatusId(invoice.id);
                                    }
                                  }}
                                  type="button"
                                >
                                  <span>{INVOICE_STATUS_OPTIONS.find((opt) => opt.value === draft.status)?.label || draft.status}</span>
                                  <span className={`material-symbols-outlined text-[14px] transition-transform duration-300 ${openInvoiceStatusId === invoice.id ? "rotate-180 text-gold-accent" : "text-white/40"}`}>expand_more</span>
                                </button>
                                {openInvoiceStatusId === invoice.id && dropdownPosition && createPortal(
                                  <>
                                    <div className="fixed inset-0 z-[110]" onClick={() => { setOpenInvoiceStatusId(null); setDropdownPosition(null); }} />
                                    <div
                                      className="fixed z-[120] rounded-lg border border-white/10 bg-[#0a0f18]/95 p-1 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
                                      style={{
                                        top: `${dropdownPosition.top}px`,
                                        left: `${dropdownPosition.left}px`,
                                        width: `${dropdownPosition.width}px`
                                      }}
                                    >
                                      <div className="no-scrollbar max-h-40 overflow-y-auto space-y-0.5">
                                        {INVOICE_STATUS_OPTIONS.map((option) => {
                                          const isSelected = draft.status === option.value;
                                          return (
                                            <button
                                              key={option.value}
                                              className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-bold tracking-wide transition-all rounded-md ${isSelected ? "bg-gold-accent/10 text-gold-accent" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
                                              onClick={() => {
                                                updateInvoiceDraftField(invoice.id, "status", option.value);
                                                handleInvoiceAutoSave(invoice, { status: option.value });
                                                setOpenInvoiceStatusId(null);
                                                setDropdownPosition(null);
                                              }}
                                              type="button"
                                            >
                                              {option.label}
                                              {isSelected && <span className="material-symbols-outlined text-[12px] text-gold-accent">check</span>}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </div>
                            )}
                          </td>

                          {/* Waktu Terbayar */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-center">
                            <span className="text-[10px] font-black text-white/50">
                              {invoice.paidAt ? formatDate(invoice.paidAt) : <span className="text-white/20 italic font-normal">—</span>}
                            </span>
                          </td>

                          {/* Upload Invoice */}
                          <td className="px-2.5 py-2 align-top border border-white/5">
                            {isIsp ? (
                              <div className="flex flex-col items-center gap-1.5 pt-1">
                                {hasInvoiceFile ? (
                                  <a
                                    className="inline-flex items-center justify-center gap-1 text-[9px] font-black text-gold-accent uppercase tracking-widest hover:underline underline-offset-2"
                                    href={invoice.invoiceFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>open_in_new</span>
                                    Lihat Invoice
                                  </a>
                                ) : (
                                  <span className="font-black text-white/20" style={{ fontSize: '10px' }}>-</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1 w-full max-w-[160px] mx-auto">
                                {/* Invoice Utama */}
                                <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2 py-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="material-symbols-outlined text-gold-accent/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                    <div className="min-w-0 flex flex-col items-start">
                                      <p className="text-[7px] font-black uppercase tracking-widest text-white/30 leading-tight">Invoice Utama</p>
                                      <p className="text-[8px] font-bold text-white/50 truncate max-w-[80px] leading-tight">{hasInvoiceFile ? "Tersedia" : <span className="text-white/20">Belum ada</span>}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {hasInvoiceFile && (
                                      <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                        className="h-6 w-6 rounded-lg bg-gold-accent/10 border border-gold-accent/20 text-gold-accent hover:bg-gold-accent hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>visibility</span>
                                      </a>
                                    )}
                                    <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadInvoiceFile ? 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasInvoiceFile ? "Ganti File" : "Upload File"}>
                                      <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>{hasInvoiceFile ? "edit" : "upload"}</span>
                                      <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadInvoiceFile} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice")} type="file" />
                                    </label>
                                  </div>
                                </div>

                                {/* SP2 */}
                                {!isSp2Visible && canUploadSecondWarning && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleManualSp2(invoice.id)}
                                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[8px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-colors mt-0.5"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">add</span>
                                    Split Invoice Ke-2
                                  </button>
                                )}
                                {isSp2Visible && canUploadSecondWarning && (
                                  <div className="flex flex-col gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5 p-1.5 relative mt-0.5">
                                    {!hasSecondFollowUp && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleManualSp2(invoice.id)}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors z-10"
                                      >
                                        <span className="material-symbols-outlined text-[10px]">close</span>
                                      </button>
                                    )}
                                    <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-orange-500/10 rounded-lg px-2 py-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="material-symbols-outlined text-orange-400/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                        <div className="min-w-0 flex flex-col items-start">
                                          <p className="text-[7px] font-black uppercase tracking-widest text-orange-200/50 leading-tight">Split Ke-2</p>
                                          <p className="text-[8px] font-bold text-orange-200/70 truncate max-w-[60px] leading-tight">{hasSecondFollowUpFile ? "Tersedia" : <span className="text-orange-200/30">Belum ada</span>}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {hasSecondFollowUpFile && (
                                          <a href={workflowMeta.secondFollowUp?.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                            className="h-6 w-6 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>visibility</span>
                                          </a>
                                        )}
                                        <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadSecondWarning ? 'border-orange-500/20 bg-orange-500/10 text-orange-200 hover:border-orange-500/40 hover:text-orange-100' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasSecondFollowUpFile ? "Ganti File" : "Upload File"}>
                                          <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{hasSecondFollowUpFile ? "edit" : "upload"}</span>
                                          <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadSecondWarning} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice", 2)} type="file" />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* SP3 */}
                                {!isSp3Visible && canUploadThirdWarning && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleManualSp3(invoice.id)}
                                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[8px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-colors mt-0.5"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">add</span>
                                    Split Invoice Ke-3
                                  </button>
                                )}
                                {isSp3Visible && canUploadThirdWarning && (
                                  <div className="flex flex-col gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-1.5 relative mt-0.5">
                                    {!hasThirdFollowUp && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleManualSp3(invoice.id)}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors z-10"
                                      >
                                        <span className="material-symbols-outlined text-[10px]">close</span>
                                      </button>
                                    )}
                                    <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-sky-500/10 rounded-lg px-2 py-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="material-symbols-outlined text-sky-400/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                        <div className="min-w-0 flex flex-col items-start">
                                          <p className="text-[7px] font-black uppercase tracking-widest text-sky-200/50 leading-tight">Split Ke-3</p>
                                          <p className="text-[8px] font-bold text-sky-200/70 truncate max-w-[60px] leading-tight">{hasThirdFollowUpFile ? "Tersedia" : <span className="text-sky-200/30">Belum ada</span>}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {hasThirdFollowUpFile && (
                                          <a href={workflowMeta.thirdFollowUp?.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                            className="h-6 w-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>visibility</span>
                                          </a>
                                        )}
                                        <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadThirdWarning ? 'border-sky-500/20 bg-sky-500/10 text-sky-200 hover:border-sky-500/40 hover:text-sky-100' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasThirdFollowUpFile ? "Ganti File" : "Upload File"}>
                                          <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{hasThirdFollowUpFile ? "edit" : "upload"}</span>
                                          <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadThirdWarning} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice", 3)} type="file" />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Bukti Bayar */}
                          <td className="px-2.5 py-2 whitespace-nowrap border border-white/5 text-center">
                            {isIsp ? (
                              <div className="flex flex-col items-center gap-1.5">
                                {hasPaymentProof ? (
                                  <a
                                    className="inline-flex items-center justify-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest hover:underline underline-offset-2"
                                    href={invoice.paymentProofFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                    Lihat Bukti
                                  </a>
                                ) : (
                                  <span className="text-[12px] font-black text-white/20">-</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1.5">
                                <label className={`relative inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded border text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer ${canUploadPaymentProof ? 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`}>
                                  <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                                  {hasPaymentProof ? "Ganti" : "Upload"}
                                  <input
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    disabled={!canUploadPaymentProof}
                                    onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "payment-proof")}
                                    type="file"
                                  />
                                </label>
                                {hasPaymentProof && (
                                  <a
                                    className="inline-flex items-center justify-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest hover:underline underline-offset-2"
                                    href={invoice.paymentProofFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                    Lihat
                                  </a>
                                )}
                              </div>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                ) : (
                <div className="flex flex-col gap-2 relative z-10 pt-0">
                  {displayInvoiceRows.length === 0 && (
                    <div className="px-4 py-6 text-center text-[10px] text-white/30 italic tracking-wider border border-white/5 rounded-xl bg-white/[0.02]">Belum ada invoice aktif.</div>
                  )}
                  {displayInvoiceRows.map((invoice) => {
                    const draft = getInvoiceDraft(invoice);
                    const workflowMeta = invoice.workflowMeta ?? getInvoiceWorkflowMeta(invoice, workflowInvoiceRows);
                    const statusMeta = invoice.statusMeta ?? resolveInvoiceStatusMeta({ ...invoice, workflowMeta });
                    const hasInvoiceFile = isOpenableFileUrl(invoice?.invoiceFileUrl);
                    const hasPaymentProof = isOpenableFileUrl(invoice?.paymentProofFileUrl);
                    const hasAnyInvoiceFile = workflowMeta.hasAnyInvoiceFile;

                    const hasSecondFollowUp = Boolean(workflowMeta.secondFollowUp);
                    const hasSecondFollowUpFile = isOpenableFileUrl(workflowMeta.secondFollowUp?.invoiceFileUrl);
                    const hasThirdFollowUp = Boolean(workflowMeta.thirdFollowUp);
                    const hasThirdFollowUpFile = isOpenableFileUrl(workflowMeta.thirdFollowUp?.invoiceFileUrl);
                    const isSp2Visible = hasSecondFollowUp || manualSp2Visible.has(invoice.id);
                    const isSp3Visible = hasThirdFollowUp || manualSp3Visible.has(invoice.id);

                    const canUploadInvoiceFile = !isIsp && !isSavingInvoice;
                    const canUploadSecondWarning = !isIsp && !isSavingInvoice && hasInvoiceFile;
                    const canUploadThirdWarning = !isIsp && !isSavingInvoice && (hasSecondFollowUpFile || hasThirdFollowUpFile);
                    const canUploadPaymentProof = !isIsp && !isSavingInvoice && hasAnyInvoiceFile;

                    const statusStyle = (() => {
                      if (statusMeta.key === "paid") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                      if (statusMeta.key === "warning_unpaid") return "bg-[#ff2400]/10 border-[#ff2400]/30 text-[#ff2400]";
                      if (statusMeta.key === "warning_required_h3") return "bg-orange-500/10 border-orange-500/20 text-orange-300";
                      if (statusMeta.key === "warning_required_h7") return "bg-amber-500/10 border-amber-500/20 text-amber-300";
                      if (statusMeta.key === "waiting_payment_confirmation") return "bg-blue-500/10 border-blue-500/20 text-blue-300";
                      if (statusMeta.key === "pending_setup") return "bg-rose-500/10 border-rose-500/20 text-rose-300";
                      return "bg-white/5 border-white/10 text-white/30";
                    })();

                    return (
                      <details key={`mob-inv-${invoice.id}`} className={`glass-card rounded-xl border shadow-glass-depth transition-all group ${selectedInvoiceIds.has(invoice.id) ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10"}`}>
                        {/* Header of card (Summary) */}
                        <summary className="flex items-center justify-between gap-3 p-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden outline-none">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {!isIsp && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="cursor-pointer rounded bg-white/[0.05] border-white/20 text-emerald-400 focus:ring-emerald-500/50 outline-none shrink-0"
                                  checked={selectedInvoiceIds.has(invoice.id)}
                                  onChange={() => handleToggleSelectInvoice(invoice.id)}
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30">Pembayaran Ke-</span>
                              <span className="text-[12px] font-black text-white truncate">#{invoice.paymentOrder}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[8px] font-bold text-white/50">Jatuh Tempo:</span>
                                {isIsp ? (
                                  <span className="text-[9px] font-bold text-white truncate">{formatMonthYear(draft.dueDate)}</span>
                                ) : (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <DateInput
                                      value={draft.dueDate}
                                      onChange={(val) => {
                                        updateInvoiceDraftField(invoice.id, "dueDate", val);
                                        handleInvoiceAutoSave(invoice, { dueDate: val });
                                      }}
                                      hideIcon={true}
                                      displayMode="month-year"
                                      placeholder="Bulan Tahun"
                                      className="h-5 w-24 rounded border border-white/10 bg-white/[0.03]"
                                      inputClass="w-full h-full bg-transparent px-1.5 text-[8px] font-bold text-white text-left outline-none"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30">Status</span>
                              <div className={`shrink-0 px-2 py-1 rounded border text-[8px] font-bold tracking-widest uppercase ${statusStyle}`}>
                                {INVOICE_STATUS_OPTIONS.find((opt) => opt.value === draft.status)?.label || draft.status || "-"}
                              </div>
                            </div>
                            <span className="material-symbols-outlined text-white/40 text-[18px] transition-transform duration-300 group-open:-rotate-180">expand_more</span>
                          </div>
                        </summary>

                        {/* Body of card grid (Collapsible Content) */}
                        <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-0 mt-0 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="grid grid-cols-2 gap-2.5 mt-3">
                            <div className="col-span-2 bg-white/[0.02] rounded-lg border border-white/5 p-2 flex flex-col gap-1">
                              <span className="text-[7.5px] font-black uppercase tracking-widest text-white/30">Nomor Invoice</span>
                              {isIsp ? (
                                <span className="text-[10px] font-bold text-white truncate">{draft.invoiceNumber || <span className="text-white/20 italic">Belum Ada</span>}</span>
                              ) : (
                                <input
                                  className="h-6 w-full rounded border border-white/10 bg-white/[0.03] px-2 text-[9px] font-bold text-white outline-none placeholder:text-white/20 focus:border-gold-accent/50"
                                  disabled={isSavingInvoice}
                                  onBlur={() => handleInvoiceAutoSave(invoice)}
                                  onChange={(e) => updateInvoiceDraftField(invoice.id, "invoiceNumber", e.target.value)}
                                  placeholder="No. Invoice..."
                                  type="text"
                                  value={draft.invoiceNumber}
                                />
                              )}
                            </div>
                            <div className="bg-white/[0.02] rounded-lg border border-white/5 p-2 flex flex-col gap-1">
                              <span className="text-[7.5px] font-black uppercase tracking-widest text-white/30">Jumlah (Rp)</span>
                              {isIsp ? (
                                <span className="text-[10px] font-bold text-emerald-400 truncate">{draft.amount ? `Rp ${draft.amount}` : "-"}</span>
                              ) : (
                                <input
                                  className="h-6 w-full rounded border border-white/10 bg-white/[0.03] px-2 text-[9px] font-black text-white outline-none focus:border-gold-accent/50"
                                  onBlur={() => handleInvoiceAutoSave(invoice)}
                                  onChange={(e) => handleInvoiceDraftAmountChange(e, invoice.id)}
                                  placeholder="0"
                                  type="text"
                                  value={draft.amount}
                                />
                              )}
                            </div>
                            <div className="bg-white/[0.02] rounded-lg border border-white/5 p-2 flex flex-col gap-1">
                              <span className="text-[7.5px] font-black uppercase tracking-widest text-white/30">Waktu Bayar</span>
                              <span className="text-[9px] font-bold text-white/50 truncate">
                                {invoice.paidAt ? formatDate(invoice.paidAt) : <span className="text-white/20 italic font-normal">—</span>}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-0.5">
                            {/* Invoice File Column */}
                            <div className="flex-1 bg-white/[0.02] rounded-lg border border-white/5 p-2 flex flex-col items-center justify-center gap-1.5 min-h-[50px]">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30 text-center">Berkas Invoice</span>
                              {isIsp ? (
                                hasInvoiceFile ? (
                                  <a
                                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-gold-accent/20 bg-gold-accent/5 text-[8px] font-black text-gold-accent uppercase tracking-widest hover:bg-gold-accent hover:text-[#0f141e] transition-colors"
                                    href={invoice.invoiceFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined text-[11px]">receipt</span>
                                    Buka
                                  </a>
                                ) : (
                                  <span className="text-[9px] font-bold text-white/20 italic">—</span>
                                )
                              ) : (
                                <div className="flex flex-col gap-1 w-full mt-1.5">
                                  {/* Invoice Utama */}
                                  <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2 py-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="material-symbols-outlined text-gold-accent/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                      <div className="min-w-0 flex flex-col items-start">
                                        <p className="text-[7px] font-black uppercase tracking-widest text-white/30 leading-tight">Invoice Utama</p>
                                        <p className="text-[8px] font-bold text-white/50 truncate max-w-[120px] leading-tight">{hasInvoiceFile ? "Tersedia" : <span className="text-white/20">Belum ada</span>}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {hasInvoiceFile && (
                                        <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                          className="h-6 w-6 rounded-lg bg-gold-accent/10 border border-gold-accent/20 text-gold-accent hover:bg-gold-accent hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                          <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>visibility</span>
                                        </a>
                                      )}
                                      <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadInvoiceFile ? 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasInvoiceFile ? "Ganti File" : "Upload File"}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{hasInvoiceFile ? "edit" : "upload"}</span>
                                        <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadInvoiceFile} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice")} type="file" />
                                      </label>
                                    </div>
                                  </div>

                                  {/* SP2 */}
                                  {!isSp2Visible && canUploadSecondWarning && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleManualSp2(invoice.id)}
                                      className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[8px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-colors mt-0.5"
                                    >
                                      <span className="material-symbols-outlined text-[10px]">add</span>
                                      Split Invoice Ke-2
                                    </button>
                                  )}
                                  {isSp2Visible && canUploadSecondWarning && (
                                    <div className="flex flex-col gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5 p-1.5 relative mt-0.5">
                                      {!hasSecondFollowUp && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleManualSp2(invoice.id)}
                                          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors z-10"
                                        >
                                          <span className="material-symbols-outlined text-[10px]">close</span>
                                        </button>
                                      )}
                                      <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-orange-500/10 rounded-lg px-2 py-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="material-symbols-outlined text-orange-400/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                          <div className="min-w-0 flex flex-col items-start">
                                            <p className="text-[7px] font-black uppercase tracking-widest text-orange-200/50 leading-tight">Split Ke-2</p>
                                            <p className="text-[8px] font-bold text-orange-200/70 truncate max-w-[100px] leading-tight">{hasSecondFollowUpFile ? "Tersedia" : <span className="text-orange-200/30">Belum ada</span>}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {hasSecondFollowUpFile && (
                                            <a href={workflowMeta.secondFollowUp?.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                              className="h-6 w-6 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>visibility</span>
                                            </a>
                                          )}
                                          <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadSecondWarning ? 'border-orange-500/20 bg-orange-500/10 text-orange-200 hover:border-orange-500/40 hover:text-orange-100' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasSecondFollowUpFile ? "Ganti File" : "Upload File"}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{hasSecondFollowUpFile ? "edit" : "upload"}</span>
                                            <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadSecondWarning} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice", 2)} type="file" />
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* SP3 */}
                                  {!isSp3Visible && canUploadThirdWarning && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleManualSp3(invoice.id)}
                                      className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[8px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-colors mt-0.5"
                                    >
                                      <span className="material-symbols-outlined text-[10px]">add</span>
                                      Split Invoice Ke-3
                                    </button>
                                  )}
                                  {isSp3Visible && canUploadThirdWarning && (
                                    <div className="flex flex-col gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-1.5 relative mt-0.5">
                                      {!hasThirdFollowUp && (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleManualSp3(invoice.id)}
                                          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors z-10"
                                        >
                                          <span className="material-symbols-outlined text-[10px]">close</span>
                                        </button>
                                      )}
                                      <div className="flex items-center justify-between gap-2 bg-white/[0.02] border border-sky-500/10 rounded-lg px-2 py-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="material-symbols-outlined text-sky-400/40" style={{ fontSize: '13px' }}>receipt_long</span>
                                          <div className="min-w-0 flex flex-col items-start">
                                            <p className="text-[7px] font-black uppercase tracking-widest text-sky-200/50 leading-tight">Split Ke-3</p>
                                            <p className="text-[8px] font-bold text-sky-200/70 truncate max-w-[100px] leading-tight">{hasThirdFollowUpFile ? "Tersedia" : <span className="text-sky-200/30">Belum ada</span>}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {hasThirdFollowUpFile && (
                                            <a href={workflowMeta.thirdFollowUp?.invoiceFileUrl} target="_blank" rel="noopener noreferrer"
                                              className="h-6 w-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-[#0f141e] transition-all flex items-center justify-center" title="Lihat">
                                              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>visibility</span>
                                            </a>
                                          )}
                                          <label className={`relative h-6 w-6 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${canUploadThirdWarning ? 'border-sky-500/20 bg-sky-500/10 text-sky-200 hover:border-sky-500/40 hover:text-sky-100' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`} title={hasThirdFollowUpFile ? "Ganti File" : "Upload File"}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{hasThirdFollowUpFile ? "edit" : "upload"}</span>
                                            <input className="absolute inset-0 opacity-0 cursor-pointer" disabled={!canUploadThirdWarning} onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "invoice", 3)} type="file" />
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Payment Proof Column */}
                            <div className="flex-1 bg-white/[0.02] rounded-lg border border-white/5 p-2 flex flex-col items-center justify-center gap-1.5 min-h-[50px]">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30 text-center">Bukti Bayar</span>
                              {isIsp ? (
                                hasPaymentProof ? (
                                  <a
                                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-[8px] font-black text-emerald-400 uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-colors"
                                    href={invoice.paymentProofFileUrl}
                                    target="_blank" rel="noopener noreferrer"
                                  >
                                    <span className="material-symbols-outlined text-[11px]">verified</span>
                                    Buka
                                  </a>
                                ) : (
                                  <span className="text-[9px] font-bold text-white/20 italic">—</span>
                                )
                              ) : (
                                <div className="flex flex-col items-center w-full gap-1.5">
                                  <label className={`relative w-full inline-flex items-center justify-center gap-1.5 h-6 rounded border text-[7.5px] font-black uppercase tracking-widest transition-all cursor-pointer ${canUploadPaymentProof ? 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white' : 'border-white/5 bg-white/[0.02] text-white/10 cursor-not-allowed'}`}>
                                    <span className="material-symbols-outlined text-[10px]">receipt_long</span>
                                    {hasPaymentProof ? "Ganti" : "Upload"}
                                    <input
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      disabled={!canUploadPaymentProof}
                                      onChange={(e) => void handleInvoiceFileInputChange(e, invoice, "payment-proof")}
                                      type="file"
                                    />
                                  </label>
                                  {hasPaymentProof && (
                                    <a
                                      className="w-full inline-flex items-center justify-center gap-1 py-1 rounded border border-emerald-500/10 text-[7px] font-black text-emerald-400 uppercase tracking-widest hover:bg-emerald-500/10"
                                      href={invoice.paymentProofFileUrl}
                                      target="_blank" rel="noopener noreferrer"
                                    >
                                      <span className="material-symbols-outlined text-[9px]">open_in_new</span>
                                      Lihat
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
                )}
              </div>
            </section>

            <section className="glass-card backdrop-blur-xl rounded-premium border-white/10 shadow-glass-depth overflow-hidden relative z-10">
              <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Arsip Riwayat Settlement</h3>
                  <p className="text-[10px] font-bold text-white/30 tracking-wider">
                    Invoice nonaktif digroup berdasarkan periode kontrak atau versi perpanjangan.
                  </p>
                </div>
                <span className="self-end md:self-auto px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-white/25 uppercase tracking-widest backdrop-blur-md">
                  {settlementPeriodGroups.length} Periode
                </span>
              </div>

              {settlementFeedback && (
                <div className="mx-4 mt-3 md:mx-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '14px' }}>check_circle</span>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">{settlementFeedback}</p>
                </div>
              )}
              {settlementError && (
                <div className="mx-4 mt-3 md:mx-6 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-400" style={{ fontSize: '14px' }}>error</span>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">{settlementError}</p>
                </div>
              )}
              {settlementPeriodGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center bg-white/[0.01]">
                  <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3 md:mb-4 shadow-glass-depth">
                    <span className="material-symbols-outlined text-white/30 text-2xl md:text-3xl">history</span>
                  </div>
                  <h4 className="text-[11px] md:text-[12px] font-black uppercase tracking-[0.2em] text-white/60 mb-1.5 md:mb-2">Belum Ada Arsip</h4>
                  <p className="text-[9px] md:text-[10px] font-bold text-white/30 tracking-widest">Arsip riwayat settlement kosong.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {settlementPeriodGroups.map((group) => {
                    const isExpanded = Boolean(expandedSettlementPeriods[group.key]);
                    const periodLabel = group.periodStart && group.periodEnd
                      ? `${formatDate(group.periodStart)} - ${formatDate(group.periodEnd)}`
                      : "Periode tidak lengkap";
                    const contractLabel = group.contractNumber || (group.contractId ? `Kontrak #${group.contractId}` : "Tanpa Kontrak");

                    return (
                      <div key={group.key} className="bg-white/[0.005]">
                        <button
                          className="w-full px-3 py-3 md:px-5 md:py-4 flex flex-col gap-2.5 md:gap-3 text-left transition-all hover:bg-white/[0.025] md:flex-row md:items-center md:justify-between"
                          onClick={() => toggleSettlementPeriod(group.key)}
                          type="button"
                        >
                          <div className="flex min-w-0 items-start gap-2.5 md:gap-3">
                            <div className={`mt-0.5 h-7 w-7 md:h-8 md:w-8 shrink-0 rounded-lg md:rounded-xl border flex items-center justify-center transition-all ${isExpanded ? "border-gold-accent/30 bg-gold-accent/15 text-gold-accent" : "border-white/10 bg-white/5 text-white/25"}`}>
                              <span className={`material-symbols-outlined text-[14px] md:text-[16px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
                            </div>
                            <div className="min-w-0 space-y-0.5 md:space-y-1">
                              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-gold-accent/70">
                                {periodLabel}
                              </p>
                              <p className="truncate text-[11px] md:text-[13px] font-black text-white">
                                {contractLabel}
                              </p>
                              <p className="text-[7.5px] md:text-[8px] font-bold uppercase tracking-widest text-white/25">
                                {group.versionId ? `Versi Kontrak #${group.versionId}` : "Periode Kontrak Utama"}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 md:gap-2 md:min-w-[360px]">
                            <div className="rounded-lg md:rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5 md:px-3 md:py-2">
                              <p className="text-[6.5px] md:text-[7px] font-black uppercase tracking-widest text-white/20">Invoice</p>
                              <p className="text-[10px] md:text-[12px] font-black text-white">{group.rows.length}</p>
                            </div>
                            <div className="rounded-lg md:rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5 md:px-3 md:py-2">
                              <p className="text-[6.5px] md:text-[7px] font-black uppercase tracking-widest text-white/20">Lunas</p>
                              <p className="text-[10px] md:text-[12px] font-black text-emerald-400">{group.paidCount}/{group.rows.length}</p>
                            </div>
                            <div className="rounded-lg md:rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-1.5 md:px-3 md:py-2">
                              <p className="text-[6.5px] md:text-[7px] font-black uppercase tracking-widest text-white/20">Total</p>
                              <p className="text-[10px] md:text-[12px] font-black text-white">{formatCurrency(group.totalAmount).replace("Rp", "").trim()}</p>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="overflow-x-auto no-scrollbar border-t border-white/5 px-3 py-3 md:px-5 md:py-4">
                            <table className="w-full text-left min-w-[1200px] border-collapse">
                              <thead>
                                <tr className="bg-white/[0.02]">
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">No</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Siklus</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">No. Invoice</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Masa Invoice</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Settlement</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Status Akhir</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Waktu Bayar</th>
                                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Berkas</th>
                                  {!isIsp && canManageTenantContracts && (
                                    <th className="px-4 py-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/30 whitespace-nowrap border border-white/5 text-center">Aksi</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((invoice, idx) => {
                                  const draft = settlementDrafts[invoice.id] ?? {};
                                  const hasInvoiceFile = isOpenableFileUrl(invoice.invoiceFileUrl);
                                  const hasPaymentProof = isOpenableFileUrl(invoice.paymentProofFileUrl);
                                  const periodLabel = invoice.periodStartDate && invoice.periodEndDate
                                    ? `${formatDate(invoice.periodStartDate)} - ${formatDate(invoice.periodEndDate)}`
                                    : formatDate(invoice.dueDate);
                                  const canEdit = !isIsp && canManageTenantContracts;
                                  const isRowSaving = savingSettlementIds.has(invoice.id);

                                  const originalInvoiceNumber = String(invoice.invoiceNumber ?? "");
                                  const originalAmount = Number(invoice.amount ?? 0);
                                  const originalStatus = String(invoice.status ?? "belum_ditagih");
                                  const originalPaidAt = String(invoice.paidAt ?? "").slice(0, 10);

                                  const draftInvoiceNumber = draft.invoiceNumber !== undefined
                                    ? String(draft.invoiceNumber)
                                    : originalInvoiceNumber;
                                  const draftAmount = draft.amount !== undefined
                                    ? parseRupiahInput(draft.amount)
                                    : originalAmount;
                                  const draftStatus = draft.status !== undefined
                                    ? String(draft.status)
                                    : originalStatus;
                                  const draftPaidAt = draft.paidAt !== undefined
                                    ? String(draft.paidAt).slice(0, 10)
                                    : originalPaidAt;

                                  const isDraftChanged =
                                    draftInvoiceNumber !== originalInvoiceNumber ||
                                    draftAmount !== originalAmount ||
                                    draftStatus !== originalStatus ||
                                    draftPaidAt !== originalPaidAt;

                                  return (
                                    <tr key={invoice.id} className="hover:bg-white/[0.03] transition-colors group/row">
                                      <td className="px-4 py-3 text-[10px] font-black text-white/20 whitespace-nowrap border border-white/5 text-center">{idx + 1}</td>
                                      <td className="px-4 py-3 whitespace-nowrap border border-white/5 text-center">
                                        <span className="text-[11px] font-black text-white">Siklus #{idx + 1}</span>
                                      </td>

                                      {/* No. Invoice — editable */}
                                      <td className="px-3 py-2 border border-white/5 min-w-[140px]">
                                        {canEdit ? (
                                          <input
                                            type="text"
                                            value={draft.invoiceNumber ?? ""}
                                            onChange={(e) => setSettlementDrafts((prev) => ({
                                              ...prev,
                                              [invoice.id]: { ...prev[invoice.id], invoiceNumber: e.target.value },
                                            }))}
                                            disabled={isRowSaving}
                                            placeholder="No. Invoice..."
                                            className="h-8 w-full rounded-lg border border-white/5 bg-white/[0.01] px-2.5 text-[9px] font-black uppercase tracking-widest text-white outline-none transition-all focus:border-gold-accent/40 focus:bg-white/[0.04] disabled:opacity-40 placeholder:text-white/20 placeholder:normal-case placeholder:tracking-normal"
                                          />
                                        ) : (
                                          <span className="text-[11px] font-black text-white/60">{invoice.invoiceNumber || <span className="text-white/20 italic font-normal">—</span>}</span>
                                        )}
                                      </td>

                                      {/* Masa Invoice — read-only */}
                                      <td className="px-4 py-3 text-[10px] font-bold text-white/30 uppercase whitespace-nowrap border border-white/5">{periodLabel}</td>

                                      {/* Settlement (Amount) — editable */}
                                      <td className="px-3 py-2 border border-white/5 min-w-[130px]">
                                        {canEdit ? (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={draft.amount ?? ""}
                                            onChange={(e) => {
                                              const formatted = formatRupiahInput(e.target.value);
                                              setSettlementDrafts((prev) => ({
                                                ...prev,
                                                [invoice.id]: { ...prev[invoice.id], amount: formatted },
                                              }));
                                            }}
                                            disabled={isRowSaving}
                                            placeholder="0"
                                            className="h-8 w-full rounded-lg border border-white/5 bg-white/[0.01] px-2.5 text-[9px] font-black tracking-widest text-white text-right outline-none transition-all focus:border-gold-accent/40 focus:bg-white/[0.04] disabled:opacity-40 placeholder:text-white/20"
                                          />
                                        ) : (
                                          <span className="text-[11px] font-black text-white/80 block text-right">{formatCurrency(invoice.amount ?? 0).replace("Rp", "").trim()}</span>
                                        )}
                                      </td>

                                      {/* Status Akhir — editable dropdown */}
                                      <td className="px-3 py-2 border border-white/5 min-w-[150px]">
                                        {canEdit ? (
                                          <GlassSelect
                                            value={draft.status ?? invoice.status ?? "belum_ditagih"}
                                            onChange={(val) => setSettlementDrafts((prev) => ({
                                              ...prev,
                                              [invoice.id]: { ...prev[invoice.id], status: val },
                                            }))}
                                            options={INVOICE_STATUS_OPTIONS}
                                            disabled={isRowSaving}
                                            className="h-8"
                                            textClass="text-[9px] font-black uppercase tracking-widest"
                                            optionTextClass="text-[9px] font-black uppercase tracking-widest"
                                          />
                                        ) : (
                                          (() => {
                                            const statusMeta = invoice.statusMeta ?? resolveInvoiceStatusMeta(invoice);
                                            return (
                                              <span className={`inline-flex justify-center items-center w-full max-w-[120px] px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${statusMeta.badgeClass}`}>
                                                <span className="truncate">{statusMeta.label}</span>
                                              </span>
                                            );
                                          })()
                                        )}
                                      </td>

                                      {/* Waktu Bayar — editable date */}
                                      <td className="px-3 py-2 border border-white/5 min-w-[150px]">
                                        {canEdit ? (
                                          <input
                                            type="date"
                                            value={draft.paidAt ?? ""}
                                            onChange={(e) => setSettlementDrafts((prev) => ({
                                              ...prev,
                                              [invoice.id]: { ...prev[invoice.id], paidAt: e.target.value },
                                            }))}
                                            disabled={isRowSaving}
                                            className="h-8 w-full rounded-lg border border-white/5 bg-white/[0.01] px-2.5 text-[9px] font-black uppercase tracking-widest text-white outline-none transition-all focus:border-gold-accent/40 focus:bg-white/[0.04] disabled:opacity-40 [color-scheme:dark]"
                                          />
                                        ) : (
                                          <span className="text-[10px] font-bold text-white/30 block text-center">{formatDate(invoice.paidAt)}</span>
                                        )}
                                      </td>

                                      {/* Berkas — read-only */}
                                      <td className="px-4 py-3 whitespace-nowrap border border-white/5">
                                        <div className="flex items-center justify-center gap-2">
                                          {hasInvoiceFile ? (
                                            <a href={invoice.invoiceFileUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] font-black uppercase tracking-widest text-gold-accent hover:underline">Invoice</a>
                                          ) : (
                                            <span className="text-[8px] font-bold uppercase tracking-widest text-white/15">Invoice</span>
                                          )}
                                          {hasPaymentProof ? (
                                            <a href={invoice.paymentProofFileUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:underline">Bukti</a>
                                          ) : (
                                            <span className="text-[8px] font-bold uppercase tracking-widest text-white/15">Bukti</span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Aksi — tombol simpan */}
                                      {canEdit && (
                                        <td className="px-3 py-2 whitespace-nowrap border border-white/5 text-center">
                                          <button
                                            type="button"
                                            disabled={isRowSaving || !isDraftChanged}
                                            onClick={() => handleSaveSettlementRow(invoice)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gold-accent/30 bg-gold-accent/10 text-[8px] font-black uppercase tracking-widest text-gold-accent transition-all hover:bg-gold-accent hover:text-black active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            {isRowSaving ? (
                                              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '11px' }}>progress_activity</span>
                                            ) : (
                                              <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>save</span>
                                            )}
                                            {isRowSaving ? "Menyimpan..." : "Simpan"}
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "payment-realizations" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="glass-card backdrop-blur-xl rounded-xl border-white/10 shadow-glass-depth overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-white/5 bg-white/[0.01] px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-gold-accent" style={{ fontSize: "18px" }}>payments</span>
                    <h3 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Realisasi Pembayaran</h3>
                  </div>
                  <p className="text-[10px] font-bold text-white/35">
                    Total realisasi di tab ini akan otomatis tersinkron ke kolom monitoring kontrak untuk kontrak aktif tenant.
                  </p>
                </div>
                {!isIsp && (
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gold-accent px-4 text-[10px] font-black uppercase tracking-widest text-[#0f141e] shadow-gold-glow transition-all hover:scale-[1.01] active:scale-[0.98]"
                    onClick={openPaymentRealizationModal}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    Tambah Realisasi
                  </button>
                )}
              </div>

              <div className="grid gap-3 border-b border-white/5 px-4 py-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/35">Total Realisasi</p>
                  <p className="mt-1 text-[18px] font-black text-white">
                    {formatCurrency(
                      paymentRealizationRows.reduce((total, row) => total + Number(row?.amount ?? 0), 0),
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/35">Kontrak Sinkron</p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-white">
                    {activeBillingPeriod?.contractNumber ?? contract?.contractNumber ?? contract?.contract_number ?? "-"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-4">
                {paymentRealizationError && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[10px] font-bold text-rose-300">
                    {paymentRealizationError}
                  </div>
                )}
                {paymentRealizationFeedback && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[10px] font-bold text-emerald-300">
                    {paymentRealizationFeedback}
                  </div>
                )}

                <div className="hidden overflow-x-auto rounded-xl border border-white/10 xl:block">
                  <table className="w-full min-w-[920px] text-left">
                    <thead className="bg-white/[0.03]">
                      <tr>
                        {["NO", "PERIODE PEMBAYARAN", "BESARAN PEMBAYARAN", "BERKAS PEMBAYARAN"].map((header) => (
                          <th
                            key={header}
                            className="border-b border-r border-white/10 px-4 py-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-white/60 last:border-r-0"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRealizationRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-[10px] font-bold text-white/25" colSpan={4}>
                            Belum ada realisasi pembayaran yang dicatat.
                          </td>
                        </tr>
                      ) : (
                        paymentRealizationRows.map((row, index) => (
                          <tr key={row?.id ?? `${row?.periodStartMonth}-${index}`} className="bg-black/10 transition-colors hover:bg-white/[0.03]">
                            <td className="border-r border-t border-white/5 px-4 py-3 text-center text-[10px] font-black text-white/40">
                              {String(index + 1).padStart(2, "0")}
                            </td>
                            <td className="border-r border-t border-white/5 px-4 py-3 text-center text-[10px] font-bold text-white">
                              {formatPaymentRealizationPeriod(row?.periodStartMonth, row?.periodEndMonth)}
                            </td>
                            <td className="border-r border-t border-white/5 px-4 py-3 text-center text-[10px] font-black text-gold-accent">
                              {formatCurrency(row?.amount ?? 0)}
                            </td>
                            <td className="border-t border-white/5 px-4 py-3 text-center">
                              {isOpenableFileUrl(row?.paymentFileUrl) ? (
                                <button
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-emerald-300 transition-all hover:text-white"
                                  onClick={() => openSafeFile(row.paymentFileUrl)}
                                  type="button"
                                >
                                  <span className="material-symbols-outlined text-[12px]">attach_file</span>
                                  {row?.paymentFileName ? "Buka Berkas" : "Buka"}
                                </button>
                              ) : (
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Kosong</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 xl:hidden">
                  {paymentRealizationRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-[10px] font-bold text-white/25">
                      Belum ada realisasi pembayaran yang dicatat.
                    </div>
                  ) : (
                    paymentRealizationRows.map((row, index) => (
                      <div key={row?.id ?? `${row?.periodStartMonth}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/35">Baris {String(index + 1).padStart(2, "0")}</p>
                            <p className="mt-1 text-[10px] font-black text-white">
                              {formatPaymentRealizationPeriod(row?.periodStartMonth, row?.periodEndMonth)}
                            </p>
                          </div>
                          <p className="text-[10px] font-black text-gold-accent">{formatCurrency(row?.amount ?? 0)}</p>
                        </div>
                        <div className="mt-3">
                          {isOpenableFileUrl(row?.paymentFileUrl) ? (
                            <button
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-emerald-300 transition-all hover:text-white"
                              onClick={() => openSafeFile(row.paymentFileUrl)}
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[12px]">attach_file</span>
                              Buka Berkas
                            </button>
                          ) : (
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Berkas belum tersedia</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Document List */}
            <section className={`${isIsp ? 'lg:col-span-12' : 'lg:col-span-7'} glass-card backdrop-blur-xl rounded-xl border-white/10 shadow-glass-depth overflow-hidden flex flex-col`}>
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gold-accent" style={{ fontSize: "18px" }}>folder_open</span>
                  <h3 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Repositori Dokumen Lokasi</h3>
                </div>
              </div>
              <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="relative group flex-1 min-w-0">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-accent transition-colors" style={{ fontSize: "16px" }}>search</span>
                    <input
                      type="text"
                      placeholder="Cari dokumen..."
                      value={documentSearch}
                      onChange={(e) => setDocumentSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 rounded-lg bg-black/20 border border-white/10 text-[9px] font-bold text-white outline-none focus:border-gold-accent/40 focus:bg-black/40 transition-all shadow-inner-glass"
                    />
                  </div>
                  <button
                    onClick={() => setDocumentSort(prev => prev === "desc" ? "asc" : "desc")}
                    className="group relative flex h-8 w-8 xl:w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/20 text-white/60 transition-all hover:border-white/20 hover:bg-black/40 hover:text-white"
                    title={documentSort === "desc" ? "Urutkan Terlama" : "Urutkan Terbaru"}
                  >
                    <div className="relative flex h-full items-center justify-center">
                      <span className={`material-symbols-outlined transition-all duration-300 ${documentSort === "desc" ? "rotate-0 opacity-100 scale-100" : "-rotate-180 opacity-0 scale-75 absolute"}`} style={{ fontSize: "15px" }}>arrow_downward</span>
                      <span className={`material-symbols-outlined transition-all duration-300 ${documentSort === "asc" ? "rotate-0 opacity-100 scale-100" : "rotate-180 opacity-0 scale-75 absolute"}`} style={{ fontSize: "15px" }}>arrow_upward</span>
                    </div>
                    <span className="hidden xl:inline text-[9px] font-black uppercase tracking-widest text-white/70 transition-colors group-hover:text-white">
                      {documentSort === "desc" ? "Terbaru" : "Terlama"}
                    </span>
                  </button>
                </div>

                <div className={isIsp ? "grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 content-start" : "space-y-2.5 flex-1 flex flex-col"}>
                  {filteredAndSortedDocs.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center gap-2 p-6 text-center border border-dashed border-white/5 rounded-xl bg-white/[0.01] h-full">
                      <span className="material-symbols-outlined text-[24px] text-white/10">folder_off</span>
                      <p className="text-[10px] font-black text-white/20 tracking-widest">
                        {documentSearch ? "Dokumen tidak ditemukan." : "Belum ada dokumen yang diunggah."}
                      </p>
                    </div>
                  )}
                  {paginatedTenantDocs.map((doc) => (
                    <div
                      key={doc?.id}
                      className="glass-card rounded-xl border border-white/10 px-3 py-2 flex items-center justify-between gap-3 shadow-glass-depth transition-all hover:border-white/15"
                    >
                      {/* Left: Icon & Info */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-[28px] w-[28px] flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gold-accent shrink-0">
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>description</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10.5px] font-bold text-white/95 truncate" title={resolveDocumentTypeLabel(doc?.jenisDokumen)}>
                            {resolveDocumentTypeLabel(doc?.jenisDokumen)}
                          </p>
                          <p className="text-[8px] font-medium text-white/40 mt-0.5 truncate">
                            {doc?.nomorDokumen ? `${doc.nomorDokumen} · ` : ''}{formatDate(doc?.tanggalDokumen)}
                          </p>
                        </div>
                      </div>
                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isOpenableFileUrl(doc?.fileUrl) ? (
                          <button
                            onClick={() => window.open(doc.fileUrl, '_blank')}
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-white font-bold text-[8.5px] leading-none uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 rounded-md transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>description</span>
                            Buka
                          </button>
                        ) : (
                          <span className="text-[8.5px] font-black uppercase tracking-widest text-white/20">Kosong</span>
                        )}
                        {!isIsp && (
                          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                            <button className="w-6 h-6 flex items-center justify-center rounded-md bg-white/5 border border-white/10 text-gold-accent hover:bg-gold-accent hover:text-white transition-all">
                              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit_note</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {filteredAndSortedDocs.length > 10 && (
                  <div className="mt-auto flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                      <div className="relative z-[60] w-12">
                        <div className="relative group h-8 rounded-lg bg-white/5 border border-white/10 focus-within:border-gold-accent/40 focus-within:bg-black/40 transition-all backdrop-blur-md">
                          <CustomDropdown
                            value={tenantDocItemsPerPage}
                            onChange={(val) => setTenantDocItemsPerPage(Number(val))}
                            options={[10, 20, 50, 100].map(n => ({ value: n, label: String(n) }))}
                            triggerClass="text-[8px] font-black uppercase tracking-widest text-white/50 group-hover:text-white px-3 cursor-pointer text-center"
                            position="top"
                            hideArrow={true}
                            itemAlign="center"
                            menuWidth="min-w-[60px]"
                          />
                        </div>
                      </div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/30 hidden sm:block">
                        {filteredAndSortedDocs.length === 0 ? 0 : tenantDocStartIndex + 1}–{Math.min(tenantDocStartIndex + tenantDocItemsPerPage, filteredAndSortedDocs.length)} dari {filteredAndSortedDocs.length}
                      </p>
                    </div>
                    <div className="flex items-center justify-between w-full sm:w-auto gap-1.5">
                      <button
                        className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-[8px] font-black uppercase tracking-widest text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 backdrop-blur-md"
                        type="button" disabled={tenantDocCurrentPage <= 1} onClick={() => handleTenantDocPageChange(Math.max(1, tenantDocCurrentPage - 1))}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_left</span> <span className="hidden sm:inline">Prev</span>
                      </button>

                      <div
                        ref={tenantDocPaginationRef}
                        onScroll={handleTenantDocPaginationScroll}
                        className="flex items-center gap-1.5 w-[96px] justify-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: 'none' }}
                      >
                        <div className="shrink-0 w-7 h-7 snap-center pointer-events-none opacity-0"></div>

                        {tenantDocPageNumbers.map((page) => {
                          const distance = Math.abs(tenantDocCurrentPage - page);
                          const isActive = distance === 0;

                          let scaleClass = "scale-100 opacity-100 z-10";
                          let bgClass = "bg-white/5 border border-white/5 text-white/50 hover:bg-white/10 hover:text-white";

                          if (distance === 1) {
                            scaleClass = "scale-90 opacity-80 z-0";
                            bgClass = "bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 hover:text-white";
                          } else if (distance >= 2) {
                            scaleClass = "scale-75 opacity-40 z-0";
                            bgClass = "bg-white/5 border border-white/5 text-white/30";
                          }

                          if (isActive) {
                            bgClass = "bg-gold-accent text-black shadow-gold-glow";
                          }

                          return (
                            <button
                              key={`page-${page}`}
                              onClick={() => handleTenantDocPageChange(page)}
                              className={`snap-center shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black transition-all duration-300 ease-out transform ${scaleClass} ${bgClass} backdrop-blur-md`}
                              type="button"
                            >
                              {page}
                            </button>
                          );
                        })}

                        <div className="shrink-0 w-7 h-7 snap-center pointer-events-none opacity-0"></div>
                      </div>

                      <button
                        className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 text-[8px] font-black uppercase tracking-widest text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 backdrop-blur-md"
                        type="button" disabled={tenantDocCurrentPage >= tenantDocTotalPages} onClick={() => handleTenantDocPageChange(Math.min(tenantDocTotalPages, tenantDocCurrentPage + 1))}
                      >
                        <span className="hidden sm:inline">Next</span> <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_right</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Upload Section */}
            {!isIsp && (
              <section className="lg:col-span-5 space-y-4">
                <div className="glass-card backdrop-blur-xl rounded-xl p-4 border-white/10 shadow-glass-depth relative overflow-hidden">
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold-accent/5 blur-2xl backdrop-blur-md" />
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-8 w-8 rounded-lg bg-gold-accent/10 border border-gold-accent/20 flex items-center justify-center text-gold-accent backdrop-blur-md">
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>upload</span>
                    </div>
                    <h3 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/60">Tambah Dokumen Baru</h3>
                  </div>

                  <form className="space-y-2.5" onSubmit={handleUploadDocument}>
                    <GlassSelect
                      label="Kategori Dokumen"
                      value={documentDraft.jenisDokumen}
                      onChange={(value) => setDocumentDraft(p => ({ ...p, jenisDokumen: value }))}
                      options={[
                        { value: "penawaran", label: "Surat Penawaran Harga" },
                        { value: "tanggapan", label: "Surat Tanggapan" },
                        { value: "hasil_nego", label: "Surat Negosiasi" },
                        { value: "custom", label: "Lainnya / Manual" }
                      ]}
                    />

                    {documentDraft.jenisDokumen === "custom" && (
                      <GlassInput
                        label="Nama Dokumen Kustom"
                        icon="edit_note"
                        value={documentDraft.customJenisDokumen}
                        onChange={(e) => setDocumentDraft(p => ({ ...p, customJenisDokumen: e.target.value }))}
                        placeholder="MISAL: SURAT KUASA"
                      />
                    )}

                    <GlassInput
                      label="Nomor Referensi (Opsional)"
                      icon="tag"
                      value={documentDraft.nomorDokumen}
                      onChange={(e) => setDocumentDraft(p => ({ ...p, nomorDokumen: e.target.value }))}
                      placeholder="MASUKKAN NOMOR SURAT"
                    />

                    <GlassInput
                      label="Tanggal Terbit"
                      icon="calendar_today"
                      type="date"
                      value={documentDraft.tanggalDokumen}
                      onChange={(e) => setDocumentDraft(p => ({ ...p, tanggalDokumen: e.target.value }))}
                    />

                    <div className="p-4 rounded-xl bg-white/5 border border-dashed border-white/10 relative group/file backdrop-blur-md">
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setDocumentDraft((previous) => ({
                            ...previous,
                            fileUrl: "",
                            uploadedFileName: file?.name ?? "",
                            uploadedFile: file,
                          }));
                        }}
                      />
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="material-symbols-outlined text-white/10 group-hover/file:text-gold-accent transition-colors" style={{ fontSize: "24px" }}>cloud_upload</span>
                        <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-widest">
                          {documentDraft.uploadedFileName ? <span className="text-gold-accent">{documentDraft.uploadedFileName}</span> : "Klik atau seret file dokumen ke sini"}
                        </p>
                      </div>
                    </div>

                    {documentError && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold">
                        {documentError}
                      </div>
                    )}
                    {documentFeedback && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold backdrop-blur-md">
                        {documentFeedback}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isUploadingDocument}
                      className="w-full h-10 rounded-xl bg-gold-accent text-[#0f141e] text-[10px] font-black uppercase tracking-widest shadow-gold-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isUploadingDocument ? "Memproses Unggahan..." : "Tambah Dokumen"}
                    </button>
                  </form>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="space-y-2.5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Card */}
            <section className="glass-card backdrop-blur-xl rounded-xl p-3 sm:p-5 border-white/10 shadow-glass-depth relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 bg-gold-accent rounded-full"></span>
                    <h2 className="text-base font-black text-white tracking-widest uppercase">Timeline Aktivitas</h2>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gold-accent/10 border border-gold-accent/20 ml-2">
                      <span className="w-1 h-1 rounded-full bg-gold-accent animate-pulse shadow-gold-glow" />
                      <span className="text-[7px] font-black uppercase tracking-widest text-gold-accent">Sistem Log</span>
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-white/20 tracking-wider">Jejak audit digital dan riwayat perubahan repositori lokasi tenant.</p>
                </div>
              </div>
            </section>

            {/* Timeline Card */}
            <section className="glass-card backdrop-blur-xl rounded-xl p-3 sm:p-5 border-white/10 shadow-glass-depth relative overflow-hidden">
              {displayTimeline.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-white/10">history_toggle_off</span>
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Belum ada aktivitas terekam.</p>
                </div>
              ) : (
                <div className="relative sm:pt-2 pt-0">
                  {/* ── DESKTOP VIEW ── */}
                  <div className="hidden sm:block">
                    <div className="absolute left-[19px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-gold-accent/40 via-white/10 to-transparent rounded-full shadow-gold-glow" />
                    <div className="space-y-6 relative z-10">
                      {displayTimeline.map((event, idx) => {
                        const icon = timelineIconMap[event.type] ?? "history";
                        const isFirst = idx === 0;
                        return (
                          <div key={event.id} className="flex gap-4 group/item">
                            <div className="relative shrink-0 mt-1">
                              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm group-hover/item:scale-110 transition-all duration-300 ${isFirst ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover/item:shadow-gold-glow' : 'bg-white/5 border-white/10 text-white/40 group-hover/item:border-white/20 group-hover/item:text-white'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>{icon}</span>
                              </div>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-1">
                                <div className="space-y-0.5">
                                  <h4 className="text-[11px] font-black text-white group-hover/item:text-gold-accent transition-colors duration-300 tracking-wider uppercase">{event.title}</h4>
                                  <span className={`inline-block text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${isFirst ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 border border-white/10 text-white/30'}`}>
                                    {event.type?.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[8px] font-black tracking-widest bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                                  <span className="text-white/40 uppercase">{new Date(event.date).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                  <div className="w-1 h-1 rounded-full bg-white/10 animate-pulse" />
                                  <span className="text-gold-accent">{new Date(event.date).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })} WITA</span>
                                </div>
                              </div>
                              <div className="p-4 border border-white/5 bg-black/40 backdrop-blur-3xl rounded-xl transition-all duration-300 shadow-sm relative overflow-hidden group-hover/item:bg-black/60 group-hover/item:border-white/10">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isFirst ? 'bg-emerald-500/80' : 'bg-white/10'}`} />
                                <p className="text-[10px] font-bold text-white/50 leading-relaxed tracking-wide group-hover/item:text-white/90 transition-colors">
                                  {event.description}
                                </p>
                                {event.actor && (
                                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-white/20" style={{ fontSize: '10px' }}>person</span>
                                    <span className="text-[7.5px] font-black text-white/20 uppercase tracking-widest">Actor: <span className="text-white/40">{event.actor}</span></span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── MOBILE VIEW ── */}
                  <div className="sm:hidden">
                    <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-gold-accent/40 via-white/10 to-transparent rounded-full shadow-gold-glow" />
                    <div className="space-y-3 relative z-10">
                      {displayTimeline.map((event, idx) => {
                        const icon = timelineIconMap[event.type] ?? "history";
                        const isFirst = idx === 0;
                        return (
                          <div key={event.id} className="flex items-start gap-3 group/item">
                            {/* Icon marker */}
                            <div className="relative shrink-0 mt-0.5">
                              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shadow-sm transition-all duration-300 group-hover/item:scale-110 ${isFirst ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40 group-hover/item:border-white/20 group-hover/item:text-white'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>{icon}</span>
                              </div>
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                              {/* Row 1: Title + type badge */}
                              <div className="flex items-center justify-between gap-2 leading-tight">
                                <h4 className="text-[10.5px] font-black text-white group-hover/item:text-gold-accent transition-colors duration-300 tracking-wider uppercase truncate leading-tight">
                                  {event.title}
                                </h4>
                                <span className={`inline-flex items-center justify-center text-[6.5px] font-black uppercase tracking-widest px-1.5 h-[14px] rounded shrink-0 ${isFirst ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 border border-white/10 text-white/30'}`}>
                                  {event.type?.replace(/_/g, ' ')}
                                </span>
                              </div>
                              {/* Row 2: Date & Time */}
                              <div className="flex items-center gap-1.5 text-[8px] font-black tracking-widest text-white/40 uppercase leading-tight">
                                <span>{new Date(event.date).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                <span className="text-white/20">•</span>
                                <span className="text-gold-accent/80">{new Date(event.date).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })} WITA</span>
                              </div>
                              {/* Row 3: Description */}
                              <p className="text-[9.5px] font-bold text-white/50 leading-snug tracking-wide group-hover/item:text-white/90 transition-colors">
                                {event.description}
                              </p>
                              {/* Row 4: Actor (jika ada) */}
                              {event.actor && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="material-symbols-outlined text-white/20" style={{ fontSize: '9px' }}>person</span>
                                  <span className="text-[7.5px] font-black text-white/20 uppercase tracking-widest">{event.actor}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {billingEditor && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="w-full max-w-[320px] bg-[#0f141e]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl p-5 relative animate-in fade-in zoom-in-95">
              <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-gold-accent/10 blur-3xl backdrop-blur-md" />
              </div>

              {/* Header */}
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/[0.05] pb-3 relative z-10">
                <div className="space-y-0.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gold-accent">
                    Konfigurasi Invoice
                  </p>
                  <h3 className="text-sm font-black text-white tracking-tight uppercase">
                    Periode Tagihan
                  </h3>
                  <p className="text-[9px] font-bold text-white/40 leading-relaxed tracking-wide">
                    Atur siklus penagihan reguler.
                  </p>
                </div>
                <button
                  className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-white/40 transition-all hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 backdrop-blur-md shrink-0 group"
                  onClick={() => setBillingEditor(null)}
                  type="button"
                  title="Tutup"
                >
                  <span className="material-symbols-outlined text-[14px] transition-transform group-hover:rotate-90">
                    close
                  </span>
                </button>
              </div>

              {/* Form */}
              <form className="space-y-4 relative z-10" onSubmit={handleSaveBillingCycle}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative space-y-1.5 mt-0.5">
                    <label className="ml-1 block text-[8px] font-black uppercase tracking-widest text-white/20">
                      Frekuensi
                    </label>
                    <div className="relative">
                      <input
                        className="h-8 w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 text-[10px] font-bold text-white outline-none focus:border-gold-accent/40 focus:bg-white/[0.04] transition-all placeholder:text-white/20 backdrop-blur-3xl"
                        onChange={(e) =>
                          setBillingEditor((previous) =>
                            previous ? { ...previous, billingEvery: e.target.value } : previous,
                          )
                        }
                        type="number"
                        value={billingEditor.billingEvery}
                        min="1"
                      />
                    </div>
                  </div>
                  <div className="mt-0.5">
                    <GlassSelect
                      label="Satuan Waktu"
                      value={billingEditor.billingUnit}
                      onChange={(value) =>
                        setBillingEditor((previous) =>
                          previous ? { ...previous, billingUnit: value } : previous,
                        )
                      }
                      options={[
                        { value: "hari", label: "Hari" },
                        { value: "bulan", label: "Bulan" },
                        { value: "tahun", label: "Tahun" },
                      ]}
                      className="h-8 !rounded-lg"
                      textClass="text-[10px] font-bold tracking-wide"
                      optionTextClass="text-[10px] font-bold tracking-wide"
                    />
                  </div>
                </div>

                {billingError && (
                  <div className="p-3 rounded-xl border border-[#ff2400]/30 bg-[#ff2400]/10 text-[10px] font-bold text-[#ff2400] flex items-start gap-2">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    <span className="mt-0.5">{billingError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    className="h-8 px-4 rounded-lg border border-white/10 bg-white/5 text-[9px] font-bold tracking-wide text-white/60 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md"
                    onClick={() => setBillingEditor(null)}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="h-8 px-5 rounded-lg bg-gold-accent border border-gold-accent/20 text-[9px] font-bold tracking-wide text-[#0f141e] hover:bg-gold-accent/90 transition-all shadow-gold-glow disabled:opacity-50 flex items-center gap-1.5"
                    disabled={isSavingBilling}
                    type="submit"
                  >
                    {isSavingBilling ? (
                      <>
                        <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[14px]">save</span>
                        Simpan
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

        {versionEditor && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 backdrop-blur-md bg-black/60 animate-fade-in duration-300">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl glass-card backdrop-blur-xl p-4 md:p-5 border border-white/20 shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 relative">
              {/* Header */}
              <div className="mb-2 flex items-start justify-between gap-4 border-b border-white/10 pb-2">
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gold-accent">
                    Ubah / Upgrade Paket
                  </p>
                  <h3 className="text-lg font-black text-white tracking-tight uppercase leading-none">
                    {tenantName}
                  </h3>
                  <p className="text-[9px] font-bold text-white/50 leading-snug">
                    Paket lama berlaku sampai akhir bulan berjalan. Paket baru aktif mulai bulan berikutnya.
                  </p>
                </div>
                <button
                  className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-white/40 transition-all hover:bg-white/10 hover:text-white backdrop-blur-md shrink-0"
                  onClick={() => setVersionEditor(null)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </div>

              {/* Form */}
              <form className="space-y-2" onSubmit={handleCreateVersion}>
                <GlassSelect
                  label="Alasan Kontrak"
                  value={versionEditor.reason ?? "ubah_paket"}
                  onChange={(value) =>
                    setVersionEditor((previous) =>
                      previous ? { ...previous, reason: value } : previous,
                    )
                  }
                  options={[
                    { value: "ubah_paket", label: "Ubah Paket" },
                    { value: "lainnya", label: "Alasan Lain" },
                  ]}
                />
                {(versionEditor.reason ?? "ubah_paket") === "lainnya" && (
                  <GlassInput
                    label="Input Alasan Lain"
                    value={versionEditor.customReason ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, customReason: e.target.value } : previous,
                      )
                    }
                    placeholder="Tulis alasan perubahan kontrak"
                  />
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <GlassInput
                    label="Tanggal Request Perubahan"
                    type="date"
                    value={versionEditor.requestedDate ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, requestedDate: e.target.value } : previous,
                      )
                    }
                  />
                  <GlassInput
                    label="Nomor Kontrak / BAK Baru"
                    value={versionEditor.contractNumber ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, contractNumber: e.target.value } : previous,
                      )
                    }
                    placeholder="Opsional"
                  />
                </div>

                <GlassSelect
                  label="Paket Baru"
                  value={versionEditor.packageType ?? "sharing_core"}
                  onChange={(value) =>
                    setVersionEditor((previous) =>
                      previous ? { ...previous, packageType: value } : previous,
                    )
                  }
                  options={[
                    { value: "sharing_core", label: "Sharing Core" },
                    { value: "core", label: "Core" },
                  ]}
                />

                {(versionEditor.packageType ?? "sharing_core") === "sharing_core" ? (
                  <GlassInput
                    label="Shared Core Ratio Baru"
                    value={versionEditor.ratio ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, ratio: e.target.value } : previous,
                      )
                    }
                    placeholder="Contoh: 1:32"
                  />
                ) : (
                  <GlassInput
                    label="Jumlah Core Baru"
                    type="number"
                    value={versionEditor.coreTotal ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, coreTotal: e.target.value } : previous,
                      )
                    }
                    placeholder="Contoh: 2"
                  />
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <GlassInput
                    label="Nominal Bulanan Baru"
                    type="text"
                    value={versionEditor.monthlyAmount ?? ""}
                    onChange={(e) => {
                      const formattedVal = formatRupiahInput(e.target.value);
                      const parsedVal = parseRupiahInput(formattedVal);
                      setVersionEditor((previous) =>
                        previous ? {
                          ...previous,
                          monthlyAmount: formattedVal,
                          yearlyAmount: parsedVal > 0 ? formatRupiahInput(parsedVal * 12) : ""
                        } : previous,
                      );
                    }}
                    placeholder="Contoh: 1.500.000"
                  />
                  <GlassInput
                    label="Nominal Tahunan Baru"
                    type="text"
                    value={versionEditor.yearlyAmount ?? ""}
                    onChange={(e) =>
                      setVersionEditor((previous) =>
                        previous ? { ...previous, yearlyAmount: formatRupiahInput(e.target.value) } : previous,
                      )
                    }
                    placeholder="Otomatis 12x bulanan"
                  />
                </div>

                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[9px] font-bold text-blue-400 leading-snug backdrop-blur-md">
                  Paket lama berlaku sampai {formatDate(addDaysToIsoDate(getUpgradeEffectiveStartPreview(versionEditor.requestedDate), -1))}. Paket baru aktif mulai {formatDate(getUpgradeEffectiveStartPreview(versionEditor.requestedDate))}. Invoice belum lunas mulai bulan tersebut akan menyesuaikan.
                </div>

                {versionError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-400 backdrop-blur-md">
                    {versionError}
                  </div>
                )}

                <div className="mt-3 flex justify-end gap-3 border-t border-white/10 pt-3">
                  <button
                    className="h-8 px-4 rounded-lg border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/40 transition-all hover:bg-white/10 hover:text-white"
                    onClick={() => setVersionEditor(null)}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="h-8 px-4 rounded-lg bg-gold-accent text-[9px] font-black uppercase tracking-widest text-[#0f141e] transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 shadow-gold-glow flex items-center gap-1.5"
                    disabled={isSubmittingVersion}
                    type="submit"
                  >
                    {isSubmittingVersion ? (
                      <>Menyimpan...</>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[12px]">save</span>
                        Simpan Perubahan
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

        {isPaymentRealizationModalOpen && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f141e]/95 shadow-glass-depth">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-accent">Tambah Realisasi</p>
                  <h3 className="text-lg font-black uppercase tracking-tight text-white">Input Pembayaran Tenant</h3>
                  <p className="text-[10px] font-bold text-white/35">
                    Data nominal di modal ini akan tersinkron ke monitoring kontrak untuk
                    {" "}
                    {activeBillingPeriod?.contractNumber ?? contract?.contractNumber ?? contract?.contract_number ?? "kontrak aktif tenant"}.
                  </p>
                </div>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
                  onClick={closePaymentRealizationModal}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form className="space-y-4 px-5 py-5" onSubmit={handleCreatePaymentRealization}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Periode Dari Bulan</p>
                    <DateInput
                      value={paymentRealizationDraft.periodStartMonth}
                      onChange={(value) => setPaymentRealizationDraft((previous) => ({ ...previous, periodStartMonth: value }))}
                      displayMode="month-year"
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-gold-accent/40"
                      inputClass="h-full w-full bg-transparent px-3 text-[10px] font-bold text-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Periode Sampai Bulan</p>
                    <DateInput
                      value={paymentRealizationDraft.periodEndMonth}
                      onChange={(value) => setPaymentRealizationDraft((previous) => ({ ...previous, periodEndMonth: value }))}
                      displayMode="month-year"
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-gold-accent/40"
                      inputClass="h-full w-full bg-transparent px-3 text-[10px] font-bold text-white outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Besaran Pembayaran</p>
                  <input
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[11px] font-black text-white outline-none transition-all focus:border-gold-accent/40"
                    onChange={(event) => setPaymentRealizationDraft((previous) => ({
                      ...previous,
                      amount: formatRupiahInput(event.target.value),
                    }))}
                    placeholder="MASUKKAN NOMINAL PEMBAYARAN"
                    value={paymentRealizationDraft.amount}
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Berkas Pembayaran</p>
                  <div className="relative rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5">
                    <input
                      type="file"
                      className="absolute inset-0 z-10 cursor-pointer opacity-0"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setPaymentRealizationDraft((previous) => ({
                          ...previous,
                          uploadedFileName: file?.name ?? "",
                          uploadedFile: file,
                        }));
                      }}
                    />
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="material-symbols-outlined text-[24px] text-white/15">cloud_upload</span>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                        {paymentRealizationDraft.uploadedFileName || "Klik untuk memilih berkas pembayaran"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Catatan</p>
                  <textarea
                    className="min-h-[96px] w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[10px] font-bold text-white outline-none transition-all focus:border-gold-accent/40"
                    onChange={(event) => setPaymentRealizationDraft((previous) => ({ ...previous, notes: event.target.value }))}
                    placeholder="Catatan tambahan pembayaran (opsional)"
                    value={paymentRealizationDraft.notes}
                  />
                </div>

                {paymentRealizationError && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[10px] font-bold text-rose-300">
                    {paymentRealizationError}
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                  <button
                    className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-widest text-white/50 transition-all hover:bg-white/10 hover:text-white"
                    onClick={closePaymentRealizationModal}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="h-10 rounded-xl bg-gold-accent px-4 text-[10px] font-black uppercase tracking-widest text-[#0f141e] shadow-gold-glow transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
                    disabled={isSavingPaymentRealization}
                    type="submit"
                  >
                    {isSavingPaymentRealization ? "Menyimpan..." : "Simpan Realisasi"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

         {renewalConfirmData && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f141e]/80 backdrop-blur-sm px-4">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto overscroll-contain glass-card rounded-premium border border-white/10 shadow-glass-depth p-4 md:p-5 relative">
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-4 border-b border-white/[0.05] pb-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    Konfirmasi Perpanjangan Kontrak
                  </p>
                  <h3 className="text-lg font-black text-white tracking-tight uppercase">
                    Pilih Paket Perpanjangan
                  </h3>
                </div>
                <button
                  className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-white/40 transition-all hover:bg-white/10 hover:text-white backdrop-blur-md shrink-0"
                  onClick={() => setRenewalConfirmData(null)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>

              {/* Form */}
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/70 px-1">Periode Berjalan Awal</p>
                    <DateInput
                      value={renewalConfirmData.startDate}
                      onChange={(val) => setRenewalConfirmData(prev => ({ ...prev, startDate: val }))}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.02] transition-all focus-within:border-gold-accent/50 focus-within:bg-white/5"
                      inputClass="w-full h-full bg-transparent px-3 text-[10px] font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/70 px-1">Periode Berjalan Akhir</p>
                    <DateInput
                      value={renewalConfirmData.endDate}
                      onChange={(val) => setRenewalConfirmData(prev => ({ ...prev, endDate: val }))}
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.02] transition-all focus-within:border-gold-accent/50 focus-within:bg-white/5"
                      inputClass="w-full h-full bg-transparent px-3 text-[10px] font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 py-1.5">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/70 cursor-pointer">
                    <input
                      type="radio"
                      name="packageChoice"
                      checked={renewalConfirmData.usePreviousPackage}
                      onChange={() => setRenewalConfirmData(prev => ({ ...prev, usePreviousPackage: true }))}
                      className="accent-emerald-500 h-3.5 w-3.5"
                    />
                    Gunakan Paket Sebelumnya
                  </label>
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/70 cursor-pointer">
                    <input
                      type="radio"
                      name="packageChoice"
                      checked={!renewalConfirmData.usePreviousPackage}
                      onChange={() => setRenewalConfirmData(prev => ({ ...prev, usePreviousPackage: false }))}
                      className="accent-emerald-500 h-3.5 w-3.5"
                    />
                    Ubah Paket (Isi Manual)
                  </label>
                </div>

                {!renewalConfirmData.usePreviousPackage && (
                  <div className="space-y-2.5 p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                    <GlassSelect
                      label="Tipe Paket"
                      value={renewalConfirmData.packageType}
                      onChange={(val) => setRenewalConfirmData(prev => ({ ...prev, packageType: val }))}
                      options={[
                        { value: "core", label: "Core" },
                        { value: "sharing_core", label: "Sharing Core" },
                      ]}
                    />

                    {renewalConfirmData.packageType === "sharing_core" ? (
                      <GlassInput
                        label="Rasio Sharing (Contoh: 1/32)"
                        placeholder="1/32"
                        value={renewalConfirmData.ratio}
                        onChange={(e) => setRenewalConfirmData(prev => ({ ...prev, ratio: e.target.value }))}
                      />
                    ) : (
                      <GlassInput
                        label="Jumlah Core"
                        type="number"
                        min="1"
                        value={renewalConfirmData.coreTotal}
                        onChange={(e) => setRenewalConfirmData(prev => ({ ...prev, coreTotal: e.target.value }))}
                      />
                    )}

                    <GlassInput
                      label="Nominal / Bulan"
                      type="text"
                      value={formatRupiahInput(renewalConfirmData.monthlyAmount)}
                      onChange={(e) => setRenewalConfirmData(prev => ({ ...prev, monthlyAmount: formatRupiahInput(e.target.value) }))}
                    />
                  </div>
                )}

                <div className="space-y-3 p-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03]">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                      Atur Ulang Billing Iuran
                    </p>
                    <p className="text-[9px] font-bold text-white/35 leading-relaxed">
                      Berlaku untuk invoice aktif yang belum lunas setelah tanggapan perpanjangan dikonfirmasi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {[
                      { value: "monthly", label: "Per Bulan" },
                      { value: "quarterly", label: "3 Bulan" },
                      { value: "custom", label: "Custom" },
                    ].map((option) => (
                      <label
                        className={`flex h-10 items-center justify-center rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${renewalConfirmData.billingMode === option.value
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-white/10 bg-white/[0.02] text-white/45 hover:bg-white/[0.05] hover:text-white"
                          }`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="renewalBillingMode"
                          checked={renewalConfirmData.billingMode === option.value}
                          onChange={() =>
                            setRenewalConfirmData((previous) => {
                              if (!previous) {
                                return previous;
                              }

                              if (option.value === "monthly") {
                                return {
                                  ...previous,
                                  billingMode: option.value,
                                  billingEvery: "1",
                                  billingUnit: "bulan",
                                };
                              }
                              if (option.value === "quarterly") {
                                return {
                                  ...previous,
                                  billingMode: option.value,
                                  billingEvery: "3",
                                  billingUnit: "bulan",
                                };
                              }

                              return { ...previous, billingMode: option.value };
                            })
                          }
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  {renewalConfirmData.billingMode === "custom" && (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <GlassInput
                        label="Frekuensi Billing"
                        type="number"
                        min="1"
                        value={renewalConfirmData.billingEvery}
                        onChange={(e) => setRenewalConfirmData((previous) => (
                          previous ? { ...previous, billingEvery: e.target.value } : previous
                        ))}
                      />
                      <GlassSelect
                        label="Satuan Billing"
                        value={renewalConfirmData.billingUnit}
                        onChange={(value) => setRenewalConfirmData((previous) => (
                          previous ? { ...previous, billingUnit: value } : previous
                        ))}
                        options={[
                          { value: "hari", label: "Hari" },
                          { value: "bulan", label: "Bulan" },
                          { value: "tahun", label: "Tahun" },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex justify-end gap-3 border-t border-white/[0.05] pt-3">
                <button
                  className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/40 transition-all hover:bg-white/10 hover:text-white"
                  onClick={() => setRenewalConfirmData(null)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="h-9 px-4 rounded-xl bg-emerald-500 text-[9px] font-black uppercase tracking-widest text-[#0f141e] transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={async () => {
                    const { row, decision, file, followUpId, usePreviousPackage, packageType, coreTotal, ratio, monthlyAmount, billingMode, billingEvery, billingUnit, startDate, endDate } = renewalConfirmData;

                    let packageOverrides = null;
                    if (!usePreviousPackage) {
                      const parsedAmount = parseRupiahInput(monthlyAmount);
                      const parsedCoreTotal = Number(coreTotal);
                      const normalizedPackageType = packageType === "sharing_core" ? "sharing_core" : "core";
                      const normalizedRatio = String(ratio ?? "").trim();

                      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                        setError("Nominal paket perpanjangan wajib lebih dari 0.");
                        return;
                      }
                      if (normalizedPackageType === "core" && (!Number.isFinite(parsedCoreTotal) || parsedCoreTotal <= 0)) {
                        setError("Jumlah core paket perpanjangan wajib lebih dari 0.");
                        return;
                      }
                      if (normalizedPackageType === "sharing_core" && !/^[1-9]\d*[:/][1-9]\d*$/.test(normalizedRatio)) {
                        setError("Rasio sharing core perpanjangan tidak valid. Gunakan format seperti 1:8 atau 1/32.");
                        return;
                      }

                      packageOverrides = {
                        coreType: normalizedPackageType,
                        coreTotal: normalizedPackageType === "core" ? parsedCoreTotal : 0,
                        sharedCoreRatio: normalizedPackageType === "sharing_core" ? normalizedRatio.replace("/", ":") : null,
                        monthlyAmount: parsedAmount,
                        yearlyAmount: parsedAmount * 12,
                      };
                    }

                    const nextBillingCycle = billingMode === "monthly"
                      ? { every: 1, unit: "bulan" }
                      : billingMode === "quarterly"
                        ? { every: 3, unit: "bulan" }
                        : { every: Number(billingEvery), unit: String(billingUnit ?? "bulan") };

                    if (
                      !Number.isFinite(nextBillingCycle.every)
                      || nextBillingCycle.every <= 0
                      || !["hari", "bulan", "tahun"].includes(nextBillingCycle.unit)
                    ) {
                      setError("Periode billing perpanjangan harus diisi dengan frekuensi lebih dari 0 dan satuan yang valid.");
                      return;
                    }

                    setRenewalConfirmData(null);
                    await handleRespondTenantRenewal(row, decision, file, followUpId, packageOverrides, nextBillingCycle, { startDate, endDate });
                  }}
                  type="button"
                >
                  Konfirmasi
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {deleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl text-[#0f141e]">
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-widest text-red-600">
                  Hapus Lokasi
                </p>
                <h3 className="text-xl font-bold text-on-surface">
                  {tenantName}
                </h3>
              </div>
              <p className="text-sm text-on-surface-variant">
                {deletePermanently 
                  ? "Peringatan: Lokasi ini beserta seluruh riwayat kontrak, invoice, dokumen, dan jalurnya akan dihapus secara PERMANEN dari database. Tindakan ini tidak dapat dibatalkan!"
                  : "Lokasi ini akan dipindahkan ke sampah dan tidak lagi tampil di daftar lokasi aktif."}
              </p>

              <label className="mt-4 flex items-center gap-2 cursor-pointer select-none p-2.5 rounded-xl border border-red-100 bg-red-50/30 hover:bg-red-50/60 transition-all text-left">
                <input
                  type="checkbox"
                  checked={deletePermanently}
                  onChange={(e) => setDeletePermanently(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Hapus Permanen dari Database</span>
              </label>

              {deleteError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-slate-50"
                  onClick={() => setDeleteModalOpen(false)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDeletingTenant}
                  onClick={() => void handleDeleteTenant()}
                  type="button"
                >
                  {isDeletingTenant 
                    ? "Menghapus..." 
                    : deletePermanently 
                      ? "Hapus Permanen" 
                      : "Hapus Lokasi"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default TenantDetailPage;
