import RustCoreApp from "./features/rust-core/RustCoreApp";
import PortalRegister from "./features/sop/PortalRegister";
import TrackServiceRequestPage from "./features/sop/TrackServiceRequestPage";

const SERVICE_REQUEST_PATH = "/ajukan-layanan";
const TRACK_SERVICE_REQUEST_PATH = "/lacak-permohonan";

export default function App() {
  if (window.location.pathname === SERVICE_REQUEST_PATH) {
    return (
      <PortalRegister
        onDone={(result) => {
          const code = result?.kode_registrasi ? ` Kode permohonan: ${result.kode_registrasi}.` : "";
          window.alert(`Permohonan layanan terkirim.${code} Tim KIMA akan menghubungi PIC lokasi untuk konfirmasi kebutuhan dan survei jalur.`);
          window.location.assign("/");
        }}
        onBackToLogin={() => window.location.assign("/")}
      />
    );
  }

  if (window.location.pathname === TRACK_SERVICE_REQUEST_PATH) {
    return <TrackServiceRequestPage onBack={() => window.location.assign("/")} />;
  }

  return <RustCoreApp />;
}
