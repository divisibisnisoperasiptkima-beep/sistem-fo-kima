const value = (item) => item == null || item === "" ? "—" : String(item);

export const userColumns = [
  { label: "Email", render: (row) => value(row.email), width: 200, sticky: true },
  {
    label: "Role",
    width: 100,
    render: (row) => {
      const colors = {
        admin: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        teknisi: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        direksi: "bg-violet-500/20 text-violet-300 border-violet-500/30",
        keuangan: "bg-sky-500/20 text-sky-300 border-sky-500/30",
        isp: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        pelanggan: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      };
      const labels = { admin: "Admin KIMA", teknisi: "Teknisi", direksi: "Direksi", keuangan: "Keuangan", isp: "ISP", pelanggan: "Pelanggan" };
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${colors[row.role] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
          {labels[row.role] || row.role}
        </span>
      );
    },
  },
  {
    label: "Status",
    width: 100,
    render: (row) => (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${row.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${row.is_active ? "bg-emerald-400" : "bg-red-400"}`} />
        {row.is_active ? "Aktif" : "Nonaktif"}
      </span>
    ),
  },
  {
    label: "Login Terakhir",
    width: 160,
    render: (row) => {
      if (!row.last_login_at) return <span className="text-slate-500 text-xs">--</span>;
      const d = new Date(row.last_login_at);
      return <span className="text-slate-300 text-xs">{d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })} {d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>;
    },
  },
  {
    label: "Gagal Login",
    width: 100,
    render: (row) => (
      <span className={`text-xs font-semibold ${row.failed_login_attempts > 0 ? "text-red-400" : "text-slate-400"}`}>
        {value(row.failed_login_attempts)}
      </span>
    ),
  },
  {
    label: "Terkunci Sampai",
    width: 160,
    render: (row) => {
      if (!row.locked_until) return <span className="text-slate-500 text-xs">--</span>;
      const d = new Date(row.locked_until);
      return <span className="text-red-400 text-xs">{d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })} {d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>;
    },
  },
  {
    label: "Dibuat",
    width: 160,
    render: (row) => {
      const d = new Date(row.created_at);
      return <span className="text-slate-400 text-xs">{d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })} {d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>;
    },
  },
  { label: "Aksi", width: 120 },
];
