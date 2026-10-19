import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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

function MainLayout({ user, onLogout, isMobileFrame, onToggleMobileFrame }) {
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className={`app-root ${isMobileFrame ? 'simulated-mode' : ''}`}>
      <Navbar
        user={user}
        onLogout={onLogout}
        isMobileFrame={isMobileFrame}
        onToggleMobileFrame={onToggleMobileFrame}
      />

      <main className="app-main-viewport">
        {isMobileFrame ? (
          <div className="smartphone-simulator-wrapper">
            <div className="smartphone-frame">
              <div className="phone-notch">
                <span className="notch-speaker" />
                <span className="notch-camera" />
              </div>
              <div className="phone-screen-content">
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
              <div className="phone-home-indicator" />
            </div>
          </div>
        ) : (
          <div className="standard-view-wrapper">
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
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => apiService.getCurrentUser());
  const [isMobileFrame, setIsMobileFrame] = useState(false);

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
              <MainLayout
                user={user}
                onLogout={handleLogout}
                isMobileFrame={isMobileFrame}
                onToggleMobileFrame={() => setIsMobileFrame(!isMobileFrame)}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
