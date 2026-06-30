import { describe, expect, it } from "vitest";
import { invoiceStatusBadgeClass } from "../constants";
import {
    buildInvoiceScheduleReconciliation,
    buildInvoiceScheduleRows,
    formatMonthYear,
    getIspContractRowCoverage,
    getCustomerSharedCoreRatio,
    getMonthStatusClass,
    resolveCustomerContractNumber,
    resolveCustomerContractPeriodInfo,
    resolveCustomerPackageInfo,
    resolveCustomerOperationalStatus,
    resolveInvoiceDueMonthIsoDate,
} from "../utils";

describe("buildInvoiceScheduleReconciliation", () => {
    it("creates missing invoice cycles when a contract period is extended", () => {
        const existing = [
            { id: 1, period_start_date: "2026-01-01", period_end_date: "2026-01-31" },
            { id: 2, period_start_date: "2026-02-01", period_end_date: "2026-02-28" },
        ];
        const expected = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-04-30",
            { every: 1, unit: "bulan" },
        );

        const result = buildInvoiceScheduleReconciliation(existing, expected);

        expect(result.updates).toHaveLength(2);
        expect(result.creates).toHaveLength(2);
        expect(result.removals).toHaveLength(0);
        expect(result.blockedRemovals).toHaveLength(0);
    });

    it("removes surplus empty cycles when a contract period is shortened", () => {
        const existing = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-04-30",
            { every: 1, unit: "bulan" },
        ).map((row, index) => ({ id: index + 1, ...row }));
        const expected = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-02-28",
            { every: 1, unit: "bulan" },
        );

        const result = buildInvoiceScheduleReconciliation(existing, expected);

        expect(result.updates).toHaveLength(2);
        expect(result.removals.map((invoice) => invoice.id)).toEqual([3, 4]);
        expect(result.blockedRemovals).toHaveLength(0);
    });

    it("blocks shortening when a surplus cycle has settlement data", () => {
        const existing = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-03-31",
            { every: 1, unit: "bulan" },
        ).map((row, index) => ({
            id: index + 1,
            ...row,
            status: index === 2 ? "lunas" : "belum_ditagih",
        }));
        const expected = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-02-28",
            { every: 1, unit: "bulan" },
        );

        const result = buildInvoiceScheduleReconciliation(existing, expected);

        expect(result.removals).toHaveLength(0);
        expect(result.blockedRemovals.map((invoice) => invoice.id)).toEqual([3]);
    });

    it("reuses existing rows and preserves their identity when dates shift", () => {
        const existing = [
            { id: 10, period_start_date: "2026-01-01", period_end_date: "2026-01-31", status: "lunas" },
            { id: 11, period_start_date: "2026-02-01", period_end_date: "2026-02-28" },
        ];
        const expected = buildInvoiceScheduleRows(
            "2026-01-15",
            "2026-03-14",
            { every: 1, unit: "bulan" },
        );

        const result = buildInvoiceScheduleReconciliation(existing, expected);

        expect(result.updates.map(({ invoice }) => invoice.id)).toEqual([10, 11]);
        expect(result.updates.map(({ row }) => row.periodStartDate)).toEqual(["2026-01-15", "2026-02-15"]);
        expect(result.creates).toHaveLength(0);
        expect(result.blockedRemovals).toHaveLength(0);
    });

    it("creates correct rows for quarterly and yearly billing cycles", () => {
        const quarterly = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-06-30",
            { every: 3, unit: "bulan" }
        );
        expect(quarterly).toHaveLength(2);
        expect(quarterly[0].periodStartDate).toBe("2026-01-01");
        expect(quarterly[0].periodEndDate).toBe("2026-03-31");
        expect(quarterly[1].periodStartDate).toBe("2026-04-01");
        expect(quarterly[1].periodEndDate).toBe("2026-06-30");

        const yearly = buildInvoiceScheduleRows(
            "2026-01-01",
            "2027-12-31",
            { every: 1, unit: "tahun" }
        );
        expect(yearly).toHaveLength(2);
        expect(yearly[0].periodStartDate).toBe("2026-01-01");
        expect(yearly[0].periodEndDate).toBe("2026-12-31");
        expect(yearly[1].periodStartDate).toBe("2027-01-01");
        expect(yearly[1].periodEndDate).toBe("2027-12-31");
    });

    it("reconciles quarterly and yearly cycles when extended", () => {
        const existing = [
            { id: 1, period_start_date: "2026-01-01", period_end_date: "2026-03-31" }
        ];
        const expected = buildInvoiceScheduleRows(
            "2026-01-01",
            "2026-09-30",
            { every: 3, unit: "bulan" }
        );
        const result = buildInvoiceScheduleReconciliation(existing, expected);
        expect(result.updates).toHaveLength(1);
        expect(result.creates).toHaveLength(2);
        expect(result.removals).toHaveLength(0);
    });

    it("blocks shortening if any surplus cycle has payment proof, files, document_id, or follow-ups", () => {
        const scenarios = [
            { status: "Lunas" },
            { paid_at: "2026-02-15T00:00:00Z" },
            { invoice_file_url: "https://example.com/invoice.pdf" },
            { payment_proof_file_url: "https://example.com/proof.pdf" },
            { document_id: 42 },
            { invoice_follow_ups: [{ id: 1 }] }
        ];

        scenarios.forEach((extraProps) => {
            const existing = [
                { id: 10, period_start_date: "2026-01-01", period_end_date: "2026-01-31" },
                { id: 11, period_start_date: "2026-02-01", period_end_date: "2026-02-28", ...extraProps }
            ];
            const expected = buildInvoiceScheduleRows(
                "2026-01-01",
                "2026-01-31",
                { every: 1, unit: "bulan" }
            );
            const result = buildInvoiceScheduleReconciliation(existing, expected);
            expect(result.removals).toHaveLength(0);
            expect(result.blockedRemovals.map(inv => inv.id)).toEqual([11]);
        });
    });
});

describe("resolveInvoiceDueMonthIsoDate", () => {
    it("returns the first day of the same month for period starts on days 1-15", () => {
        expect(resolveInvoiceDueMonthIsoDate("2026-01-01")).toBe("2026-01-01");
        expect(resolveInvoiceDueMonthIsoDate("2026-01-10")).toBe("2026-01-01");
        expect(resolveInvoiceDueMonthIsoDate("2026-01-15")).toBe("2026-01-01");
    });

    it("returns the first day of the next month for period starts from day 16 onward", () => {
        expect(resolveInvoiceDueMonthIsoDate("2026-01-16")).toBe("2026-02-01");
        expect(resolveInvoiceDueMonthIsoDate("2026-01-31")).toBe("2026-02-01");
    });

    it("rolls the technical due month into the next year when needed", () => {
        expect(resolveInvoiceDueMonthIsoDate("2026-12-16")).toBe("2027-01-01");
    });

    it("returns an empty string for invalid period starts", () => {
        expect(resolveInvoiceDueMonthIsoDate("")).toBe("");
        expect(resolveInvoiceDueMonthIsoDate("not-a-date")).toBe("");
    });
});

describe("formatMonthYear", () => {
    it("formats a technical due date as only month and year", () => {
        expect(formatMonthYear("2026-01-01")).toBe("Januari 2026");
    });
});

describe("getIspContractRowCoverage", () => {
    it("treats ISP contract row files as uploaded document coverage", () => {
        expect(getIspContractRowCoverage([
            {
                contract_reference: "KTR-ISP-001",
                contract_start_date: "2026-01-01",
                period_start: "2026-02-01",
                period_end: "2027-01-31",
                bak_file_url: "https://storage.example.com/bak.pdf",
                contract_file_url: "https://storage.example.com/kontrak.pdf",
            },
        ])).toEqual({
            hasReference: true,
            hasStartDate: true,
            hasPeriod: true,
            hasBakFile: true,
            hasContractFile: true,
        });
    });

    it("keeps incomplete period false unless both start and end exist", () => {
        expect(getIspContractRowCoverage([
            {
                contractReference: "KTR-ISP-002",
                periodStart: "2026-02-01",
                bakFileUrl: "",
            },
        ])).toEqual({
            hasReference: true,
            hasStartDate: false,
            hasPeriod: false,
            hasBakFile: false,
            hasContractFile: false,
        });
    });
});

describe("invoice status colors", () => {
    it("keeps monitoring status colors aligned for every invoice state", () => {
        expect(getMonthStatusClass("lunas")).toContain("#00c853");
        expect(getMonthStatusClass("belum_bayar")).toContain("#ffab00");
        expect(getMonthStatusClass("terlambat")).toContain("#ff2400");
        expect(getMonthStatusClass("belum_ditagih")).toContain("bg-white/10");
        expect(getMonthStatusClass("di_luar_periode")).toContain("cursor-not-allowed");
    });

    it("uses a consistent badge palette for invoice statuses", () => {
        expect(invoiceStatusBadgeClass).toMatchObject({
            lunas: "bg-emerald-100 text-emerald-700",
            belum_bayar: "bg-orange-100 text-orange-700",
            terlambat: "bg-red-100 text-red-700",
            belum_ditagih: "bg-slate-100 text-slate-700",
            di_luar_periode: "bg-slate-100 text-slate-500",
        });
    });
});

describe("resolveCustomerOperationalStatus", () => {
    it("uses active contract version period over stale raw customer status", () => {
        expect(resolveCustomerOperationalStatus({
            status: "expired",
            contracts: [
                {
                    id: 52,
                    status: "aktif",
                    startDate: "2025-10-09",
                    endDate: "2026-10-08",
                    versions: [
                        {
                            id: 61,
                            startDate: "2025-10-09",
                            endDate: "2026-10-08",
                        },
                    ],
                },
            ],
        }, "2026-06-12")).toBe("aktif");
    });

    it("does not crash when customer data is missing", () => {
        expect(resolveCustomerOperationalStatus(undefined, "2026-06-12")).toBe("aktif");
    });
});

describe("customer contract helpers", () => {
    it("ignores stale package fields on raw customer objects", () => {
        expect(resolveCustomerPackageInfo({
            paket: "sharing_core",
            jumlah: 32,
        })).toEqual({
            paket: "core",
            jumlah: null,
        });
    });

    it("ignores stale contract period fields on raw customer objects", () => {
        expect(resolveCustomerContractPeriodInfo({
            contract_start_date: "2026-02-03",
            contractPeriodStart: "2026-01-01",
            contractPeriodEnd: "2026-12-31",
        })).toEqual({
            contractStartDate: "2026-02-03",
            contractPeriodStart: null,
            contractPeriodEnd: null,
        });
    });

    it("ignores stale contract number and shared ratio fields on raw customer objects", () => {
        expect(resolveCustomerContractNumber({
            contractNumber: "BAK-001",
        })).toBe("-");
        expect(getCustomerSharedCoreRatio({
            contractSharingRatio: "1/32",
        })).toBe(null);
    });
});
