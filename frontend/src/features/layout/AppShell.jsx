import Sidebar from "../../components/Layout/Sidebar";
import Header from "../../components/Layout/Header";

/**
 * AppShell - Main layout wrapper
 */
function AppShell({ currentPage, onNavigate, session, onLogout, children }) {
  return (
    <main className="min-h-screen flex gap-4 text-white">
      {/* Background layers */}
      <div id="bg-image-layer" />
      <div id="bg-glass-overlay" />

      {/* Sidebar spacer */}
      <div className="w-[56px] shrink-0 m-5 mr-0" />

      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />

      {/* Main content area */}
      <div className="min-w-0 flex-1 flex flex-col p-5 pl-0">
        <Header session={session} onLogout={onLogout} />
        <div className="flex-1">
          {children}
        </div>
      </div>
    </main>
  );
}

export default AppShell;
