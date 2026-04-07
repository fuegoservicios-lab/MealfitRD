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

// --- Lazy-loaded pages (code-split into separate chunks) ---
const Assessment = lazy(() => import('./pages/Assessment'));
const Plan = lazy(() => import('./pages/Plan'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ShoppingList = lazy(() => import('./pages/ShoppingList'));
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
const AnimatedLayout = () => {
  const location = useLocation();
  useThemeColor();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Native Style Page Transitions for Dashboard (Persistent Tab Bar) ---
const DashboardAnimatedLayout = () => {
  const location = useLocation();
  useThemeColor();
  const isAgent = location.pathname.includes('/agent');
  
  return (
    <DashboardLayout noPaddingMobile={isAgent}>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
};

function App() {
  return (
    <AssessmentProvider>
      <Router>
        <IOSInstallPrompt />
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
              <Route path="/dashboard/shopping" element={<ShoppingList />} />
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