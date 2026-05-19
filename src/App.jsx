import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/layout/Layout';
import DashboardLayout from './components/dashboard/DashboardLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import { AssessmentProvider } from './context/AssessmentContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import IOSInstallPrompt from './components/IOSInstallPrompt';
import useThemeColor from './components/common/useThemeColor';
// [P1-DEEP-SEARCH-PIPELINE · 2026-05-15] Boot hook que detecta planes pendientes
// y redirige al dashboard cuando el pipeline backend completa fuera del SSE.
import PendingPipelineRecovery from './components/PendingPipelineRecovery';

// --- Lazy-loaded pages (code-split into separate chunks) ---
const Assessment = lazy(() => import('./pages/Assessment'));
const Plan = lazy(() => import('./pages/Plan'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

const Pantry = lazy(() => import('./pages/Pantry'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Settings = lazy(() => import('./pages/Settings'));
const History = lazy(() => import('./pages/History'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const Privacy = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.Terms })));
const Cookies = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.Cookies })));
const MedicalDisclaimer = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.MedicalDisclaimer })));

// --- Minimal loading fallback (Empty to prevent double loading screens) ---
const PageLoader = () => <div className="min-h-screen bg-slate-50/50" />;

// --- Native Style Page Transitions ---
// [P3-DASH-NO-ANIMATE · 2026-05-19] AnimatePresence + motion.div con
// `key={location.pathname}` removido. Era la causa raíz del "double mount"
// que el user percibía como delay en Nevera: cuando location cambiaba,
// la `key` cambiaba → motion.div se desmontaba completo + remontaba →
// TODO el árbol descendiente (Suspense → DashboardAnimatedLayout →
// Outlet → Pantry) se desmontaba y remontaba. Pantry siendo el más
// pesado (1100 líneas + 30+ items + Supabase realtime channel) tomaba
// ~120ms por mount × 2 mounts (uno por unmount + uno por remount) =
// ~240-340ms perceptibles. Las páginas más livianas tenían el mismo bug
// pero ~30ms × 2 = 60ms imperceptible. Diagnóstico via telemetría
// [PANTRY-PERF]: vimos 2 ciclos completos de Mount fetch decision /
// Paint settled separados por ~200ms aunque cache hits ambos.
//
// Trade-off aceptado: cero animación entre páginas público + auth +
// assessment + plan. El user explícitamente reportó "snap puro"
// preferible al fade que sumaba delay perceptible.
const AnimatedLayout = () => {
  useThemeColor();
  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </div>
  );
};

// --- Native Style Page Transitions for Dashboard (Persistent Tab Bar) ---
// [P3-DASH-NO-ANIMATE · 2026-05-19] Eliminado AnimatePresence + motion.div.
// Diagnóstico: con `duration: 0` el fade era instantáneo PERO
// `AnimatePresence mode="popLayout"` igual mantenía 2 componentes en el
// DOM simultáneamente durante el "exit" — duplicaba los re-renders en
// cascada del componente entrante (Pantry tenía 8 renders × 2 = 16
// evaluaciones del JSX de 1100 líneas) en el caso peor. El user
// reportaba "delay" exclusivo a Nevera por su mayor tamaño de JSX.
// Sin AnimatePresence, el page swap es snap puro: la página vieja se
// desmonta y la nueva monta en el mismo frame del router update.
// Trade-off aceptado: cero animation cue al cambiar de apartado. El
// active state del NavItem (sidebar/bottomtabbar) sigue dando feedback
// visual del click.
const DashboardAnimatedLayout = () => {
  const location = useLocation();
  useThemeColor();
  const isAgent = location.pathname.includes('/agent');

  return (
    <DashboardLayout noPaddingMobile={isAgent}>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </DashboardLayout>
  );
};

function App() {
  return (
    <AssessmentProvider>
      <Router>
        <IOSInstallPrompt />
        {/* [P1-DEEP-SEARCH-PIPELINE · 2026-05-15] Headless: poll background
            pipeline status si el user tiene plan pendiente en localStorage. */}
        <PendingPipelineRecovery />
        <Routes>
          <Route element={<AnimatedLayout />}>
            {/* Public Routes: Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Rutas Protegidas */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout><Home /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/assessment" element={
              <ProtectedRoute>
                <Assessment />
              </ProtectedRoute>
            } />

            <Route path="/plan" element={
              <ProtectedRoute>
                <Layout><Plan /></Layout>
              </ProtectedRoute>
            } />

            {/* Rutas con Tabs Fijos (Dashboard) */}
            <Route element={<ProtectedRoute><DashboardAnimatedLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/pantry" element={<Pantry />} />
              <Route path="/dashboard/recipes" element={<Recipes />} />
              <Route path="/dashboard/agent" element={<AgentPage />} />
              <Route path="/dashboard/settings" element={<Settings />} />
              <Route path="/history" element={<History />} />
            </Route>

            {/* Rutas Legales (Públicas) */}
            <Route path="/privacy" element={<Layout><Privacy /></Layout>} />
            <Route path="/terms" element={<Layout><Terms /></Layout>} />
            <Route path="/cookies" element={<Layout><Cookies /></Layout>} />
            <Route path="/medical" element={<Layout><MedicalDisclaimer /></Layout>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </AssessmentProvider>
  );
}

export default App;