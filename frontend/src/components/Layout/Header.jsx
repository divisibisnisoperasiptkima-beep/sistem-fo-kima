import { useEffect, useRef, useState } from "react";

/**
 * Header component with profile dropdown
 */
function Header({ session, onLogout }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const btnRef = useRef(null);

  const openProfile = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setProfileOpen(v => !v);
  };

  useEffect(() => {
    const close = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const email = session.user?.email || "";
  const initials = email ? email.substring(0, 2).toUpperCase() : "U";
  const roleLabel = session.role ? session.role.charAt(0).toUpperCase() + session.role.slice(1) : "Pengguna";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=d4a937&color=0a0c12&bold=true&size=80`;

  return (
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
            style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: 2030, transformOrigin: "top right" }}
            className="w-52 origin-top-right rounded-2xl glass-popover anim-popover p-2 shadow-glass-depth md:w-56"
          >
            <div className="px-3 py-3 border-b border-white/10 mb-1.5">
              <p className="text-xs font-black text-on-surface truncate">{email}</p>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase mt-0.5 truncate">{roleLabel}</p>
            </div>
            <button
              onClick={() => { setProfileOpen(false); onLogout(); }}
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 anim-surface"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Keluar Sesi</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Header;
