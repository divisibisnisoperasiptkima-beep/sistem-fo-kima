import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  clearSession,
  getCurrentSession,
  getSession,
  saveSession,
  SESSION_KEY,
  setUnauthorizedHandler,
  listAdminNotifications,
  markAdminNotification,
} from "../../lib/rust-api";
// Modular page imports - loaded on demand so the login shell stays small and
// each role only downloads the page it actually opens.
const PelangganPage = lazy(() => import("../pelanggan/PelangganPage"));
const KontrakPage = lazy(() => import("../kontrak/KontrakPage"));
const DashboardPage = lazy(() => import("../dashboard/DashboardPage"));
const MonitoringKontrakPage = lazy(() => import("../monitoring-kontrak/MonitoringKontrakPage"));
const KelolaPenggunaPage = lazy(() => import("../kelola-pengguna/KelolaPenggunaPage"));
const TitikPetaPage = lazy(() => import("../titik-peta/TitikPetaPage"));
const IspPortalPage = lazy(() => import("../isp-portal/IspPortalPage"));
const PelangganPortalPage = lazy(() => import("../pelanggan-portal/PelangganPortalPage"));
const InternalWorkflowDashboard = lazy(() => import("../sop/InternalWorkflowDashboard"));
const ServiceChangeRequestPage = lazy(() => import("../sop/ServiceChangeRequestPage"));
const PortalRegistrationsAdmin = lazy(() => import("../sop/PortalRegistrationsAdmin"));
const ServiceChangeRequestsAdmin = lazy(() => import("../sop/ServiceChangeRequestsAdmin"));
const IspDirectoryPage = lazy(() => import("../sop/IspDirectoryPage"));
const RoleWorkQueue = lazy(() => import("../sop/RoleWorkQueue"));
const Step4Survey = lazy(() => import("../sop/Step4Survey"));
const Step5Proposal = lazy(() => import("../sop/Step5Proposal"));
const Step6Presentasi = lazy(() => import("../sop/Step6Presentasi"));
import { IconUsers } from "../../components/icons";

// Menu icons
const IconDashboard = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
const IconPelanggan = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.74" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>;
const IconKontrak = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
const IconMonitoring = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /><polyline points="6 8 10 12 14 8 18 12" /></svg>;
const IconMapPin = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconFile = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>;
const IconClipboard = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 4.5V3h8v1.5M8 11h8M8 15h5" /></svg>;
const IconShieldCheck = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
const IconReceipt = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
const IconTool = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14.5 6.5 3-3 3 3-3 3" /><path d="m16 8-8.5 8.5a2.1 2.1 0 0 1-3 0 2.1 2.1 0 0 1 0-3L13 5" /><path d="m5 19 2 2M4 16l-1 1" /></svg>;
const IconPlusDocument = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 12v6M9 15h6" /></svg>;
const IconBuildingNetwork = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /><rect x="14" y="3" width="7" height="6" rx="1" /><path d="M6.5 9v3h11V9M17.5 12v3M10 6h4" /></svg>;

const MENU = [
  { key: "dashboard", label: "Dashboard", icon: IconDashboard },
  { key: "pelanggan", label: "Pelanggan", icon: IconPelanggan },
  { key: "kontrak", label: "Kontrak Lengkap", icon: IconKontrak },
  { key: "monitoring-kontrak", label: "Monitoring Kontrak", icon: IconMonitoring },
];

const PAGE_KEY = "kima-last-page";
const DEFAULT_ADMIN_PAGE = "dashboard";
const DEFAULT_ROLE_PAGES = {
  admin: DEFAULT_ADMIN_PAGE,
  teknisi: "teknisi-antrean",
  direksi: "direksi-persetujuan",
  keuangan: "keuangan-tagihan",
  isp: "isp-ringkasan",
  pelanggan: "pelanggan-beranda",
};

const PAGE_PATHS = {
  dashboard: "/admin/dashboard",
  pelanggan: "/admin/pelanggan",
  kontrak: "/admin/kontrak",
  "monitoring-kontrak": "/admin/monitoring-kontrak",
  "portal-registrations": "/admin/permohonan-layanan",
  "service-change-requests": "/admin/perubahan-layanan",
  "kelola-pengguna": "/admin/pengguna",
  "isp-directory": "/admin/isp",
  "titik-peta": "/admin/peta",
  "teknisi-antrean": "/teknisi/antrean",
  "isp-ringkasan": "/isp/beranda",
  "isp-kontrak": "/isp/kontrak",
  "isp-dokumen": "/isp/dokumen",
  "pelanggan-beranda": "/pelanggan/beranda",
  "pelanggan-layanan": "/pelanggan/layanan",
  "pelanggan-dokumen": "/pelanggan/dokumen",
  "pelanggan-permohonan": "/pelanggan/permohonan",
  "pelanggan-ajukan": "/pelanggan/tambah-layanan",
  "pelanggan-profil": "/pelanggan/profil",
  "direksi-persetujuan": "/direksi/persetujuan",
  "keuangan-tagihan": "/keuangan/tagihan",
  "internal-workflow-dashboard": "/sop/antrean",
};

function routeFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const workflowMatch = path.match(/^\/sop\/workflows\/(\d+)\/step\/(\d+)$/);
  if (workflowMatch) {
    return { page: `sop-step-${workflowMatch[2]}`, workflowId: Number(workflowMatch[1]) };
  }
  const page = Object.entries(PAGE_PATHS).find(([, route]) => route === path)?.[0] || null;
  return { page, workflowId: null };
}

function pathForPage(page, workflowId) {
  if (String(page).startsWith("sop-step-")) {
    const step = String(page).replace("sop-step-", "");
    return workflowId ? `/sop/workflows/${workflowId}/step/${step}` : `/sop/step/${step}`;
  }
  return PAGE_PATHS[page] || "/";
}

import Login from "../auth/Login";

function getInitialSession() {
  const storedSession = getSession();
  if (!storedSession?.token) return null;
  if (
    storedSession.must_change_password ||
    (storedSession.expires_at && Number(storedSession.expires_at) <= Date.now())
  ) {
    clearSession();
    return null;
  }
  return storedSession;
}

export default function RustCoreApp() {
  const initialRoute = routeFromLocation();
  const [session, setSession] = useState(getInitialSession);
  const [sessionStatus, setSessionStatus] = useState(() => (getSession()?.token ? "checking" : "ready"));
  const [sessionError, setSessionError] = useState("");
  const [page, setPage] = useState(() => {
    const storedSession = getSession();
    if (initialRoute.page) return initialRoute.page;
    return storedSession?.user?.role === "admin"
      ? DEFAULT_ADMIN_PAGE
      : localStorage.getItem(PAGE_KEY) || DEFAULT_ADMIN_PAGE;
  });
  const [workflowId, setWorkflowId] = useState(initialRoute.workflowId); // For SOP workflow tracking
  const [sidebarHover, setSidebarHover] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const btnRef = useRef(null);
  const isAdminSession = session?.user?.role === "admin" || session?.role === "admin";

  // Pasang handler sebelum halaman yang membutuhkan API dirender.
  useEffect(() => {
    return setUnauthorizedHandler(() => {
      clearSession();
      setSession(null);
      setSessionStatus("ready");
      setSessionError("");
    });
  }, []);

  // Admin menerima notifikasi permohonan baru dan perpindahan tahap SOP2.
  // Polling ringan menjaga badge tetap aktual tanpa mengganggu halaman kerja.
  useEffect(() => {
    if (!isAdminSession || !session?.token) {
      return undefined;
    }

    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const rows = await listAdminNotifications(session.token);
        if (!cancelled) setAdminNotifications(Array.isArray(rows) ? rows : []);
      } catch {
        // Notifikasi bersifat pelengkap; kegagalan polling tidak menghalangi
        // Admin menggunakan antrean permohonan.
      }
    };

    loadNotifications();
    window.addEventListener("focus", loadNotifications);
    const timer = window.setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadNotifications);
      window.clearInterval(timer);
    };
  }, [isAdminSession, session?.token]);

  // Jika sesi dihapus dari tab lain, tab ini juga harus kembali ke login.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== SESSION_KEY || event.newValue !== null) return;
      clearSession();
      setSession(null);
      setSessionStatus("ready");
      setSessionError("");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Sesi dari localStorage harus diverifikasi ke backend sebelum Dashboard
  // ditampilkan. Token yang masih tersimpan belum tentu masih valid.
  useEffect(() => {
    const storedSession = getSession();
    if (!storedSession?.token) return undefined;

    let cancelled = false;

    getCurrentSession(storedSession.token)
      .then((user) => {
        if (cancelled) return;
        const refreshedSession = {
          ...storedSession,
          user,
          role: user.role || storedSession.role || "",
        };
        saveSession(refreshedSession);
        setSession(refreshedSession);
        setSessionStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401) {
          clearSession();
          setSession(null);
          setSessionStatus("ready");
          return;
        }
        setSessionError("Sesi belum dapat diverifikasi. Periksa koneksi lalu coba lagi.");
        setSessionStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openProfile = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setProfileOpen(v => !v);
  };

  useEffect(() => {
    const close = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  // Simpan halaman terakhir ke localStorage
  useEffect(() => {
    localStorage.setItem(PAGE_KEY, page);
  }, [page]);

  // Setiap menu internal memiliki URL yang dapat dibuka ulang atau dibagikan.
  // History API dipakai agar aplikasi tetap SPA tanpa menambah dependency router.
  useEffect(() => {
    if (!session) return;
    const targetPath = pathForPage(page, workflowId);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page, workflowId }, "", targetPath);
    }
  }, [page, workflowId, session]);

  // Back/forward browser mengubah halaman internal tanpa reload penuh.
  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = routeFromLocation();
      if (nextRoute.page) setPage(nextRoute.page);
      if (nextRoute.workflowId !== null) setWorkflowId(nextRoute.workflowId);
      else if (!String(nextRoute.page || "").startsWith("sop-step-")) setWorkflowId(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleLogin = (nextSession) => {
    saveSession(nextSession);
    const defaultPage = DEFAULT_ROLE_PAGES[nextSession?.user?.role];
    if (defaultPage) {
      setPage(defaultPage);
      localStorage.setItem(PAGE_KEY, defaultPage);
    }
    setSessionError("");
    setSessionStatus("ready");
    setSession(nextSession);
  };

  // SOP Workflow handlers
  const navigateToWorkflowStep = (wfId, step) => {
    setWorkflowId(wfId);
    setPage(`sop-step-${step}`);
  };

  // Kembali ke dashboard workflow sesuai peran setelah aksi step selesai/batal.
  const backToWorkflowHome = () => {
    setWorkflowId(null);
    const role = session?.user?.role;
    if (role === "teknisi") setPage("teknisi-antrean");
    else if (role === "pelanggan") setPage("pelanggan-permohonan");
    else if (role === "isp") setPage("portal-dashboard");
    else setPage("internal-workflow-dashboard");
  };

  if (sessionStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0c12] text-white">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold-accent border-t-transparent" />
          <p className="text-xs font-bold text-white/60">Memverifikasi sesi...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0c12] px-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="mb-2 text-sm font-black text-rose-300">Sesi belum dapat diverifikasi</p>
          <p className="mb-4 text-xs text-rose-100/70">{sessionError}</p>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15">
              Coba Lagi
            </button>
            <button type="button" onClick={() => { clearSession(); setSession(null); setSessionStatus("ready"); }} className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/30">
              Ke Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  const isAdmin = isAdminSession;
  const isTechnician = session.user?.role === "teknisi";
  const isPelanggan = session.user?.role === "pelanggan";
  const isIsp = session.user?.role === "isp";
  const isDireksi = session.user?.role === "direksi";
  const isFinance = session.user?.role === "keuangan";
  const technicianPages = ["titik-peta", "teknisi-antrean"];
  const ispPages = ["isp-ringkasan", "isp-kontrak", "isp-dokumen"];
  const pelangganPages = ["pelanggan-beranda", "pelanggan-layanan", "pelanggan-dokumen", "pelanggan-permohonan", "pelanggan-ajukan", "pelanggan-profil"];
  const roleQueuePages = { direksi: ["direksi-persetujuan"], keuangan: ["keuangan-tagihan"] };
  const adminPages = ["dashboard", "pelanggan", "kontrak", "monitoring-kontrak", "portal-registrations", "service-change-requests", "kelola-pengguna", "isp-directory", "titik-peta"];
  const isWorkflowStepPage = Boolean(workflowId && /^sop-step-\d+$/.test(page));

  let activePage;
  if (isWorkflowStepPage) {
    activePage = page;
  } else if (isTechnician) {
    activePage = technicianPages.includes(page) ? page : "teknisi-antrean";
  } else if (isPelanggan) {
    activePage = pelangganPages.includes(page) ? page : "pelanggan-beranda";
  } else if (isIsp) {
    activePage = ispPages.includes(page) || page.startsWith("isp-") ? page : "isp-ringkasan";
  } else if (isDireksi) {
    activePage = roleQueuePages.direksi.includes(page) ? page : "direksi-persetujuan";
  } else if (isFinance) {
    activePage = roleQueuePages.keuangan.includes(page) ? page : "keuangan-tagihan";
  } else if (isAdmin) {
    activePage = adminPages.includes(page) ? page : DEFAULT_ADMIN_PAGE;
  } else {
    activePage = page;
  }

  const expanded = sidebarHover;
  const email = session.user?.email || "";
  const initials = email ? email.substring(0, 2).toUpperCase() : "U";
  // Nilai role backend tetap `pelanggan` untuk kompatibilitas, tetapi akun ini
  // adalah pemohon layanan (lokasi/tenant). Istilah Pelanggan di KIMA dipakai
  // untuk master ISP pada menu admin.
  const roleLabels = { admin: "Admin KIMA", teknisi: "Teknisi", direksi: "Direksi", keuangan: "Keuangan", isp: "ISP", pelanggan: "Lokasi/Tenant" };
  const roleLabel = roleLabels[session.user?.role] || "Pengguna";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=d4a937&color=0a0c12&bold=true&size=80`;
  const unreadAdminNotificationCount = adminNotifications.filter((item) => !item.read_at).length;

  const openAdminNotification = async (item) => {
    if (!item.read_at) {
      try {
        await markAdminNotification(session.token, item.source, item.id, true);
      } catch {
        // Tetap buka antrean meskipun penandaan baca gagal.
      }
      setAdminNotifications((current) => current.map((entry) => (
        entry.source === item.source && entry.id === item.id
          ? { ...entry, read_at: new Date().toISOString() }
          : entry
      )));
    }
    setAdminNotificationsOpen(false);
    if (item.source === "sop2") setPage("service-change-requests");
    else if (item.source === "sop1") setPage("portal-registrations");
  };


  const sidebarMenu = isTechnician
    ? [{ key: "teknisi-antrean", label: "Antrean Teknis", icon: IconTool }, { key: "titik-peta", label: "Titik Peta", icon: IconMapPin }]
    : isAdmin
    ? [...MENU, { key: "portal-registrations", label: "Permohonan Layanan", icon: IconClipboard }, { key: "service-change-requests", label: "Perubahan Layanan", icon: IconFile }, { key: "kelola-pengguna", label: "Kelola Pengguna", icon: IconUsers }, { key: "isp-directory", label: "Daftar ISP", icon: IconBuildingNetwork }, { key: "titik-peta", label: "Titik Peta", icon: IconMapPin }]
    : isPelanggan
      ? [{ key: "pelanggan-beranda", label: "Beranda", icon: IconDashboard }, { key: "pelanggan-ajukan", label: "Tambah Layanan", icon: IconPlusDocument }, { key: "pelanggan-permohonan", label: "Permohonan Layanan", icon: IconClipboard }]
      : isDireksi
        ? [{ key: "direksi-persetujuan", label: "Persetujuan", icon: IconShieldCheck }]
        : isFinance
          ? [{ key: "keuangan-tagihan", label: "Tagihan & Bayar", icon: IconReceipt }]
      : [{ key: "isp-ringkasan", label: "Ringkasan", icon: IconDashboard }, { key: "isp-kontrak", label: "Kontrak & Lokasi", icon: IconKontrak }, { key: "isp-dokumen", label: "Dokumen", icon: IconFile }];

  return (
    <main className="flex min-h-screen gap-2 text-white sm:gap-4">
      <div id="bg-image-layer" />
      <div id="bg-glass-overlay" />

      {/* Spacer for sidebar */}
      <div className="m-3 mr-0 w-12 shrink-0 sm:m-5 sm:mr-0 sm:w-[56px]" />

      {/* Sidebar */}
      <aside
        style={{ position: "fixed", zIndex: 30 }}
        className={`glass-premium left-3 top-3 flex h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl transition-all duration-300 sm:left-5 sm:top-5 sm:h-[calc(100vh-2.5rem)] ${expanded ? "w-[180px]" : "w-12 sm:w-[56px]"}`}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        <div className={`flex items-center py-4 transition-all duration-300 mb-4 ${expanded ? "px-4 gap-3" : "justify-center"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-accent shadow-[0_0_12px_rgba(212,169,55,0.4)]">
            <img alt="" className="h-5 w-5" src="/logo-kima.png" />
          </div>
          <span className={`overflow-hidden whitespace-nowrap text-sm font-bold text-white transition-all duration-300 ${expanded ? "max-w-24 opacity-100" : "max-w-0 opacity-0"}`}>
            KIMA
          </span>
        </div>

        <nav className="flex-1 space-y-2 px-2 pb-4 overflow-y-auto">
          {sidebarMenu.map((item) => {
            const active = activePage === item.key;
            const isLong = item.label.length >= 14;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                title={!expanded ? item.label : ""}
                className={`sidebar-menu-item group flex w-full items-center rounded-lg transition-all duration-300 ${expanded ? "gap-3 px-3 py-2" : "justify-center py-2"} ${active ? "text-gold-accent bg-gold-accent/10" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
              >
                <span className="shrink-0"><item.icon /></span>
                <span className={`sidebar-menu-label-viewport min-w-0 overflow-hidden whitespace-nowrap text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${expanded ? "max-w-28 flex-1 opacity-100" : "max-w-0 opacity-0"}`}>
                  <span className={`sidebar-menu-label-track ${isLong ? "sidebar-menu-label-track--long" : ""}`}>
                    <span className="sidebar-menu-label-copy">{item.label}</span>
                    {isLong && <span className="sidebar-menu-label-copy" aria-hidden="true">{item.label}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col p-3 pl-0 sm:p-5 sm:pl-0">
        {/* Header with Profile */}
        <div className="mb-5 flex items-center justify-end gap-3">
          {isAdmin && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Notifikasi Admin"
                aria-expanded={adminNotificationsOpen}
                onClick={() => { setAdminNotificationsOpen((current) => !current); setProfileOpen(false); }}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/75 shadow-sm backdrop-blur-md transition hover:bg-white/20 hover:text-white"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {unreadAdminNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#101827] bg-gold-accent px-1 text-[9px] font-black leading-none text-[#101827]">
                    {unreadAdminNotificationCount > 9 ? "9+" : unreadAdminNotificationCount}
                  </span>
                )}
              </button>

              {adminNotificationsOpen && (
                <div className="absolute right-0 top-12 z-[2030] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#111a2c]/95 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div>
                      <p className="text-xs font-black text-white">Notifikasi Admin</p>
                      <p className="mt-0.5 text-[10px] text-white/50">Permohonan yang membutuhkan perhatian</p>
                    </div>
                    {unreadAdminNotificationCount > 0 && (
                      <span className="rounded-full bg-gold-accent/15 px-2 py-1 text-[9px] font-black text-gold-accent">
                        {unreadAdminNotificationCount} baru
                      </span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {adminNotifications.length === 0 ? (
                      <p className="px-3 py-8 text-center text-[11px] font-semibold text-white/45">Belum ada notifikasi.</p>
                    ) : (
                      adminNotifications.slice(0, 6).map((item) => (
                        <button
                          key={`${item.source}-${item.id}`}
                          type="button"
                          onClick={() => openAdminNotification(item)}
                          className={`mb-1.5 block w-full rounded-xl border px-3 py-2.5 text-left transition last:mb-0 ${item.read_at ? "border-white/5 bg-white/[0.03] hover:bg-white/[0.08]" : "border-gold-accent/25 bg-gold-accent/[0.08] hover:bg-gold-accent/[0.14]"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-black text-white">{item.title}</p>
                            {!item.read_at && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-accent" aria-label="Belum dibaca" />}
                          </div>
                          <p className="mt-1 text-[10px] leading-relaxed text-white/65">{item.message}</p>
                          <p className="mt-1.5 text-[9px] font-bold uppercase tracking-wide text-white/35">{item.kode}</p>
                        </button>
                      ))
                    )}
                  </div>
                  {adminNotifications.length > 6 && (
                    <button type="button" onClick={() => { setAdminNotificationsOpen(false); setPage("portal-registrations"); }} className="w-full border-t border-white/10 px-4 py-2.5 text-center text-[10px] font-black text-gold-accent hover:bg-white/5">
                      Lihat antrean layanan
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="relative shrink-0" ref={profileRef}>
            <button
              ref={btnRef}
              onClick={openProfile}
              type="button"
              className="flex h-10 w-auto shrink-0 items-center justify-start gap-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 shadow-sm p-1 pr-4 anim-surface hover:bg-white/20"
            >
              <img alt="Profile" className="h-8 w-8 rounded-lg object-cover ring-2 ring-white/50 shadow-sm bg-white" src={avatarUrl} />
              <div className="hidden text-left md:block">
                <p className="text-[10px] font-black text-on-surface tracking-tight leading-none">{email.split("@")[0]}</p>
                <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-gold-accent mt-0.5">{roleLabel}</p>
              </div>
            </button>

            {profileOpen && (
              <div
                style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: 2030 }}
                className="w-52 origin-top-right rounded-2xl glass-popover anim-popover p-2 shadow-glass-depth md:w-56"
              >
                <div className="px-3 py-3 border-b border-white/10 mb-1.5">
                  <p className="text-xs font-black text-on-surface truncate">{email}</p>
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase mt-0.5 truncate">{roleLabel}</p>
                </div>
                <button
                  onClick={() => { setProfileOpen(false); clearSession(); setSession(null); setSessionStatus("ready"); }}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 anim-surface"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Keluar Sesi</span>
                </button>
                {isPelanggan && (
                  <button
                    onClick={() => { setProfileOpen(false); setPage("pelanggan-profil"); }}
                    type="button"
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold text-sky-200 hover:bg-sky-400/10 anim-surface"
                  >
                    <IconPelanggan />
                    <span>Profil Perusahaan</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1">
          <Suspense fallback={<div className="flex min-h-40 items-center justify-center text-sm font-semibold text-white/55">Memuat halaman…</div>}>
            {activePage === "dashboard" && <DashboardPage session={session} />}
            {activePage === "pelanggan" && <PelangganPage session={session} />}
            {activePage === "kontrak" && <KontrakPage session={session} />}
            {activePage === "monitoring-kontrak" && <MonitoringKontrakPage session={session} />}
            {activePage === "kelola-pengguna" && <KelolaPenggunaPage session={session} />}
            {activePage === "portal-registrations" && <PortalRegistrationsAdmin session={session} />}
            {activePage === "service-change-requests" && <ServiceChangeRequestsAdmin session={session} />}
            {activePage === "isp-directory" && <IspDirectoryPage session={session} />}
            {activePage === "direksi-persetujuan" && <RoleWorkQueue session={session} role="direksi" />}
            {activePage === "keuangan-tagihan" && <RoleWorkQueue session={session} role="keuangan" />}
            {activePage === "teknisi-antrean" && <RoleWorkQueue session={session} role="teknisi" />}
            {activePage === "titik-peta" && <TitikPetaPage session={session} />}

            {/* SOP Workflow Pages */}
            {activePage === "internal-workflow-dashboard" && (
              <InternalWorkflowDashboard onNavigateStep={navigateToWorkflowStep} />
            )}
            {isPelanggan && ["pelanggan-beranda", "pelanggan-layanan", "pelanggan-dokumen", "pelanggan-profil", "pelanggan-permohonan"].includes(activePage) && <PelangganPortalPage session={session} page={activePage} onNavigate={setPage} />}
            {activePage === "pelanggan-ajukan" && <ServiceChangeRequestPage session={session} onDone={() => setPage("pelanggan-permohonan")} onBack={() => setPage("pelanggan-permohonan")} />}
            {workflowId && activePage === "sop-step-4" && (
              <Step4Survey
                workflowId={workflowId}
                workflow={{ id: workflowId }}
                onDone={backToWorkflowHome}
                onBack={backToWorkflowHome}
              />
            )}
            {workflowId && activePage === "sop-step-5" && (
              <Step5Proposal
                workflowId={workflowId}
                workflow={{ id: workflowId }}
                onDone={backToWorkflowHome}
                onBack={backToWorkflowHome}
              />
            )}
            {workflowId && activePage === "sop-step-6" && (
              <Step6Presentasi
                workflowId={workflowId}
                workflow={{ id: workflowId }}
                userRole={session.user?.role || "customer"}
                onDone={backToWorkflowHome}
                onBack={backToWorkflowHome}
              />
            )}
            {isIsp && activePage.startsWith("isp-") && <IspPortalPage session={session} page={activePage} />}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
