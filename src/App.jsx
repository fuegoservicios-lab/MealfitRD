import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Assessment from './pages/Assessment';
import Plan from './pages/Plan';
import Dashboard from './pages/Dashboard';
import ShoppingList from './pages/ShoppingList';
import Recipes from './pages/Recipes';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import { Privacy, Terms, Cookies, MedicalDisclaimer } from './pages/legal/LegalPages';
import { AssessmentProvider } from './context/AssessmentContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { Toaster } from 'sonner';

function App() {
  return (
    <AssessmentProvider>
      <Router>
        <Routes>
          {/* Public Routes: Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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
          <Route path="/dashboard/settings" element={
            <ProtectedRoute>
              <Settings />
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
      </Router>
    </AssessmentProvider>
  );
}

export default App;