import { useEffect, useRef, useState } from "react";
import {
  clearSession,
  getCurrentSession,
  getSession,
  saveSession,
  SESSION_KEY,
  setUnauthorizedHandler,
} from "../../lib/rust-api";
// Modular page imports - using standalone components
import PelangganPage from "../pelanggan/PelangganPage";
import KontrakPage from "../kontrak/KontrakPage";
import DashboardPage from "../dashboard/DashboardPage";
import MonitoringKontrakPage from "../monitoring-kontrak/MonitoringKontrakPage";
import KelolaPenggunaPage from "../kelola-pengguna/KelolaPenggunaPage";
import TitikPetaPage from "../titik-peta/TitikPetaPage";
import IspPortalPage from "../isp-portal/IspPortalPage";
import { IconUsers } from "../../components/icons";

// Menu icons
const IconDashboard = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
const IconPelanggan = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.74" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>;
const IconKontrak = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
const IconMonitoring = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /><polyline points="6 8 10 12 14 8 18 12" /></svg>;
const IconMapPin = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconFile = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>;

const MENU = [
  { key: "dashboard", label: "Dashboard", icon: IconDashboard },
  { key: "pelanggan", label: "Pelanggan", icon: IconPelanggan },
  { key: "kontrak", label: "Kontrak Lengkap", icon: IconKontrak },
  { key: "monitoring-kontrak", label: "Monitoring Kontrak", icon: IconMonitoring },
];

const PAGE_KEY = "kima-last-page";
const DEFAULT_ADMIN_PAGE = "dashboard";

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
  const [session, setSession] = useState(getInitialSession);
  const [sessionStatus, setSessionStatus] = useState(() => (getSession()?.token ? "checking" : "ready"));
  const [sessionError, setSessionError] = useState("");
  const [page, setPage] = useState(() => {
    const storedSession = getSession();
    return storedSession?.user?.role === "admin"
      ? DEFAULT_ADMIN_PAGE
      : localStorage.getItem(PAGE_KEY) || DEFAULT_ADMIN_PAGE;
  });
  const [sidebarHover, setSidebarHover] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const btnRef = useRef(null);

  // Pasang handler sebelum halaman yang membutuhkan API dirender.
  useEffect(() => {
    return setUnauthorizedHandler(() => {
      clearSession();
      setSession(null);
      setSessionStatus("ready");
      setSessionError("");
    });
  }, []);

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

  const handleLogin = (nextSession) => {
    saveSession(nextSession);
    if (nextSession?.user?.role === "admin") {
      setPage(DEFAULT_ADMIN_PAGE);
      localStorage.setItem(PAGE_KEY, DEFAULT_ADMIN_PAGE);
    }
    setSessionError("");
    setSessionStatus("ready");
    setSession(nextSession);
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

  if (!session) return <Login onLogin={handleLogin} />;

  const isAdmin = session.user?.role === "admin";
  const isTechnician = session.user?.role === "teknisi";
  const isIsp = session.user?.role === "isp";
  const activePage = isTechnician ? "titik-peta" : isIsp && !page.startsWith("isp-") ? "isp-ringkasan" : page;

  const expanded = sidebarHover;
  const email = session.user?.email || "";
  const initials = email ? email.substring(0, 2).toUpperCase() : "U";
  const roleLabel = session.role ? session.role.charAt(0).toUpperCase() + session.role.slice(1) : "Pengguna";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=d4a937&color=0a0c12&bold=true&size=80`;


  const sidebarMenu = isTechnician
    ? [{ key: "titik-peta", label: "Titik Peta", icon: IconMapPin }]
    : isAdmin
    ? [...MENU, { key: "kelola-pengguna", label: "Kelola Pengguna", icon: IconUsers }, { key: "titik-peta", label: "Titik Peta", icon: IconMapPin }]
    : [{ key: "isp-ringkasan", label: "Ringkasan", icon: IconDashboard }, { key: "isp-kontrak", label: "Kontrak & Lokasi", icon: IconKontrak }, { key: "isp-dokumen", label: "Dokumen", icon: IconFile }];

  return (
    <main className="min-h-screen flex gap-4 text-white">
      <div id="bg-image-layer" />
      <div id="bg-glass-overlay" />

      {/* Spacer for sidebar */}
      <div className="w-[56px] shrink-0 m-5 mr-0" />

      {/* Sidebar */}
      <aside
        style={{ position: "fixed", left: 20, top: 20, zIndex: 30, height: "calc(100vh - 40px)" }}
        className={`glass-premium flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ${expanded ? "w-[180px]" : "w-[56px]"}`}
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
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                title={!expanded ? item.label : ""}
                className={`flex w-full items-center rounded-lg transition-all duration-300 ${expanded ? "gap-3 px-3 py-2" : "justify-center py-2"} ${active ? "text-gold-accent bg-gold-accent/10" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
              >
                <span className="shrink-0"><item.icon /></span>
                <span className={`overflow-hidden whitespace-nowrap text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${expanded ? "max-w-28 opacity-100" : "max-w-0 opacity-0"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="min-w-0 flex-1 flex flex-col p-5 pl-0">
        {/* Header with Profile */}
        <div className="mb-5 flex items-center justify-end gap-3">
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
              </div>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1">
          {activePage === "dashboard" && <DashboardPage session={session} />}
          {activePage === "pelanggan" && <PelangganPage session={session} />}
          {activePage === "kontrak" && <KontrakPage session={session} />}
          {activePage === "monitoring-kontrak" && <MonitoringKontrakPage session={session} />}
          {activePage === "kelola-pengguna" && <KelolaPenggunaPage session={session} />}
          {activePage === "titik-peta" && <TitikPetaPage session={session} />}
          {isIsp && activePage.startsWith("isp-") && <IspPortalPage session={session} page={activePage} />}
        </div>
      </div>
    </main>
  );
}
