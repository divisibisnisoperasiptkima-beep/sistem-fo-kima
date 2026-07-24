const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:8080")
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

const SESSION_KEY = "kima-rust-session";

// Global handler untuk 401 Unauthorized
let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getSession() {
  try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

export function saveSession(session) { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function clearSession() { window.localStorage.removeItem(SESSION_KEY); }

function errorMessage(body, fallback) {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (Array.isArray(body?.message)) return body.message.join(", ");
  return fallback;
}

export async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }

  // Token yang sudah tidak valid harus mengakhiri sesi. Untuk login, 401
  // adalah kesalahan kredensial/akun dan pesannya perlu ditampilkan apa adanya.
  if (response.status === 401) {
    if (token) {
      clearSession();
      if (onUnauthorized) onUnauthorized();
      throw new Error("Sesi berakhir. Silakan login ulang.");
    }
    throw new Error(errorMessage(data, "Email atau kata sandi tidak valid."));
  }

  if (!response.ok) throw new Error(errorMessage(data, `Permintaan gagal (${response.status}).`));
  return data;
}

export async function login(email, password) {
  const data = await request("/api/auth/login", { method: "POST", body: { email, password } });
  const token = data?.access_token || data?.token || data?.data?.access_token || data?.data?.token;
  const user = data?.user || data?.data?.user || data?.profile || data?.data?.profile || { email };
  if (!token) throw new Error("Login berhasil tetapi token akses tidak ditemukan pada respons backend.");
  const session = { token, user, role: user.role || data?.role || data?.data?.role || "" };
  if (data?.must_change_password) {
    session.must_change_password = true;
  }
  saveSession(session); return session;
}

export const rowsFrom = (data) => Array.isArray(data) ? data : data?.data || data?.items || data?.results || data?.pelanggan || data?.kontrak || [];
export const totalFrom = (data, fallback) => Number(data?.total ?? data?.count ?? data?.pagination?.total ?? fallback) || 0;
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

export async function uploadDocument(token, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/dokumen`);
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
        clearSession();
        if (onUnauthorized) onUnauthorized();
        reject(new Error("Sesi berakhir. Silakan login ulang."));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || `Upload gagal (${xhr.status})`));
        } catch {
          reject(new Error(`Upload gagal (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi terputus"));
    xhr.send(formData);
  });
}
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

export const getDashboardMetrics = (token, params = {}) => {
  const query = new URLSearchParams();
  if (params.year) query.set("year", params.year);
  if (params.growth_start_year) query.set("growth_start_year", params.growth_start_year);
  if (params.growth_end_year) query.set("growth_end_year", params.growth_end_year);
  if (params.core_trend_start_year) query.set("core_trend_start_year", params.core_trend_start_year);
  if (params.core_trend_end_year) query.set("core_trend_end_year", params.core_trend_end_year);
  const qs = query.toString();
  return request(`/api/dashboard${qs ? `?${qs}` : ""}`, { token });
};

export const listUsers = (token, page = 1, pageSize = 20, search = "") =>
  request(`/api/users?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

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
  return request("/api/auth/change-password", { method: "POST", body: { new_password: newPassword }, token });
}

export const listMapPoints = (token, page = 1, pageSize = 20, search = "") =>
  request(`/api/titik-peta?page=${page}&page_size=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { token });

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
