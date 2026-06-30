import { describe, expect, it } from "vitest";
import { getTenantProviderDisplayName } from "../utils";

describe("getTenantProviderDisplayName", () => {
  it("memakai daftar ISP kalau relasi tersedia", () => {
    expect(
      getTenantProviderDisplayName({
        isps: [
          { name: "PT Fiber Network Indonesia" },
          { name: "Indosat Tbk" },
        ],
        isp_name: "Provider Mandiri",
      }),
    ).toBe("PT Fiber Network Indonesia, Indosat Tbk");
  });

  it("jatuh ke isp_name saat relasi ISP kosong", () => {
    expect(
      getTenantProviderDisplayName({
        isps: [],
        isp_name: "PT Lado Tekno Parkir",
      }),
    ).toBe("PT Lado Tekno Parkir");
  });

  it("menggunakan Provider Mandiri hanya jika data provider benar-benar kosong", () => {
    expect(getTenantProviderDisplayName({})).toBe("Provider Mandiri");
  });
});
