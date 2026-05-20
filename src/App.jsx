import { lazy, Suspense, useRef } from 'react';
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
// [P1-AGENT-KEEP-ALIVE · 2026-05-20] AgentPage NO se desmonta al navegar.
//
// Bug cerrado: "Cada vez que entro en Nevera y vuelvo a Agente se refresca y
// molesta" (reportado 2026-05-20). React Router por default desmonta el
// componente al cambiar de ruta, lo cual reseteaba: chatSessions, messages,
// scroll position, listeners SSE, lazy-load chunks. Los fixes #9 (persistir
// sessionId) y #10 (cache messages) mitigaban con localStorage pero el flash
// del re-mount seguía visible.
//
// Solución: keep-alive con `display: none`. AgentPage se monta UNA VEZ al
// primer visit (lazy-load del chunk) y queda residente en el árbol React
// mientras el user está en cualquier ruta /dashboard/*. Cuando navega a
// /dashboard/pantry, AgentPage se OCULTA con display:none — su state,
// listeners, scroll, animation, todo se preserva en memoria. Al volver a
// /dashboard/agent, aparece instantáneo SIN re-mount, SIN refetch, SIN flash.
//
// `hasVisitedAgentRef` evita pagar el coste de montar AgentPage si el user
// nunca entra al chat (lazy-load del chunk de ~300KB). Una vez visitado,
// queda persistente hasta logout/page-reload.
//
// Trade-off aceptado: AgentPage residente consume ~5-10MB de heap mientras
// el user navega por Nevera/Plan/Recetas/Settings. A cambio: cero flash visible
// al cambiar de tab. Pollings/intervals de AgentPage siguen activos durante
// display:none (cada cleanup useEffect requiere desmount real). Verificado
// que ninguno es destructive — el polling de title se autoinhibe cuando NO
// hay session generando.
const DashboardAnimatedLayout = () => {
  const location = useLocation();
  useThemeColor();
  const isAgent = location.pathname.includes('/agent');

  // Lazy keep-alive: solo montar AgentPage si el user ha visitado al menos
  // una vez. Evita pagar el chunk de 300KB si nunca entra al chat.
  const hasVisitedAgentRef = useRef(false);
  if (isAgent) hasVisitedAgentRef.current = true;

  return (
    <DashboardLayout noPaddingMobile={isAgent}>
      {/* AgentPage residente — visible cuando isAgent, oculto cuando no.
          NO se desmonta al navegar a otras dashboard routes. */}
      {hasVisitedAgentRef.current && (
        <div style={{ display: isAgent ? 'block' : 'none', height: isAgent ? 'auto' : 0, overflow: isAgent ? 'visible' : 'hidden' }}>
          <Suspense fallback={isAgent ? <PageLoader /> : null}>
            <AgentPage />
          </Suspense>
        </div>
      )}
      {/* Outlet renderiza Dashboard/Pantry/Recipes/Settings/History cuando
          NO estamos en /dashboard/agent. La Route de /dashboard/agent es un
          trampolin vacío (<></>) porque AgentPage ya está residente arriba. */}
      {!isAgent && (
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      )}
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
              {/* [P1-AGENT-KEEP-ALIVE · 2026-05-20] AgentPage vive residente
                  en DashboardAnimatedLayout (keep-alive). Esta route es solo
                  un trampolin para que React Router matchee el path y NO
                  caiga al fallback "*" → Navigate("/"). El element vacío es
                  intencional: AgentPage ya está renderizado en el layout
                  arriba del Outlet. Sin esta route, /dashboard/agent
                  matchearía el wildcard y redirigiría a /. */}
              <Route path="/dashboard/agent" element={<></>} />
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