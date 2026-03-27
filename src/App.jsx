import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import { AssessmentProvider } from './context/AssessmentContext';
import ProtectedRoute from './components/layout/ProtectedRoute';

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

// --- Minimal loading fallback ---
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '0.5rem'
  }}>
    <div style={{
      width: 28, height: 28,
      border: '3px solid #E2E8F0',
      borderTopColor: '#4F46E5',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite'
    }} />
  </div>
);

function App() {
  return (
    <AssessmentProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
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

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/shopping" element={
              <ProtectedRoute>
                <ShoppingList />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/recipes" element={
              <ProtectedRoute>
                <Recipes />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/agent" element={
              <ProtectedRoute>
                <AgentPage />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/history" element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            } />

            {/* Rutas Legales (Públicas) */}
            <Route path="/privacy" element={<Layout><Privacy /></Layout>} />
            <Route path="/terms" element={<Layout><Terms /></Layout>} />
            <Route path="/cookies" element={<Layout><Cookies /></Layout>} />
            <Route path="/medical" element={<Layout><MedicalDisclaimer /></Layout>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AssessmentProvider>
  );
}

export default App;