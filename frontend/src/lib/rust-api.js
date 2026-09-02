const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:8080")
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

export const SESSION_KEY = "kima-rust-session";

// Global handler untuk 401 Unauthorized
let onUnauthorized = null;
let authInvalidated = false;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === "function" ? fn : null;
  return () => {
    if (onUnauthorized === fn) onUnauthorized = null;
  };
}

export function getSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const session = JSON.parse(raw || "null");
    if (!session || typeof session.token !== "string" || !session.token.trim()) {
      if (raw) window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session) {
  authInvalidated = false;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function clearSession() { window.localStorage.removeItem(SESSION_KEY); }

function invalidateSession() {
  clearSession();
  if (authInvalidated) return;
  authInvalidated = true;
  if (onUnauthorized) onUnauthorized();
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function errorMessage(body, fallback) {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (Array.isArray(body?.message)) return body.message.join(", ");
  return fallback;
}

export async function request(path, { method = "GET", body, token, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    // Tables are refreshed after map edits; never reuse a previous GET
    // response that could still contain the old coordinate.
    ...(method === "GET" ? { cache: "no-store" } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }

  // Token yang sudah tidak valid harus mengakhiri sesi. Untuk login, 401
  // adalah kesalahan kredensial/akun dan pesannya perlu ditampilkan apa adanya.
  if (response.status === 401) {
    if (token) {
      invalidateSession();
      throw apiError("Sesi berakhir. Silakan login ulang.", 401);
    }
    throw apiError(errorMessage(data, "Email atau kata sandi tidak valid."), 401);
  }

  if (!response.ok) throw apiError(errorMessage(data, `Permintaan gagal (${response.status}).`), response.status);
  return data;
}

function sessionFromAuthResponse(data, fallbackEmail = "") {
  const token = data?.access_token || data?.token || data?.data?.access_token || data?.data?.token;
  const user = data?.user || data?.data?.user || data?.profile || data?.data?.profile || { email: fallbackEmail };
  if (!token) throw new Error("Sesi berhasil dibuat tetapi token akses tidak ditemukan pada respons backend.");
  const expiresIn = Number(data?.expires_in || 0);
  return {
    token,
    user,
    role: user.role || data?.role || data?.data?.role || "",
    ...(expiresIn > 0 ? { expires_at: Date.now() + expiresIn * 1000 } : {}),
  };
}

export async function login(email, password) {
  const data = await request("/api/auth/login", { method: "POST", body: { email, password } });
  const session = sessionFromAuthResponse(data, email);
  if (data?.must_change_password) {
    session.must_change_password = true;
  } else {
    saveSession(session);
  }
  return session;
}

export async function devAccess(role) {
  const data = await request(`/api/dev-access/${encodeURIComponent(role)}`, { method: "POST" });
  const session = sessionFromAuthResponse(data);
  saveSession(session);
  return session;
}

export const rowsFrom = (data) => Array.isArray(data) ? data : data?.data || data?.items || data?.results || data?.pelanggan || data?.kontrak || [];
export const totalFrom = (data, fallback) => Number(data?.total ?? data?.count ?? data?.pagination?.total ?? fallback) || 0;

// Memuat seluruh halaman untuk tampilan yang memang membutuhkan dataset lengkap,
// seperti portal ISP yang melakukan pencarian dan filter di sisi browser.
export async function listAllPages(loadPage, pageSize = 100) {
  const rows = [];
  let page = 1;
  let total = 0;

  while (page <= 10000) {
    const response = await loadPage(page, pageSize);
    const pageRows = rowsFrom(response);
    rows.push(...pageRows);
    total = totalFrom(response, rows.length);

    if (!pageRows.length || pageRows.length < pageSize || rows.length >= total) break;
    page += 1;
  }

  return { data: rows, total: Math.max(total, rows.length) };
}

export const listCustomers = (token, page = 1, pageSize = 20, search = "") => request(`/api/pelanggan?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

export async function createCustomer(token, data) {
  return request("/api/pelanggan", { method: "POST", body: data, token });
}

export async function updateCustomer(token, id, data) {
  return request(`/api/pelanggan/${id}`, { method: "PUT", body: data, token });
}

export async function renameDocument(token, id, nama_file) {
  return request(`/api/dokumen/${id}`, { method: "PATCH", body: { nama_file }, token });
}

export async function deleteDocument(token, id) {
  return request(`/api/dokumen/${id}`, { method: "DELETE", token });
}

export async function deleteCustomer(token, id) {
  return request(`/api/pelanggan/${id}`, { method: "DELETE", token });
}

export async function getNextPelangganCode(token) {
  return request("/api/pelanggan-next-code", { token });
}

export async function listDocuments(token, lokasiId) {
  return request(`/api/dokumen?lokasi_id=${lokasiId}`, { token });
}

export async function syncDriveDocuments(token) {
  return request("/api/dokumen/sync", { method: "POST", token });
}

export async function getDriveSyncStatus(token, jobId) {
  return request(`/api/dokumen/sync/${encodeURIComponent(jobId)}`, { token });
}

export async function getCurrentDriveSyncStatus(token) {
  return request("/api/dokumen/sync/current", { token });
}

export async function fetchDocumentContent(token, id, mode = "preview") {
  const safeMode = mode === "download" ? "download" : "preview";
  const response = await fetch(`${API_BASE_URL}/api/dokumen/${id}/${safeMode}`, {
    headers: { Accept: "*/*", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (response.status === 401) {
    if (token) invalidateSession();
    throw apiError("Sesi berakhir. Silakan login ulang.", 401);
  }
  if (!response.ok) {
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
    throw apiError(errorMessage(data, `Dokumen gagal dimuat (${response.status}).`), response.status);
  }
  return response.blob();
}

export async function uploadDocument(token, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/dokumen`);
    // Beri waktu cukup untuk backend meneruskan file ke Google Drive.
    // Backend default-nya 5 menit; batas browser dibuat sedikit lebih longgar.
    xhr.timeout = 6 * 60 * 1000;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true });
        }
      } else if (xhr.status === 401) {
        // Handle 401 Unauthorized for XHR
        invalidateSession();
        reject(apiError("Sesi berakhir. Silakan login ulang.", 401));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || `Upload gagal (${xhr.status})`));
        } catch {
          reject(new Error(`Upload gagal (${xhr.status})`));
        }
      }
    };

    xhr.ontimeout = () => reject(new Error("Upload melewati batas waktu. Periksa koneksi lalu coba lagi."));
    xhr.onabort = () => reject(new Error("Upload dibatalkan sebelum selesai."));
    xhr.onerror = () => reject(new Error("Koneksi ke backend atau Google Drive terputus saat mengunggah. Pastikan backend masih berjalan lalu coba lagi."));
    xhr.send(formData);
  });
}
export const listIspDocuments = (token, page = 1, pageSize = 20, search = "") =>
  request(`/api/isp/dokumen?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

export const listUserPelangganAccess = (token, userId) =>
  request(`/api/users/${userId}/pelanggan-access`, { token });

export const updateUserPelangganAccess = (token, userId, pelangganIds) =>
  request(`/api/users/${userId}/pelanggan-access`, { method: "PUT", body: { pelanggan_ids: pelangganIds }, token });
export const listContracts = (token, page = 1, pageSize = 20, search = "", status = "", activeOnly = false) => request(`/api/kontrak-lengkap?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}${activeOnly ? `&active_only=true` : ""}`, { token });

export async function getNextKontrakCode(token) {
  return request("/api/kontrak-next-code", { token });
}

export async function createContract(token, data) {
  return request("/api/kontrak-lengkap", { method: "POST", body: data, token });
}

export async function updateContract(token, id, data) {
  return request(`/api/kontrak-lengkap/${id}`, { method: "PUT", body: data, token });
}

export async function deleteContract(token, id) {
  return request(`/api/kontrak-lengkap/${id}`, { method: "DELETE", token });
}

export async function extendContract(token, id, data) {
  return request(`/api/kontrak-lengkap/${id}/extend`, { method: "POST", body: data, token });
}

export async function upgradeContract(token, id, data) {
  return request(`/api/kontrak-lengkap/${id}/upgrade`, { method: "POST", body: data, token });
}

export const getCurrentSession = (token) => request("/api/auth/session", { token });

export const getDashboardMetrics = (token, params = {}, options = {}) => {
  const query = new URLSearchParams();
  if (params.year) query.set("year", params.year);
  if (params.growth_start_year) query.set("growth_start_year", params.growth_start_year);
  if (params.growth_end_year) query.set("growth_end_year", params.growth_end_year);
  if (params.core_trend_start_year) query.set("core_trend_start_year", params.core_trend_start_year);
  if (params.core_trend_end_year) query.set("core_trend_end_year", params.core_trend_end_year);
  const qs = query.toString();
  return request(`/api/dashboard${qs ? `?${qs}` : ""}`, { token, signal: options.signal });
};

export const listUsers = (token, page = 1, pageSize = 20, search = "", status = "") =>
  request(`/api/users?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`, { token });

export async function createUser(token, data) {
  return request("/api/users", { method: "POST", body: data, token });
}

export async function updateUser(token, id, data) {
  return request(`/api/users/${id}`, { method: "PUT", body: data, token });
}

export async function deleteUser(token, id) {
  return request(`/api/users/${id}`, { method: "DELETE", token });
}

export async function resetPassword(token, id, newPassword) {
  return request(`/api/users/${id}/reset-password`, { method: "POST", body: { new_password: newPassword }, token });
}

export async function changePassword(token, newPassword) {
  const data = await request("/api/auth/change-password", { method: "POST", body: { new_password: newPassword }, token });
  return sessionFromAuthResponse(data);
}

export const listMapPoints = (token, page = 1, pageSize = 20, search = "") =>
  request(`/api/titik-peta?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

export const getLocationBaa = (token, lokasiId) =>
  request(`/api/titik-peta/${lokasiId}/baa`, { token });

export const createLocationBaa = (token, lokasiId, data) =>
  request(`/api/titik-peta/${lokasiId}/baa`, { method: "POST", body: data, token });

export async function upsertMapPoint(token, data) {
  return request("/api/titik-peta", { method: "POST", body: data, token });
}

export async function deleteMapPoint(token, lokasiId) {
  return request(`/api/titik-peta/${lokasiId}`, { method: "DELETE", token });
}

export const listIspPoints = (token, page = 1, pageSize = 100, search = "") =>
  request(`/api/titik-isp?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

export async function upsertIspPoint(token, data) {
  return request("/api/titik-isp", { method: "POST", body: data, token });
}

export async function deleteIspPoint(token, id) {
  return request(`/api/titik-isp/${id}`, { method: "DELETE", token });
}

export const listLocationPoints = (token, lokasiId) =>
  request(`/api/titik-lokasi?lokasi_id=${lokasiId}`, { token });

export async function createLocationPoint(token, data) {
  return request("/api/titik-lokasi", { method: "POST", body: data, token });
}

export async function updateLocationPoint(token, id, data) {
  return request(`/api/titik-lokasi/${id}`, { method: "PUT", body: data, token });
}

export async function deleteLocationPoint(token, id) {
  return request(`/api/titik-lokasi/${id}`, { method: "DELETE", token });
}

// ============================================
// SOP WORKFLOW API
// ============================================

/**
 * List all workflows (admin/DBO view)
 */
export const listWorkflows = (token, params = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.page_size) query.set("page_size", params.page_size);
  if (params.status) query.set("status", params.status);
  if (params.assigned_to_role) query.set("assigned_to_role", params.assigned_to_role);
  const qs = query.toString();
  return request(`/admin/workflows/list${qs ? `?${qs}` : ""}`, { token });
};

/**
 * Get workflow status/detail by ID
 */
export const getWorkflowStatus = (token, workflowId) =>
  request(`/api/portal/workflows/${workflowId}/status`, { token });

/**
 * Submit step in SOP workflow
 */
export async function submitStep(token, workflowId, step, data) {
  return request(`/portal/sop/${workflowId}/step/${step}`, { method: "POST", body: data, token });
}

/**
 * Direksi vote (Step 11 approval)
 */
export async function direksiVote(token, workflowId, decision, notes, backToStep = null) {
  const body = { decision, notes };
  if (backToStep) body.back_to_step = backToStep;
  return request(`/admin/sop/${workflowId}/direksi/vote`, { method: "PATCH", body, token });
}

/**
 * Portal Register (public endpoint, no auth required)
 */
export async function portalRegister(data) {
  return request("/api/portal/register", { method: "POST", body: data });
}

export const trackServiceRequest = (kode_registrasi, email_pic) =>
  request("/api/portal/lacak", { method: "POST", body: { kode_registrasi, email_pic } });

export const cancelPortalRegistration = (kode_registrasi, email_pic, cancellation_reason) =>
  request("/api/portal/batalkan", {
    method: "POST",
    body: { kode_registrasi, email_pic, cancellation_reason },
  });

export const createPortalRegistrationOffer = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/penawaran`, { method: "PATCH", body: data, token });

export const respondOffer = (kode_registrasi, email_pic, keputusan, catatan) =>
  request("/api/portal/penawaran/respond", { method: "POST", body: { kode_registrasi, email_pic, keputusan, catatan } });

export const submitPo = (
  kode_registrasi,
  email_pic,
  po_nomor,
  po_catatan,
  po_dokumen_id = null,
  po_akte_dokumen_id = null,
  po_izin_dokumen_id = null,
) =>
  request("/api/portal/po/submit", {
    method: "POST",
    body: {
      kode_registrasi,
      email_pic,
      po_nomor,
      po_catatan,
      po_dokumen_id,
      po_akte_dokumen_id,
      po_izin_dokumen_id,
    },
  });

export const reviewPortalRegistrationLegal = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/legal`, { method: "PATCH", body: data, token });

// Keputusan persetujuan SOP1 dapat diberikan Admin KIMA/DBO. Nama alias lama
// dipertahankan agar antrean Direksi opsional tetap kompatibel.
export const decidePortalRegistrationApproval = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/persetujuan`, { method: "PATCH", body: data, token });

export const decidePortalRegistrationDireksi = decidePortalRegistrationApproval;

export const preparePortalRegistrationPks = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/pks`, { method: "PATCH", body: data, token });

export const recordPortalRegistrationPksSignature = (token, id, pihak, pks_signed_dokumen_id = null) =>
  request(`/admin/portal-registrations/${id}/pks`, { method: "POST", body: { pihak, pks_signed_dokumen_id }, token });

export const updatePortalRegistrationActivation = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/aktivasi`, { method: "PATCH", body: data, token });

export const createPortalRegistrationBaa = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/baa`, { method: "PATCH", body: data, token });

export const verifyPortalRegistrationBaa = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/baa/verify`, { method: "PATCH", body: data, token });

export const createPortalRegistrationInvoice = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/invoice`, { method: "PATCH", body: data, token });

export const acceptPortalRegistrationBaa = (kode_registrasi, email_pic) =>
  request("/api/portal/baa/accept", { method: "POST", body: { kode_registrasi, email_pic } });

export const confirmPortalRegistrationPayment = (kode_registrasi, email_pic, catatan, pembayaran_dokumen_id = null) =>
  request("/api/portal/payment/confirm", { method: "POST", body: { kode_registrasi, email_pic, catatan, pembayaran_dokumen_id } });

export const verifyPortalRegistrationPayment = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/payment`, { method: "PATCH", body: data, token });

export const listMyServiceRequests = (token) => request("/api/portal/permohonan-saya", { token });
export const submitServiceChangeRequest = (token, data) =>
  request("/api/portal/sop2/permohonan", { method: "POST", body: data, token });
export const listServiceChangeRequests = (token) =>
  request("/api/portal/sop2/permohonan", { token });
export const listServiceChangeHistory = (token, id) =>
  request(`/api/portal/sop2/${id}/history`, { token });
export const listServiceChangeNotifications = (token) =>
  request("/api/portal/sop2/notifications", { token });
export const markServiceChangeNotification = (token, id, read = true) =>
  request(`/api/portal/sop2/notifications/${id}`, { method: "PATCH", body: { read }, token });
export const listAdminNotifications = (token) =>
  request("/api/admin/notifications", { token });
export const markAdminNotification = (token, source, id, read = true) =>
  request(`/api/admin/notifications/${encodeURIComponent(source)}/${id}`, {
    method: "PATCH",
    body: { read },
    token,
  });
export const completeServiceChangeStep = (token, id, catatan = "", action = null, data = {}) =>
  request(`/admin/sop2/${id}/step`, { method: "PATCH", body: { catatan: catatan || null, action, data }, token });

/**
 * List portal registrations awaiting admin review
 */
export const listPortalRegistrations = (token, status = "") => {
  const query = new URLSearchParams();
  if (["menunggu", "disetujui", "ditolak", "dibatalkan"].includes(status)) query.set("status", status);
  else if (status === "negosiasi") query.set("penawaran_status", status);
  const qs = query.toString();
  return request(`/admin/portal-registrations${qs ? `?${qs}` : ""}`, { token });
};

/**
 * Approve a portal registration after the Admin has created/verified its
 * Pelanggan account in the approval UI.
 */
export async function approvePortalRegistration(token, id) {
  return request(`/admin/portal-registrations/${id}/approve`, { method: "POST", token });
}

/**
 * Reject a portal registration with a reason
 */
/**
 * Ajukan lokasi tambahan untuk pelanggan yang sudah login (Bagian B saja,
 * data perusahaan sudah tersimpan di sistem).
 */
export async function submitAdditionalLocation(token, data) {
  return request("/api/pelanggan/lokasi/ajukan", { method: "POST", body: data, token });
}

export async function rejectPortalRegistration(token, id, rejectionReason) {
  return request(`/admin/portal-registrations/${id}/reject`, {
    method: "POST",
    body: { rejection_reason: rejectionReason },
    token,
  });
}

export const cancelPortalRegistrationByAdmin = (token, id, cancellationReason) =>
  request(`/admin/portal-registrations/${id}/cancel`, {
    method: "POST",
    body: { cancellation_reason: cancellationReason },
    token,
  });

export const getPortalRegistration = (token, id) =>
  request(`/admin/portal-registrations/${id}`, { token });

export const listIspCandidates = (token) => request("/admin/isp-candidates", { token });

export const listIspDirectory = (token) => request("/admin/isp-directory", { token });

export const createIspDirectory = (token, data) =>
  request("/admin/isp-directory", { method: "POST", body: data, token });

export const updateIspDirectory = (token, id, data) =>
  request(`/admin/isp-directory/${id}`, { method: "PATCH", body: data, token });

export const updatePortalRegistrationSurvey = (token, id, data) =>
  request(`/admin/portal-registrations/${id}/survey`, { method: "PATCH", body: data, token });
