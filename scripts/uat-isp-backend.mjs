import fs from "node:fs/promises";

const BASE = process.env.UAT_API_BASE ?? "http://127.0.0.1:8080";
const stamp = `${Date.now()}`;
const prefix = `UAT-ISP-20260725-${stamp.slice(-6)}`;
const ispEmail = `uat.isp.${stamp}@kima.dev`;
const ispPassword = `UatIsp-${stamp.slice(-8)}!`;

function envValue(text, key) {
  const line = text.split("\n").find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() ?? "";
}

async function loadAdminCredentials() {
  const text = await fs.readFile("frontend/.env.development", "utf8");
  return {
    email: envValue(text, "VITE_DEV_ADMIN_EMAIL"),
    password: envValue(text, "VITE_DEV_ADMIN_PASSWORD"),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const raw = await response.text();
  let body = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* text response */ }
  return { status: response.status, body };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function message(body) {
  return typeof body === "object" && body ? body.message ?? JSON.stringify(body) : String(body ?? "");
}

const results = [];
function record(id, passed, detail) {
  results.push({ id, result: passed ? "Lulus" : "Gagal", detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${id} — ${detail}`);
}

let adminToken;
let ispToken;
let ispUserId;
let assignedCustomerId;
let unassignedCustomerId;
let contractId;
let documentId;

try {
  const health = await request("/healthz");
  assert(health.status === 200, `HTTP ${health.status}`);
  record("ISP-BE-00", true, "Backend healthz HTTP 200");

  const admin = await loadAdminCredentials();
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(admin),
  });
  assert(adminLogin.status === 200 && adminLogin.body?.user?.role === "admin", `HTTP ${adminLogin.status} ${message(adminLogin.body)}`);
  adminToken = adminLogin.body.access_token;
  record("ISP-BE-01", true, "Admin login berhasil");

  const createdUser = await request("/api/users", {
    method: "POST",
    headers: { ...auth(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ email: ispEmail, password: ispPassword, role: "isp" }),
  });
  assert(createdUser.status === 201 && createdUser.body?.role === "isp", `HTTP ${createdUser.status} ${message(createdUser.body)}`);
  ispUserId = createdUser.body.id;
  record("ISP-BE-02", true, `Akun ISP dibuat (${ispEmail})`);

  const assignedCustomer = await request("/api/pelanggan", {
    method: "POST",
    headers: { ...auth(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      kode_pelanggan: `${prefix}-A`,
      nama_pelanggan: `${prefix} Pelanggan Ditugaskan`,
      pic: "PIC UAT ISP A",
      telepon: "0400000000",
      email: `${prefix.toLowerCase()}-a@example.test`,
      keterangan: "Data sementara untuk UAT role ISP",
    }),
  });
  assert(assignedCustomer.status === 201, `HTTP ${assignedCustomer.status} ${message(assignedCustomer.body)}`);
  assignedCustomerId = assignedCustomer.body.id;
  record("ISP-BE-03", true, `Pelanggan test A dibuat (id ${assignedCustomerId})`);

  const unassignedCustomer = await request("/api/pelanggan", {
    method: "POST",
    headers: { ...auth(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      kode_pelanggan: `${prefix}-B`,
      nama_pelanggan: `${prefix} Pelanggan Tidak Ditugaskan`,
      pic: "PIC UAT ISP B",
      telepon: "0400000001",
      email: `${prefix.toLowerCase()}-b@example.test`,
      keterangan: "Data pembanding untuk UAT pembatasan akses ISP",
    }),
  });
  assert(unassignedCustomer.status === 201, `HTTP ${unassignedCustomer.status} ${message(unassignedCustomer.body)}`);
  unassignedCustomerId = unassignedCustomer.body.id;
  record("ISP-BE-04", true, `Pelanggan pembanding B dibuat (id ${unassignedCustomerId})`);

  const contract = await request("/api/kontrak-lengkap", {
    method: "POST",
    headers: { ...auth(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      pelanggan_id: assignedCustomerId,
      kode_kontrak: `${prefix}-CTR`,
      nama_lokasi: "Lokasi UAT ISP",
      periode_awal: "2026-01-01",
      periode_berakhir: "2026-12-31",
      status_kontrak: "Beroperasi",
      kategori: "Dedicated",
      core: "1 Core",
      no_kontrak: `${prefix}-NOCTR`,
      nilai_kontrak: 12000000,
      biaya_aktivasi: 500000,
      perbulan: 1000000,
      nilai_periode_aktif: 12000000,
      durasi_kontrak_bulan: 12,
      keterangan: "Kontrak sementara untuk UAT role ISP",
    }),
  });
  assert(contract.status === 201, `HTTP ${contract.status} ${message(contract.body)}`);
  contractId = contract.body.id;
  record("ISP-BE-05", true, `Kontrak/lokasi test dibuat (id ${contractId})`);

  const access = await request(`/api/users/${ispUserId}/pelanggan-access`, {
    method: "PUT",
    headers: { ...auth(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ pelanggan_ids: [assignedCustomerId] }),
  });
  assert(access.status === 204, `HTTP ${access.status} ${message(access.body)}`);
  record("ISP-BE-06", true, "Pelanggan A ditugaskan ke akun ISP");

  const ispLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ispEmail, password: ispPassword }),
  });
  assert(ispLogin.status === 200 && ispLogin.body?.user?.role === "isp", `HTTP ${ispLogin.status} ${message(ispLogin.body)}`);
  ispToken = ispLogin.body.access_token;
  record("ISP-BE-07", true, "Login akun ISP berhasil");

  const customers = await request("/api/pelanggan?page=1&page_size=100", { headers: auth(ispToken) });
  assert(customers.status === 200 && customers.body.total === 1 && customers.body.data[0]?.id === assignedCustomerId, `HTTP ${customers.status} ${message(customers.body)}`);
  assert(!Object.hasOwn(customers.body.data[0], "link_folder_berkas"), "link_folder_berkas terekspos pada respons ISP");
  record("ISP-BE-08", true, "GET pelanggan hanya mengembalikan pelanggan A dan tanpa link folder");

  const contracts = await request("/api/kontrak-lengkap?page=1&page_size=100", { headers: auth(ispToken) });
  assert(contracts.status === 200 && contracts.body.total === 1 && contracts.body.data[0]?.id === contractId, `HTTP ${contracts.status} ${message(contracts.body)}`);
  assert(!Object.hasOwn(contracts.body.data[0], "link_folder_berkas"), "link_folder_berkas terekspos pada respons kontrak ISP");
  record("ISP-BE-09", true, "GET kontrak hanya mengembalikan kontrak pelanggan A dan tanpa link folder");

  const hiddenCustomer = await request(`/api/pelanggan?page=1&page_size=100&search=${encodeURIComponent(`${prefix} Pelanggan Tidak Ditugaskan`)}`, { headers: auth(ispToken) });
  assert(hiddenCustomer.status === 200 && hiddenCustomer.body.total === 0, `HTTP ${hiddenCustomer.status} ${message(hiddenCustomer.body)}`);
  const hiddenContract = await request(`/api/kontrak-lengkap?page=1&page_size=100&search=${encodeURIComponent(`${prefix}-B`)}`, { headers: auth(ispToken) });
  assert(hiddenContract.status === 200 && hiddenContract.body.total === 0, `HTTP ${hiddenContract.status} ${message(hiddenContract.body)}`);
  record("ISP-BE-10", true, "Pelanggan pembanding B tidak bocor melalui filter pelanggan/kontrak");

  const documentsBefore = await request("/api/isp/dokumen?page=1&page_size=100", { headers: auth(ispToken) });
  assert(documentsBefore.status === 200, `HTTP ${documentsBefore.status} ${message(documentsBefore.body)}`);
  assert(documentsBefore.body.data.every((row) => !Object.hasOwn(row, "drive_folder_id")), "drive_folder_id terekspos pada daftar dokumen ISP");
  record("ISP-BE-11", true, `GET dokumen ISP berhasil (${documentsBefore.body.total} dokumen awal) tanpa ID folder`);

  for (const [id, path] of [["ISP-BE-12", "/api/dashboard"], ["ISP-BE-13", "/api/users?page=1&page_size=10"], ["ISP-BE-14", "/api/titik-peta?page=1&page_size=20"]]) {
    const denied = await request(path, { headers: auth(ispToken) });
    assert(denied.status === 403, `${path} HTTP ${denied.status} ${message(denied.body)}`);
    record(id, true, `${path} ditolak HTTP 403 untuk role ISP`);
  }

  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([`UAT backend ${prefix}\n`], { type: "text/plain" }), `${prefix}.txt`);
  uploadForm.append("kategori", "Dokumen Lain");
  uploadForm.append("lokasi_id", String(contractId));
  const upload = await request("/api/dokumen", { method: "POST", headers: auth(ispToken), body: uploadForm });
  assert(upload.status === 201 && upload.body?.nama_file === `${prefix}.txt`, `HTTP ${upload.status} ${message(upload.body)}`);
  assert(!Object.hasOwn(upload.body, "drive_folder_id"), "drive_folder_id terekspos pada respons upload ISP");
  documentId = upload.body.id;
  record("ISP-BE-15", true, `Upload dokumen ke kontrak yang ditugaskan berhasil (id ${documentId})`);

  const documentsAfter = await request("/api/isp/dokumen?page=1&page_size=100", { headers: auth(ispToken) });
  assert(documentsAfter.status === 200 && documentsAfter.body.data.some((row) => row.id === documentId), `HTTP ${documentsAfter.status} ${message(documentsAfter.body)}`);
  assert(documentsAfter.body.data.every((row) => !Object.hasOwn(row, "drive_folder_id")), "drive_folder_id terekspos setelah upload");
  record("ISP-BE-16", true, "Dokumen upload muncul pada daftar ISP dan hanya menyediakan data file individual");

  const crossUploadForm = new FormData();
  crossUploadForm.append("file", new Blob(["cross-customer attempt\n"], { type: "text/plain" }), `${prefix}-cross.txt`);
  crossUploadForm.append("kategori", "Dokumen Lain");
  crossUploadForm.append("pelanggan_id", String(unassignedCustomerId));
  const crossUpload = await request("/api/dokumen", { method: "POST", headers: auth(ispToken), body: crossUploadForm });
  assert(crossUpload.status === 403, `cross-upload HTTP ${crossUpload.status} ${message(crossUpload.body)}`);
  const documentsAfterDenied = await request("/api/isp/dokumen?page=1&page_size=100", { headers: auth(ispToken) });
  assert(documentsAfterDenied.status === 200 && documentsAfterDenied.body.data.filter((row) => row.nama_file === `${prefix}-cross.txt`).length === 0, "Cross-upload meninggalkan dokumen");
  record("ISP-BE-17", true, "Upload lintas pelanggan ditolak HTTP 403 tanpa dokumen baru");
} catch (error) {
  const failedId = `ISP-BE-${String(results.length + 1).padStart(2, "0")}`;
  record(failedId, false, error.message);
} finally {
  const cleanup = async (id, action) => {
    if (!id) return;
    try {
      const result = await action();
      const ok = result.status >= 200 && result.status < 300;
      console.log(`${ok ? "CLEANUP PASS" : "CLEANUP FAIL"} ${result.status}`);
    } catch (error) {
      console.log(`CLEANUP FAIL ${error.message}`);
    }
  };
  await cleanup(documentId, () => request(`/api/dokumen/${documentId}`, { method: "DELETE", headers: auth(adminToken) }));
  await cleanup(contractId, () => request(`/api/kontrak-lengkap/${contractId}`, { method: "DELETE", headers: auth(adminToken) }));
  await cleanup(assignedCustomerId, () => request(`/api/pelanggan/${assignedCustomerId}`, { method: "DELETE", headers: auth(adminToken) }));
  await cleanup(unassignedCustomerId, () => request(`/api/pelanggan/${unassignedCustomerId}`, { method: "DELETE", headers: auth(adminToken) }));
  await cleanup(ispUserId, () => request(`/api/users/${ispUserId}`, { method: "PUT", headers: { ...auth(adminToken), "Content-Type": "application/json" }, body: JSON.stringify({ is_active: false }) }));
}

const passed = results.filter((item) => item.result === "Lulus").length;
const failed = results.filter((item) => item.result === "Gagal").length;
console.log(JSON.stringify({ prefix, account: ispEmail, scenarios: results, passed, failed }, null, 2));
process.exitCode = failed ? 1 : 0;
