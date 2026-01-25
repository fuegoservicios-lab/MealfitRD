import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Assessment from './pages/Assessment';
import Plan from './pages/Plan';
import Dashboard from './pages/Dashboard'; // Importamos el Dashboard
import ShoppingList from './pages/ShoppingList';
import Recipes from './pages/Recipes';
import Settings from './pages/Settings';
import { Privacy, Terms, Cookies, MedicalDisclaimer } from './pages/legal/LegalPages';
import { AssessmentProvider } from './context/AssessmentContext';

function App() {
  return (
    <AssessmentProvider>
      <Router>
        <Routes>
          {/* Ruta Pública: Landing Page */}
          <Route path="/" element={<Layout><Home /></Layout>} />

          {/* Ruta del Formulario (Layout propio interno) */}
          <Route path="/assessment" element={<Assessment />} />

          {/* Ruta de Generación del Plan (Layout público) */}
          <Route path="/plan" element={<Layout><Plan /></Layout>} />

          {/* Ruta Privada: Dashboard (Layout propio interno) */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/shopping" element={<ShoppingList />} />
          <Route path="/dashboard/recipes" element={<Recipes />} />
          <Route path="/dashboard/settings" element={<Settings />} />

          {/* Rutas Legales */}
          <Route path="/privacy" element={<Layout><Privacy /></Layout>} />
          <Route path="/terms" element={<Layout><Terms /></Layout>} />
          <Route path="/cookies" element={<Layout><Cookies /></Layout>} />
          <Route path="/medical" element={<Layout><MedicalDisclaimer /></Layout>} />
        </Routes>
      </Router>
    </AssessmentProvider>
  );
}

export default App;