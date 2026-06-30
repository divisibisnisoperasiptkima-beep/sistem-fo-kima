import { resolveCustomerOperationalStatus } from "../../app/utils";

export const getPackageDisplay = (packageValue) => {
    const normalizedPackage = String(packageValue ?? "").toLowerCase();
    const isSharingPackage = normalizedPackage.includes("shar") || normalizedPackage === "shared";

    return {
        label: isSharingPackage ? "Sharing Core" : "Core",
        filterValue: isSharingPackage ? "sharing_core" : "core",
        isSharingPackage,
    };
};

export const normalizeOperationalStatus = (status) => String(status ?? "").trim().toLowerCase();

export const isPendingOperationalStatus = (status) => ["belum_beroperasi", "belum beroperasi", "belum"].includes(normalizeOperationalStatus(status));

export const isStoppedStatus = (status) => ["berhenti", "nonaktif"].includes(normalizeOperationalStatus(status));

export const resolveTenantOperationalStatus = (tenant, todayIso) => resolveCustomerOperationalStatus(tenant, todayIso);

export const getOperationalLabel = (status) => {
    const normalizedStatus = normalizeOperationalStatus(status);
    if (isPendingOperationalStatus(normalizedStatus)) return "Belum Beroperasi";
    if (isStoppedStatus(normalizedStatus)) return "Berhenti";
    if (normalizedStatus === "expired") return "Belum Diperpanjang";
    return "Beroperasi";
};

export const isOperationallyActive = (status) => normalizeOperationalStatus(status) === "aktif";

export const getTenantProviderDisplayName = (tenant) => {
    const providerNames = Array.isArray(tenant?.isps)
        ? tenant.isps
            .map((isp) => String(isp?.name ?? "").trim())
            .filter(Boolean)
        : [];

    if (providerNames.length > 0) {
        return providerNames.join(", ");
    }

    const fallbackName = String(tenant?.isp_name ?? tenant?.ispName ?? "").trim();
    return fallbackName || "Provider Mandiri";
};
