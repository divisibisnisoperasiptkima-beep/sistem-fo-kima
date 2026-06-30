import { invoiceStatusBadgeClass } from "./constants";

const normalizeApiOrigin = (value) => {
    const normalizedValue = value.replace(/\/$/, "");

    try {
        const parsedUrl = new URL(normalizedValue);
        if (parsedUrl.hostname === "0.0.0.0" || parsedUrl.hostname === "::") {
            parsedUrl.hostname = "localhost";
        }

        return parsedUrl.toString().replace(/\/$/, "");
    } catch {
        return normalizedValue;
    }
};

const resolveApiBaseUrl = () => {
    const envBaseUrl = typeof import.meta.env.VITE_API_BASE_URL === "string"
        ? import.meta.env.VITE_API_BASE_URL.trim()
        : "";

    const fallbackHost = typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "localhost";
    const safeFallbackHost = fallbackHost === "0.0.0.0" || fallbackHost === "::"
        ? "localhost"
        : fallbackHost;
    const fallbackProtocol = typeof window !== "undefined" && window.location?.protocol === "https:"
        ? "https:"
        : "http:";

    const fallbackBaseUrl = `${fallbackProtocol}//${safeFallbackHost}:4000`;
    const normalizedBaseUrl = normalizeApiOrigin(envBaseUrl || fallbackBaseUrl);

    // Keep fetch calls consistent with `${API_BASE_URL}/api/...` even when env includes `/api`.
    return normalizedBaseUrl.endsWith("/api")
        ? normalizedBaseUrl.slice(0, -4)
        : normalizedBaseUrl;
};

export const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = 10_000;

export const normalizeErrorMessage = (result, fallback) => {
    if (Array.isArray(result?.message)) {
        return result.message.join(", ");
    }

    if (typeof result?.message === "string" && result.message.trim()) {
        return result.message;
    }

    return fallback;
};

export const parseDateValue = (value) => {
    if (!value) {
        return null;
    }

    const raw = typeof value === "string" ? value : String(value);
    const parsed = raw.includes("T") ? new Date(raw) : new Date(`${raw}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
};

export const formatDate = (value) => {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(parsed);
};

export const formatDateTime = (value) => {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed);
};

export const formatMonthYear = (value) => {
    const parsed = parseDateValue(value);
    if (!parsed) {
        return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
    }).format(parsed);
};

export const formatCurrency = (value) => {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number.isNaN(amount) ? 0 : amount);
};

export const toTitleCase = (value) => {
    if (!value) {
        return "-";
    }

    return String(value)
        .replaceAll("_", " ")
        .split(" ")
        .filter(Boolean)
        .map((segment) => segment[0].toUpperCase() + segment.slice(1))
        .join(" ");
};

export const formatContractPeriod = (startDate, endDate) => {
    if (!startDate && !endDate) {
        return "-";
    }

    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

export const formatCoreAllocation = (coreType, coreTotal, sharingRatio) => {
    const normalizedTotal = Number(coreTotal ?? 0);
    if (!coreType || !Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
        return "-";
    }

    if (coreType === "sharing_core") {
        const normalizedRatio = typeof sharingRatio === "string" ? sharingRatio.trim() : "";
        return normalizedRatio
            ? `Sharing Core (Rasio ${normalizedRatio})`
            : "Sharing Core";
    }

    return `Core (${normalizedTotal})`;
};

export const addDaysToIsoDate = (isoDate, days) => {
    const parsed = parseDateValue(isoDate);
    if (!parsed || !Number.isFinite(Number(days))) {
        return "";
    }

    const next = new Date(parsed);
    next.setUTCDate(next.getUTCDate() + Math.round(Number(days)));
    return next.toISOString().slice(0, 10);
};

export const getNextMonthIsoDate = (isoDate, day = null) => {
    const parsed = parseDateValue(isoDate);
    if (!parsed) {
        return "";
    }

    const next = new Date(parsed);
    next.setUTCMonth(next.getUTCMonth() + 1);

    if (day == null) {
        return next.toISOString().slice(0, 10);
    }

    const normalizedDay = Number(day);
    if (!Number.isFinite(normalizedDay)) {
        return "";
    }

    const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(Math.max(Math.round(normalizedDay), 1), maxDay));

    return next.toISOString().slice(0, 10);
};

export const resolveInvoiceDueMonthIsoDate = (periodStartDate) => {
    const parsed = parseDateValue(periodStartDate);
    if (!parsed) {
        return "";
    }

    const startDay = parsed.getUTCDate();
    const dueMonthOffset = startDay <= 15 ? 0 : 1;
    const dueMonthDate = new Date(Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + dueMonthOffset,
        1,
    ));

    return dueMonthDate.toISOString().slice(0, 10);
};

export const shiftIsoDateByBillingCycle = (isoDate, every, unit) => {
    const parsed = parseDateValue(isoDate);
    const normalizedEvery = Number(every);
    if (!parsed || !Number.isFinite(normalizedEvery) || normalizedEvery <= 0) {
        return "";
    }

    const next = new Date(parsed);
    if (unit === "hari") {
        next.setUTCDate(next.getUTCDate() + Math.round(normalizedEvery));
    } else if (unit === "tahun") {
        next.setUTCFullYear(next.getUTCFullYear() + Math.round(normalizedEvery));
    } else {
        next.setUTCMonth(next.getUTCMonth() + Math.round(normalizedEvery));
    }

    return next.toISOString().slice(0, 10);
};

export const resolveBillingCycle = (billingPeriodMode, billingCustomEvery, billingCustomUnit) => {
    if (billingPeriodMode === "3bulanan") {
        return { every: 3, unit: "bulan" };
    }

    if (billingPeriodMode === "custom") {
        const every = Number(billingCustomEvery);
        if (!Number.isFinite(every) || every <= 0) {
            return null;
        }

        const unit = ["hari", "bulan", "tahun"].includes(billingCustomUnit)
            ? billingCustomUnit
            : "bulan";
        return { every: Math.round(every), unit };
    }

    return { every: 1, unit: "bulan" };
};

export const buildInvoiceScheduleRows = (periodStartDate, periodEndDate, billingCycle) => {
    if (!periodStartDate || !periodEndDate || !billingCycle) {
        return [];
    }

    if (periodStartDate > periodEndDate) {
        return [];
    }

    const rows = [];
    let cursor = periodStartDate;
    let safetyCounter = 0;

    while (cursor <= periodEndDate && safetyCounter < 240) {
        safetyCounter += 1;

        const nextCursor = shiftIsoDateByBillingCycle(cursor, billingCycle.every, billingCycle.unit);
        if (!nextCursor || nextCursor <= cursor) {
            break;
        }

        const calculatedEnd = addDaysToIsoDate(nextCursor, -1);
        const periodRowEndDate = calculatedEnd && calculatedEnd < periodEndDate
            ? calculatedEnd
            : periodEndDate;

        rows.push({
            key: `auto-${cursor}-${periodRowEndDate}`,
            kind: "auto",
            periodStartDate: cursor,
            periodEndDate: periodRowEndDate,
            invoiceNumber: "",
            amount: "",
            paidAt: "",
            invoiceFileName: "",
            paymentProofFileName: "",
        });

        cursor = nextCursor;
    }

    return rows;
};

const getInvoicePeriodKey = (invoice) => {
    const startDate = String(invoice?.periodStartDate ?? invoice?.period_start_date ?? "").slice(0, 10);
    const endDate = String(invoice?.periodEndDate ?? invoice?.period_end_date ?? "").slice(0, 10);
    return startDate && endDate ? `${startDate}-${endDate}` : "";
};

export const hasProtectedInvoiceSettlement = (invoice) => (
    String(invoice?.status ?? "").toLowerCase() === "lunas"
    || Boolean(invoice?.paidAt ?? invoice?.paid_at)
    || Boolean(invoice?.invoiceFileUrl ?? invoice?.invoice_file_url)
    || Boolean(invoice?.paymentProofFileUrl ?? invoice?.payment_proof_file_url)
    || Boolean(invoice?.documentId ?? invoice?.document_id)
    || (Array.isArray(invoice?.invoiceFollowUps ?? invoice?.invoice_follow_ups)
        && (invoice.invoiceFollowUps ?? invoice.invoice_follow_ups).length > 0)
);

export const buildInvoiceScheduleReconciliation = (existingInvoices = [], expectedRows = []) => {
    const existing = [...existingInvoices].sort((left, right) => {
        const dateCompare = String(left?.periodStartDate ?? left?.period_start_date ?? "")
            .localeCompare(String(right?.periodStartDate ?? right?.period_start_date ?? ""));
        return dateCompare || Number(left?.id ?? 0) - Number(right?.id ?? 0);
    });
    const expected = [...expectedRows];
    const matchedInvoiceIds = new Set();
    const matchedExpectedIndexes = new Set();
    const updates = [];

    expected.forEach((row, expectedIndex) => {
        const key = `${row.periodStartDate}-${row.periodEndDate}`;
        const invoice = existing.find((candidate) => (
            !matchedInvoiceIds.has(candidate.id) && getInvoicePeriodKey(candidate) === key
        ));
        if (!invoice) return;
        matchedInvoiceIds.add(invoice.id);
        matchedExpectedIndexes.add(expectedIndex);
        updates.push({ invoice, row });
    });

    const remainingInvoices = existing.filter((invoice) => !matchedInvoiceIds.has(invoice.id));
    const remainingExpected = expected
        .map((row, index) => ({ row, index }))
        .filter(({ index }) => !matchedExpectedIndexes.has(index));
    const reusableCount = Math.min(remainingInvoices.length, remainingExpected.length);

    for (let index = 0; index < reusableCount; index += 1) {
        updates.push({ invoice: remainingInvoices[index], row: remainingExpected[index].row });
    }

    const removals = remainingInvoices.slice(reusableCount);
    const blockedRemovals = removals.filter(hasProtectedInvoiceSettlement);
    const creates = remainingExpected.slice(reusableCount).map(({ row }) => row);

    return {
        updates,
        creates,
        removals: removals.filter((invoice) => !hasProtectedInvoiceSettlement(invoice)),
        blockedRemovals,
    };
};

export const getRemainingRentalDays = (contractEndDate) => {
    const parsedEndDate = parseDateValue(contractEndDate);
    if (!parsedEndDate) {
        return null;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const normalizedEndDate = new Date(parsedEndDate);
    normalizedEndDate.setUTCHours(0, 0, 0, 0);

    return Math.ceil((normalizedEndDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

export const getIspContractActionItems = (contractRows) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (Array.isArray(contractRows) ? contractRows : []).flatMap((row) => {
        const items = [];
        const endDate = parseDateValue(row?.periodEnd);
        const daysLeft = endDate
            ? Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
            : null;

        const followUps = Array.isArray(row?.renewalFollowUps) ? row.renewalFollowUps : [];
        const latestOpenFollowUp = [...followUps]
            .filter((item) => item?.status !== "completed")
            .sort((left, right) => Number(right?.splitOrder ?? 0) - Number(left?.splitOrder ?? 0))[0] ?? null;

        if (latestOpenFollowUp?.renewalFileUrl) {
            items.push({
                key: `${row.id}-${latestOpenFollowUp.id}-pending`,
                rowId: row.id,
                followUpId: latestOpenFollowUp.id,
                tone: "blue",
                title: "Menunggu Tanggapan ISP",
                description: "Berkas perpanjangan sudah diunggah. Lanjutkan dengan upload tanggapan ISP: lanjut atau tidak.",
                actionType: "response",
            });
        }

        if (row?.renewalStatus === "needs_completion") {
            items.push({
                key: `${row.id}-needs-completion`,
                rowId: row.id,
                tone: "amber",
                title: "Lengkapi Data Kontrak Baru",
                description: "Baris kontrak baru sudah dibuat otomatis. Isi nomor kontrak dan periode berjalan kontrak baru.",
                actionType: "edit",
            });
        }

        if (latestOpenFollowUp && !latestOpenFollowUp.renewalFileUrl) {
            items.push({
                key: `${row.id}-${latestOpenFollowUp.id}-renewal-warning`,
                rowId: row.id,
                followUpId: latestOpenFollowUp.id,
                tone: "red",
                title: latestOpenFollowUp.title || (daysLeft >= 0
                    ? `Kontrak berakhir dalam ${daysLeft} hari`
                    : "Kontrak sudah melewati masa berlaku"),
                description: latestOpenFollowUp.description || "Segera unggah berkas perpanjangan untuk konfirmasi lanjut atau tidak ke ISP.",
                actionType: "renewal",
            });
        }

        if ((row?.renewalStatus === "active" || row?.renewalStatus === "needs_completion") && !row?.bakFileUrl) {
            items.push({
                key: `${row.id}-bak-missing`,
                rowId: row.id,
                tone: "orange",
                title: "Upload BAK",
                description: "Berkas BAK belum diunggah pada baris kontrak ini dan masih perlu ditindaklanjuti.",
                actionType: "bak",
            });
        }

        return items;
    });
};

export const getIspContractRowCoverage = (contractRows) => {
    const rows = Array.isArray(contractRows) ? contractRows : [];
    const hasValue = (value) => String(value ?? "").trim().length > 0;

    return {
        hasReference: rows.some((row) => hasValue(row?.contractReference ?? row?.contract_reference)),
        hasStartDate: rows.some((row) => hasValue(row?.contractStartDate ?? row?.contract_start_date)),
        hasPeriod: rows.some((row) => (
            hasValue(row?.periodStart ?? row?.period_start)
            && hasValue(row?.periodEnd ?? row?.period_end)
        )),
        hasBakFile: rows.some((row) => hasValue(row?.bakFileUrl ?? row?.bak_file_url)),
        hasContractFile: rows.some((row) => hasValue(row?.contractFileUrl ?? row?.contract_file_url)),
    };
};

export const isExternalFileUrl = (value) =>
    typeof value === "string" && /^https?:\/\//i.test(value.trim());

export const isOpenableFileUrl = (value) =>
    typeof value === "string" && /^(https?:\/\/|data:|blob:)/i.test(value.trim());

export const openSafeFile = (fileUrl, fileName = "dokumen.pdf") => {
    if (!fileUrl) return;

    // Jika ini adalah URL biasa (http/https), buka langsung
    if (/^https?:\/\//i.test(fileUrl)) {
        window.open(fileUrl, "_blank", "noreferrer");
        return;
    }

    // Jika ini adalah Data URL (Base64)
    if (fileUrl.startsWith("data:")) {
        try {
            const parts = fileUrl.split(",");
            const mime = parts[0].match(/:(.*?);/)[1];
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            const win = window.open(blobUrl, "_blank");
            if (win) {
                win.focus();
                // Opsional: bersihkan URL memori setelah beberapa saat
                setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            } else {
                // Fallback jika pop-up diblokir: paksa download
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = fileName;
                link.click();
            }
        } catch (e) {
            console.error("Gagal membuka file:", e);
            alert("Gagal membuka berkas. Format data tidak valid.");
        }
        return;
    }

    // Fallback terakhir
    window.open(fileUrl, "_blank", "noreferrer");
};

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) {
        resolve("");
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
        reject(new Error(`Gagal membaca file ${file.name}.`));
    };
    reader.readAsDataURL(file);
});

export const formatPackageRatio = (value) => {
    if (value == null || value === "") {
        return null;
    }

    return String(value).trim().replace(":", "/");
};

const getDateValue = (value) => {
    const timestamp = parseDateValue(value)?.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const getContractVersionNumber = (version) => Number(version?.versionNumber ?? version?.version_number ?? 0);
const getTodayIso = () => new Date().toISOString().slice(0, 10);
const normalizeOperationalStatus = (status) => String(status ?? "").trim().toLowerCase();
const isPendingOperationalStatus = (status) => ["belum_beroperasi", "belum beroperasi", "belum"].includes(normalizeOperationalStatus(status));
const isStoppedStatus = (status) => ["berhenti", "nonaktif"].includes(normalizeOperationalStatus(status));
const getStartDate = (item) => item?.startDate ?? item?.start_date ?? null;
const getEndDate = (item) => item?.endDate ?? item?.end_date ?? null;
const isDateInPeriod = (item, date) => getStartDate(item) <= date && getEndDate(item) >= date;

const sortContractVersions = (versions = []) => [...versions]
    .filter(version => !(version?.deletedAt ?? version?.deleted_at))
    .sort((left, right) => {
        const versionDiff = getContractVersionNumber(right) - getContractVersionNumber(left);
        if (versionDiff !== 0) {
            return versionDiff;
        }

        return getDateValue(right.endDate ?? right.end_date ?? right.startDate ?? right.start_date)
            - getDateValue(left.endDate ?? left.end_date ?? left.startDate ?? left.start_date);
    });

export const getLatestContractVersion = (contract) => sortContractVersions(contract?.versions)[0] ?? null;

export const getEffectiveContractVersion = (contract, date = getTodayIso()) => (
    sortContractVersions(contract?.versions).find(version => isDateInPeriod(version, date))
    ?? null
);

const getContractLatestPeriodTimestamp = (contract) => {
    const latestVersion = getLatestContractVersion(contract);
    return getDateValue(
        latestVersion?.endDate
            ?? latestVersion?.end_date
            ?? latestVersion?.startDate
            ?? latestVersion?.start_date
            ?? contract?.endDate
            ?? contract?.end_date
            ?? contract?.startDate
            ?? contract?.start_date,
    );
};

export const getCustomerPrimaryContract = (customer, date = getTodayIso()) => {
    if (!Array.isArray(customer?.contracts)) return null;

    const contracts = [...customer.contracts].filter(contract => !(contract?.deletedAt ?? contract?.deleted_at));
    return contracts.find(contract => isDateInPeriod(contract, date))
        ?? contracts.find(contract => getStartDate(contract) > date)
        ?? contracts.sort((left, right) => getContractLatestPeriodTimestamp(right) - getContractLatestPeriodTimestamp(left))[0]
        ?? null;
};

export const getCustomerInitialContract = (customer) => (
    Array.isArray(customer?.contracts)
        ? [...customer.contracts].sort((left, right) => getDateValue(left.startDate ?? left.start_date) - getDateValue(right.startDate ?? right.start_date))[0]
        : null
);

export const getCustomerSharedCoreRatio = (customer) => {
    const contract = getCustomerPrimaryContract(customer);
    const effectiveVersion = getEffectiveContractVersion(contract);
    const latestVersion = getLatestContractVersion(contract);

    return effectiveVersion?.sharedCoreRatio
        ?? effectiveVersion?.shared_core_ratio
        ?? latestVersion?.sharedCoreRatio
        ?? latestVersion?.shared_core_ratio
        ?? contract?.sharingRatio
        ?? contract?.sharing_ratio
        ?? null;
};

export const resolveCustomerPackageInfo = (customer) => {
    const contract = getCustomerPrimaryContract(customer);
    const effectiveVersion = getEffectiveContractVersion(contract);
    const latestVersion = getLatestContractVersion(contract);
    const sharedCoreRatio = getCustomerSharedCoreRatio(customer);
    const rawPackage = String(
        effectiveVersion?.core_type
            ?? effectiveVersion?.coreType
            ?? latestVersion?.core_type
            ?? latestVersion?.coreType
            ?? contract?.core_type
            ?? contract?.coreType
            ?? "",
    ).toLowerCase();
    const isSharingPackage = rawPackage.includes("shar") || rawPackage === "shared";
    const isCorePackage = rawPackage.includes("core") || rawPackage === "";

    if (isSharingPackage) {
        return {
            paket: "sharing_core",
            jumlah: formatPackageRatio(
                sharedCoreRatio
                    ?? effectiveVersion?.shared_core_ratio
                    ?? effectiveVersion?.sharedCoreRatio
                    ?? latestVersion?.shared_core_ratio
                    ?? latestVersion?.sharedCoreRatio
                    ?? contract?.sharing_ratio
                    ?? contract?.sharingRatio,
            ),
        };
    }

    if (isCorePackage) {
        return {
            paket: "core",
            jumlah: effectiveVersion?.core_total
                ?? effectiveVersion?.coreTotal
                ?? latestVersion?.core_total
                ?? latestVersion?.coreTotal
                ?? contract?.core_total
                ?? contract?.coreTotal
                ?? null,
        };
    }

    return {
        paket: null,
        jumlah: null,
    };
};

export const resolveCustomerContractPeriodInfo = (customer) => {
    const contract = getCustomerPrimaryContract(customer);
    const initialContract = getCustomerInitialContract(customer);
    const effectiveVersion = getEffectiveContractVersion(contract);
    const latestVersion = getLatestContractVersion(contract);

    return {
        contractStartDate: customer?.contract_start_date
            ?? initialContract?.start_date
            ?? initialContract?.startDate
            ?? contract?.start_date
            ?? contract?.startDate
            ?? effectiveVersion?.start_date
            ?? effectiveVersion?.startDate
            ?? latestVersion?.start_date
            ?? latestVersion?.startDate
            ?? null,
        contractPeriodStart: effectiveVersion?.start_date
            ?? effectiveVersion?.startDate
            ?? latestVersion?.start_date
            ?? latestVersion?.startDate
            ?? contract?.start_date
            ?? contract?.startDate
            ?? null,
        contractPeriodEnd: effectiveVersion?.end_date
            ?? effectiveVersion?.endDate
            ?? latestVersion?.end_date
            ?? latestVersion?.endDate
            ?? contract?.end_date
            ?? contract?.endDate
            ?? null,
    };
};

export const resolveCustomerOperationalStatus = (customer, todayIso = getTodayIso()) => {
    const rawStatus = normalizeOperationalStatus(customer?.status ?? customer?.rawStatus);
    if (isStoppedStatus(rawStatus)) return "berhenti";
    const contractPeriodInfo = resolveCustomerContractPeriodInfo(customer);
    const periodStart = String(
        contractPeriodInfo.contractPeriodStart
            ?? "",
    ).slice(0, 10);
    const periodEnd = String(
        contractPeriodInfo.contractPeriodEnd
            ?? "",
    ).slice(0, 10);

    if (periodStart && periodStart > todayIso) return "belum_beroperasi";
    if (periodEnd && periodEnd < todayIso) return "expired";
    if (["expired", "belum_diperpanjang"].includes(rawStatus)) {
        if (!periodEnd || periodEnd < todayIso) {
            return "expired";
        }
    }
    if (isPendingOperationalStatus(rawStatus)) return "belum_beroperasi";

    return "aktif";
};

const normalizeDisplayContractNumber = (value) => {
    const contractNumber = String(value ?? "").trim();
    return contractNumber && !contractNumber.startsWith("NO-BAK-") ? contractNumber : "-";
};

export const resolveCustomerContractNumber = (customer) => {
    const contract = getCustomerPrimaryContract(customer);
    const effectiveVersion = getEffectiveContractVersion(contract);
    const latestVersion = getLatestContractVersion(contract);

    return normalizeDisplayContractNumber(
        effectiveVersion?.contractNumber
            ?? effectiveVersion?.contract_number
            ?? latestVersion?.contractNumber
            ?? latestVersion?.contract_number
            ?? contract?.contractNumber
            ?? contract?.contract_number,
    );
};

const getCustomerTodoItems = (customer, bucket) => (
    Array.isArray(customer?.todoSummary?.[bucket]) ? customer.todoSummary[bucket] : []
);

const getInvoiceFollowUpsForAttention = (invoice) => (
    Array.isArray(invoice?.invoiceFollowUps)
        ? [...invoice.invoiceFollowUps].sort((left, right) => Number(left?.splitOrder ?? left?.split_order ?? 0) - Number(right?.splitOrder ?? right?.split_order ?? 0))
        : []
);

const isInvoicePaidForAttention = (invoice) => String(invoice?.status ?? "").toLowerCase() === "lunas"
    || isOpenableFileUrl(invoice?.paymentProofFileUrl ?? invoice?.payment_proof_file_url)
    || (typeof (invoice?.paidAt ?? invoice?.paid_at) === "string" && String(invoice?.paidAt ?? invoice?.paid_at).trim().length > 0);

const getInvoiceSetupWarningsForAttention = (invoice) => {
    const warnings = [];
    const dueDate = String(invoice?.workflowDueDate ?? invoice?.dueDate ?? invoice?.due_date ?? "").trim();
    const amount = Number(invoice?.workflowAmount ?? invoice?.amount ?? 0);

    if (!dueDate) warnings.push("missing_due_date");
    if (!Number.isFinite(amount) || amount <= 0) warnings.push("missing_amount");

    return warnings;
};

const getInvoiceWorkflowKeyForAttention = (invoice, rowsForSequence = [], todayIso = getTodayIso()) => {
    const followUps = getInvoiceFollowUpsForAttention(invoice);
    const firstFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? followUp?.split_order ?? 0) === 1) ?? null;
    const secondFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? followUp?.split_order ?? 0) === 2) ?? null;
    const thirdFollowUp = followUps.find((followUp) => Number(followUp?.splitOrder ?? followUp?.split_order ?? 0) === 3) ?? null;
    const setupWarnings = getInvoiceSetupWarningsForAttention(invoice);
    const dueDate = String(invoice?.workflowDueDate ?? invoice?.dueDate ?? invoice?.due_date ?? "").trim().slice(0, 10);
    const h7Date = dueDate ? addDaysToIsoDate(dueDate, -7) : "";
    const h3Date = dueDate ? addDaysToIsoDate(dueDate, -3) : "";
    const hasMainInvoiceFile = isOpenableFileUrl(invoice?.invoiceFileUrl ?? invoice?.invoice_file_url);
    const firstWarningUploaded = isOpenableFileUrl(firstFollowUp?.invoiceFileUrl ?? firstFollowUp?.invoice_file_url);
    const secondWarningUploaded = isOpenableFileUrl(secondFollowUp?.invoiceFileUrl ?? secondFollowUp?.invoice_file_url);
    const thirdWarningUploaded = isOpenableFileUrl(thirdFollowUp?.invoiceFileUrl ?? thirdFollowUp?.invoice_file_url);
    const paid = isInvoicePaidForAttention(invoice);
    const h7Reached = Boolean(h7Date && h7Date <= todayIso);
    const h3Reached = Boolean(h3Date && h3Date <= todayIso);
    const dueDateReached = Boolean(dueDate && dueDate <= todayIso);
    const hasAnyInvoiceFile = hasMainInvoiceFile || firstWarningUploaded || secondWarningUploaded || thirdWarningUploaded;
    const hasBlockingPreviousUnpaid = rowsForSequence.some(
        (candidate) => Number(candidate.paymentOrder ?? 0) < Number(invoice.paymentOrder ?? 0) && !isInvoicePaidForAttention(candidate),
    );

    if (paid) return "paid";
    if (setupWarnings.length > 0) return "pending_setup";
    if (dueDateReached && (secondWarningUploaded || h3Reached)) return "warning_unpaid";
    if (h3Reached && !hasBlockingPreviousUnpaid && (hasMainInvoiceFile || firstWarningUploaded) && !secondWarningUploaded) return "warning_required_h3";
    if (hasAnyInvoiceFile) return "waiting_payment_confirmation";
    if (h7Reached && !hasBlockingPreviousUnpaid) return "warning_required_h7";
    return "pending";
};

const getCustomerActiveInvoicesForAttention = (customer) => (
    Array.isArray(customer?.invoices)
        ? customer.invoices
            .filter((invoice) => !(invoice?.deletedAt ?? invoice?.deleted_at))
            .filter((invoice) => String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "active") === "active")
            .sort((left, right) => {
                const leftKey = `${left.periodYear ?? left.period_year ?? ""}-${String(left.periodMonth ?? left.period_month ?? "").padStart(2, "0")}`;
                const rightKey = `${right.periodYear ?? right.period_year ?? ""}-${String(right.periodMonth ?? right.period_month ?? "").padStart(2, "0")}`;
                return leftKey === rightKey ? Number(left.id ?? 0) - Number(right.id ?? 0) : leftKey.localeCompare(rightKey);
            })
        : []
).map((invoice, index) => ({ ...invoice, paymentOrder: index + 1 }));

const getCustomerDocumentByTypeAndContractId = (customer, documentType, contractId) => {
    const normalizedType = String(documentType ?? "").toLowerCase();
    const normalizedContractId = Number(contractId);

    return (Array.isArray(customer?.latestDocuments) ? customer.latestDocuments : Array.isArray(customer?.documents) ? customer.documents : [])
        .filter((document) => !(document?.deletedAt ?? document?.deleted_at))
        .find((document) => {
            const itemType = String(document?.jenisDokumen ?? document?.jenis_dokumen ?? "").toLowerCase();
            const itemContractId = Number(document?.contractId ?? document?.contract_id);
            return itemType === normalizedType && Number.isFinite(normalizedContractId) && itemContractId === normalizedContractId;
        }) ?? null;
};

const getContractRenewalAttentionCount = (contract, todayIso) => {
    const effectiveVersion = getEffectiveContractVersion(contract, todayIso);
    const periodEnd = String(
        effectiveVersion?.endDate
        ?? effectiveVersion?.end_date
        ?? contract?.endDate
        ?? contract?.end_date
        ?? "",
    ).slice(0, 10);

    if (!periodEnd) return 0;

    const periodEndTime = parseDateValue(periodEnd)?.getTime();
    const todayTime = parseDateValue(todayIso)?.getTime();
    const daysUntilEnd = Math.ceil(((periodEndTime ?? 0) - (todayTime ?? 0)) / (24 * 60 * 60 * 1000));
    if (!Number.isFinite(daysUntilEnd) || daysUntilEnd <= 0 || daysUntilEnd > 90) return 0;

    const renewalFollowUps = Array.isArray(effectiveVersion?.renewalFollowUps)
        ? effectiveVersion.renewalFollowUps
        : [];
    const hasRenewalUpload = renewalFollowUps.some((followUp) => isOpenableFileUrl(followUp?.renewalFileUrl ?? followUp?.renewal_file_url));
    const hasResponse = renewalFollowUps.some((followUp) => isOpenableFileUrl(followUp?.responseFileUrl ?? followUp?.response_file_url));

    if (hasResponse) return 0;
    if (daysUntilEnd <= 30) return 1;
    if (daysUntilEnd <= 60 && hasRenewalUpload) return 1;
    if (daysUntilEnd <= 90 && !hasRenewalUpload) return 1;
    return 0;
};

export const getCustomerDisplayActionSummary = (customer, options = {}) => {
    const todayIso = options.todayIso ?? getTodayIso();
    const emptyContractNumberRows = options.emptyContractNumberRows ?? {};
    const emptyBakRows = options.emptyBakRows ?? {};
    const priority = getCustomerTodoItems(customer, "priority")
        .filter((item) => item?.code !== "required_document_missing")
        .length;
    let needAction = getCustomerTodoItems(customer, "needAction")
        .filter((item) => ![
            "required_document_missing",
            "invoice_not_uploaded",
            "payment_pending",
            "invoice_amount_missing",
        ].includes(item?.code))
        .length;

    const activeInvoices = getCustomerActiveInvoicesForAttention(customer);
    const setupIncompleteCount = activeInvoices.filter((invoice) => getInvoiceSetupWarningsForAttention(invoice).length > 0).length;
    const nextActionInvoice = activeInvoices.find((invoice) => [
        "pending_setup",
        "warning_required_h7",
        "warning_required_h3",
        "warning_unpaid",
    ].includes(getInvoiceWorkflowKeyForAttention(invoice, activeInvoices, todayIso))) ?? null;

    needAction += setupIncompleteCount;
    if (nextActionInvoice) needAction += 1;

    const activationFeePaidAt = customer?.activationFeePaidAt ?? customer?.activation_fee_paid_at ?? null;
    if (!activationFeePaidAt) needAction += 1;

    const contract = getCustomerPrimaryContract(customer, todayIso);
    if (contract) {
        const activeContractId = Number(contract?.id);
        const contractRowId = `contract-${contract.id}`;
        const contractNumber = String(contract?.contractNumber ?? contract?.contract_number ?? "").trim();
        const hasContractNumberValue = Boolean(contractNumber);
        const isContractNumberExplicitlyEmpty = Object.values(emptyContractNumberRows).some(Boolean);
        const activeContractDocument = getCustomerDocumentByTypeAndContractId(customer, "kontrak", activeContractId);
        const activeBakDocument = getCustomerDocumentByTypeAndContractId(customer, "bak", activeContractId);
        const hasActiveContractFile = isOpenableFileUrl(activeContractDocument?.fileUrl ?? activeContractDocument?.file_url);
        const hasActiveBakFile = Boolean(activeBakDocument);
        const isBakExplicitlyEmpty = Boolean(emptyBakRows[contractRowId]);

        if (!hasContractNumberValue && !isContractNumberExplicitlyEmpty) needAction += 1;
        if (!hasActiveContractFile) needAction += 1;
        if (!hasActiveBakFile && !isBakExplicitlyEmpty) needAction += 1;
        needAction += getContractRenewalAttentionCount(contract, todayIso);
    }

    return {
        priority,
        needAction,
        total: priority + needAction,
    };
};

const getStoredCustomerEmptyState = (customerId) => {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const rawValue = window.localStorage.getItem(`tenant-contract-empty-state-${customerId}`);
        return rawValue ? JSON.parse(rawValue) : {};
    } catch {
        return {};
    }
};

export const mapCustomerToRow = (customer, index) => {
    const operationalStatus = resolveCustomerOperationalStatus(customer);
    const active = operationalStatus === "aktif";
    const activationFeeAmount = Number(customer.activationFeeAmount ?? customer.activation_fee_amount ?? 0);
    const activationFeePaidAt = customer.activationFeePaidAt ?? customer.activation_fee_paid_at ?? null;
    const routeStatus = typeof customer.routeStatus === "string"
        ? customer.routeStatus
        : typeof customer.route?.activeFlowStatus === "string"
            ? customer.route.activeFlowStatus
            : "aktif";
    const packageInfo = resolveCustomerPackageInfo(customer);
    const contractPeriodInfo = resolveCustomerContractPeriodInfo(customer);
    const emptyState = getStoredCustomerEmptyState(customer.id);

    // Handle both NestJS format (customer.isps) and Supabase format (customer.ispMemberships)
    let ispList = [];
    let ispIds = [];
    if (Array.isArray(customer.isps)) {
        // NestJS format
        ispList = customer.isps
            .map((isp) => isp?.name)
            .filter((name) => typeof name === "string" && name.trim().length > 0);
        ispIds = customer.isps
            .map((isp) => Number(isp?.id ?? isp?.isp_id))
            .filter((id) => Number.isFinite(id) && id > 0);
    } else if (Array.isArray(customer.ispMemberships)) {
        // Supabase format
        ispList = customer.ispMemberships
            .map((membership) => membership?.isp?.name)
            .filter((name) => typeof name === "string" && name.trim().length > 0);
        ispIds = customer.ispMemberships
            .map((membership) => Number(membership?.ispId ?? membership?.isp_id ?? membership?.isp?.id))
            .filter((id) => Number.isFinite(id) && id > 0);
    }

    const fallbackIspName = typeof customer.ispName === "string" && customer.ispName.trim()
        ? customer.ispName.trim()
        : typeof customer.isp_name === "string" && customer.isp_name.trim()
        ? customer.isp_name.trim()
        : "-";
    const primaryIsp = ispList[0] ?? fallbackIspName;
    const ispDisplay = ispList.length > 1
        ? `${primaryIsp} (+${ispList.length - 1})`
        : primaryIsp;

    return {
        id: customer.id,
        no: String(index + 1).padStart(2, "0"),
        isp: primaryIsp,
        ispDisplay,
        ispList: ispList.length > 0 ? ispList : [primaryIsp],
        ispIds,
        name: customer.name ?? "-",
        status: operationalStatus === "aktif"
            ? "Beroperasi"
            : operationalStatus === "belum_beroperasi"
                ? "Belum Beroperasi"
                : operationalStatus === "expired"
                    ? "Belum Diperpanjang"
                    : "Berhenti",
        active,
        contracts: Number(customer.contractCount ?? customer.contract_count ?? 0),
        documents: Number(customer.documentCount ?? customer.document_count ?? 0),
        invoices: Number(customer.invoiceCount ?? customer.invoice_count ?? 0),
        customerId: customer.customerCode ?? customer.customer_code ?? `CUST-${customer.id}`,
        rawStatus: operationalStatus,
        routeStatus,
        contractStartDate: contractPeriodInfo.contractStartDate,
        contractPeriodStart: contractPeriodInfo.contractPeriodStart,
        contractPeriodEnd: contractPeriodInfo.contractPeriodEnd,
        contractNumber: resolveCustomerContractNumber(customer),
        activationFeeAmount,
        activationFeePaidAt,
        todoSummary: customer.todoSummary,
        actionSummary: getCustomerDisplayActionSummary(customer, {
            emptyContractNumberRows: emptyState.contractNumberRows ?? {},
            emptyBakRows: emptyState.bakRows ?? {},
        }),
        latestDocuments: customer.latestDocuments ?? customer.documents ?? [],
        paket: packageInfo.paket,
        jumlah: packageInfo.jumlah,
    };
};

export const getMonthStatusClass = (status) => {
    const normalizedStatus = String(status ?? "").trim().toLowerCase();

    if (normalizedStatus === "di_luar_periode") {
        return "bg-slate-950/60 text-white/10 border border-white/5 opacity-40 cursor-not-allowed";
    }

    if (normalizedStatus === "lunas") {
        return "bg-[#00c853] text-white shadow-[#00c853]/20";
    }

    if (normalizedStatus === "belum_bayar") {
        return "bg-[#ffab00] text-white shadow-[#ffab00]/20";
    }

    if (normalizedStatus === "terlambat") {
        return "bg-[#ff2400] text-white shadow-[#ff2400]/20";
    }

    if (normalizedStatus === "belum_ditagih") {
        return "bg-white/10 text-white/40 border border-white/10";
    }

    if (invoiceStatusBadgeClass[normalizedStatus]) {
        return "bg-white/10 text-white/20 border-white/5 opacity-40";
    }

    return "bg-slate-100/10 text-white/20 border-white/5 opacity-40";
};

export const createDefaultDocumentForm = () => ({
    jenisDokumen: "kontrak",
    nomorDokumen: "",
    tanggalDokumen: new Date().toISOString().slice(0, 10),
    contractId: "",
});

export async function fetchJson(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: options?.signal ?? controller.signal,
            ...options,
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                normalizeErrorMessage(result, `Permintaan gagal (${response.status}).`),
            );
        }

        return result;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
                `Permintaan melebihi ${REQUEST_TIMEOUT_MS / 1000} detik. Periksa backend di ${API_BASE_URL}.`,
            );
        }

        if (error instanceof TypeError) {
            throw new Error(`Gagal terhubung ke backend (${API_BASE_URL}).`);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
