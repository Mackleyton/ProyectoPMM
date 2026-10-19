import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import TerrenoView from './pages/TerrenoView';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminBeneficiariosPage from './pages/AdminBeneficiariosPage';
import AdminAuditoriaPage from './pages/AdminAuditoriaPage';
import { apiService } from './services/apiService';

function ProtectedRoute({ user, requiredRole, children }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole && user.role !== 'ADMIN') {
    return <Navigate to="/terreno" replace />;
  }

  return children;
}

function MainLayout({ user, onLogout }) {
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="app-root">
      <Navbar user={user} onLogout={onLogout} />

      <main className="app-main-viewport">
        <div className="mobile-native-viewport">
          <Routes>
            <Route
              path="/terreno"
              element={
                <ProtectedRoute user={user}>
                  <TerrenoView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute user={user} requiredRole="ADMIN">
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/beneficiarios"
              element={
                <ProtectedRoute user={user} requiredRole="ADMIN">
                  <AdminBeneficiariosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/auditoria"
              element={
                <ProtectedRoute user={user} requiredRole="ADMIN">
                  <AdminAuditoriaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="*"
              element={<Navigate to={isAdmin ? '/admin/dashboard' : '/terreno'} replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => apiService.getCurrentUser());

  function handleLogin(loggedUser) {
    setUser(loggedUser);
  }

  function handleLogout() {
    apiService.logout();
    setUser(null);
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/terreno'} replace />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/*"
          element={
            user ? (
              <MainLayout user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
