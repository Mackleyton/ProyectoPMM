import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Smartphone,
  ShieldCheck,
  LogOut,
  Download,
  Wifi,
  WifiOff,
  RotateCw,
  Search,
  Menu,
  X,
} from 'lucide-react';
import { offlineStorage } from '../services/offlineStorage';
import { apiService } from '../services/apiService';

export default function Navbar({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const updatePendingCount = async () => {
    try {
      const count = await offlineStorage.countPendingDeliveries();
      setPendingCount(count);
    } catch {
      // Ignorar
    }
  };

  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(updatePendingCount, 8000);

    // Detección PWA instalable
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (!isStandalone) {
      const ua = window.navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua) && !window.MSStream) {
        setIsIOS(true);
      }

      const handleBeforeInstall = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setCanInstall(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        clearInterval(interval);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const res = await offlineStorage.syncAllPending(apiService);
      if (res.synced > 0) {
        console.log(`[SYNC] ${res.synced} entregas sincronizadas.`);
      }
      await updatePendingCount();
    } catch (err) {
      console.warn('Error sincronizando:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      alert(
        'Para instalar en tu iPhone o iPad:\n\n1. Pulsa el botón Compartir en Safari.\n2. Elige "Agregar a pantalla de inicio".'
      );
    }
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'admin';

  const navTo = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="main-navbar">
      <div className="navbar-left">
        <button
          className="menu-toggle-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menú"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className="navbar-brand" onClick={() => navTo(isAdmin ? '/admin/dashboard' : '/terreno')}>
          <div className="navbar-titles">
            <span className="brand-main">QUILPUÉ</span>
            <span className="brand-sub">BENEFICIOS SOCIALES</span>
          </div>
        </div>

        {/* Indicador de Conexión en Móvil */}
        <div
          className={`connection-pill ${isOnline ? 'online' : 'offline'}`}
          title={isOnline ? 'En línea' : 'Sin conexión'}
        >
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="hide-on-very-small">{isOnline ? 'En línea' : 'Offline'}</span>
        </div>

        {/* Notificación de Entregas Pendientes */}
        {pendingCount > 0 && (
          <button
            type="button"
            className="pending-sync-badge-btn"
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            title={`${pendingCount} entregas pendientes`}
          >
            <RotateCw size={12} className={isSyncing ? 'spin-anim' : ''} />
            <span>{isSyncing ? 'Subiendo…' : `${pendingCount}`}</span>
          </button>
        )}
      </div>

      {/* Menú de Enlaces (en móvil se despliega como menú vertical completo) */}
      <nav className={`navbar-links ${menuOpen ? 'open' : ''}`}>
        {isAdmin ? (
          <>
            <button
              className={`nav-item-btn ${isActive('/admin/dashboard') ? 'active' : ''}`}
              onClick={() => navTo('/admin/dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Panel de Gestión</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/admin/beneficiarios') ? 'active' : ''}`}
              onClick={() => navTo('/admin/beneficiarios')}
            >
              <Users size={18} />
              <span>Beneficiarios</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/terreno') ? 'active' : ''}`}
              onClick={() => navTo('/terreno')}
            >
              <Smartphone size={18} />
              <span>Modo Terreno</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/admin/auditoria') ? 'active' : ''}`}
              onClick={() => navTo('/admin/auditoria')}
            >
              <ShieldCheck size={18} />
              <span>Auditoría</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`nav-item-btn ${isActive('/terreno') ? 'active' : ''}`}
              onClick={() => navTo('/terreno')}
            >
              <Search size={18} />
              <span>Consultar y Entregar</span>
            </button>
          </>
        )}

        {/* Botón de salir en el menú móvil */}
        <button
          className="nav-item-btn logout-mobile-link"
          onClick={() => {
            setMenuOpen(false);
            onLogout();
          }}
        >
          <LogOut size={18} />
          <span>Cerrar Sesión</span>
        </button>
      </nav>

      <div className="navbar-right">
        {(canInstall || isIOS) && (
          <button
            type="button"
            className="btn btn-warning btn-sm btn-install-app"
            onClick={handleInstallClick}
            title="Instalar App en tu celular"
          >
            <Download size={14} />
            <span className="hide-on-small">Instalar</span>
          </button>
        )}

        <div className="user-profile-badge">
          <div className="user-meta hide-on-small">
            <span className="user-name">{user?.name || user?.username || 'Funcionario'}</span>
            <span className="user-role">{isAdmin ? 'Admin' : 'Terreno'}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
