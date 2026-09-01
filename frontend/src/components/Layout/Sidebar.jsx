import { useState } from "react";
import { IconDashboard, IconPelanggan, IconKontrak, IconMonitoring } from "../../components/icons";

const MENU_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: IconDashboard },
  { key: "pelanggan", label: "Pelanggan", icon: IconPelanggan },
  { key: "kontrak", label: "Kontrak Lengkap", icon: IconKontrak },
  { key: "monitoring-kontrak", label: "Monitoring Kontrak", icon: IconMonitoring },
];

/**
 * Sidebar component
 */
function Sidebar({ currentPage, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      style={{ position: "fixed", left: 20, top: 20, zIndex: 30, height: "calc(100vh - 40px)" }}
      className={`glass-premium flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ${expanded ? "w-[180px]" : "w-[56px]"}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className={`flex items-center py-4 transition-all duration-300 mb-4 ${expanded ? "px-4 gap-3" : "justify-center"}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold-accent shadow-[0_0_12px_rgba(212,169,55,0.4)]">
          <img alt="" className="h-5 w-5" src="/logo-kima.png" />
        </div>
        <span className={`overflow-hidden whitespace-nowrap text-sm font-bold text-white transition-all duration-300 ${expanded ? "max-w-24 opacity-100" : "max-w-0 opacity-0"}`}>
          KIMA
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-2 pb-4 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const active = currentPage === item.key;
          const isLong = item.label.length >= 14;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={!expanded ? item.label : ""}
              className={`sidebar-menu-item group flex w-full items-center rounded-lg transition-all duration-300 ${
                expanded ? "gap-3 px-3 py-2" : "justify-center py-2"
              } ${
                active ? "text-gold-accent bg-gold-accent/10" : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="shrink-0"><Icon /></span>
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
  );
}

export default Sidebar;
