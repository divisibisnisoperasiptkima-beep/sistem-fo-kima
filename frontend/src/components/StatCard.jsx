/**
 * StatCard component for displaying dashboard statistics
 */
function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl p-4 bg-slate-900/40 border border-white/10">
      <div className="flex justify-between items-start mb-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      </div>
      <h3 className="text-xl font-black text-white mb-1">{value}</h3>
      <p className="text-[10px] font-bold text-slate-400 uppercase">{sub}</p>
    </div>
  );
}

export default StatCard;
