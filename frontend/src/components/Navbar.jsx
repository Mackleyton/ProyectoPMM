import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Smartphone,
  Upload,
  ShieldCheck,
  LogOut,
  Download,
  Monitor,
  Wifi,
  WifiOff,
  RotateCw,
  Search,
  Menu,
  X,
  FileText,
} from 'lucide-react';
import { offlineStorage } from '../services/offlineStorage';
import { apiService } from '../services/apiService';

export default function Navbar({
  user,
  onLogout,
  isMobileFrame,
  onToggleMobileFrame,
}) {
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
      // Ignorar error no crítico
    }
  };

  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sincronizar al recuperar conexión
      handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(updatePendingCount, 8000);

    // Detección PWA
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
        console.log(`[SYNC] ${res.synced} entregas sincronizadas con éxito.`);
      }
      await updatePendingCount();
    } catch (err) {
      console.warn('Error durante sincronización:', err);
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
        'Para instalar en iPhone o iPad:\n\n1. Pulsa el botón Compartir en Safari.\n2. Elige "Agregar a pantalla de inicio".'
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
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="navbar-brand" onClick={() => navTo(isAdmin ? '/admin/dashboard' : '/terreno')}>
          <div className="navbar-titles">
            <span className="brand-main">QUILPUÉ</span>
            <span className="brand-sub">BENEFICIOS DIDECO</span>
          </div>
        </div>

        {/* Indicador de Conexión y Estado Offline */}
        <div className={`connection-pill ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Conexión activa con el servidor' : 'Sin conexión a internet (Modo Offline activo)'}>
          {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{isOnline ? 'En línea' : 'Modo Offline'}</span>
        </div>

        {/* Notificación de Entregas en Cola */}
        {pendingCount > 0 && (
          <button
            type="button"
            className="pending-sync-badge-btn"
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            title={`${pendingCount} entregas guardadas en el dispositivo pendientes de subir`}
          >
            <RotateCw size={13} className={isSyncing ? 'spin-anim' : ''} />
            <span>{isSyncing ? 'Sincronizando…' : `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}`}</span>
          </button>
        )}
      </div>

      <nav className={`navbar-links ${menuOpen ? 'open' : ''}`}>
        {isAdmin ? (
          <>
            <button
              className={`nav-item-btn ${isActive('/admin/dashboard') ? 'active' : ''}`}
              onClick={() => navTo('/admin/dashboard')}
            >
              <LayoutDashboard size={17} />
              <span>Panel de Gestión</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/admin/beneficiarios') ? 'active' : ''}`}
              onClick={() => navTo('/admin/beneficiarios')}
            >
              <Users size={17} />
              <span>Beneficiarios</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/terreno') ? 'active' : ''}`}
              onClick={() => navTo('/terreno')}
            >
              <Smartphone size={17} />
              <span>Modo Terreno</span>
            </button>
            <button
              className={`nav-item-btn ${isActive('/admin/auditoria') ? 'active' : ''}`}
              onClick={() => navTo('/admin/auditoria')}
            >
              <ShieldCheck size={17} />
              <span>Auditoría</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`nav-item-btn ${isActive('/terreno') ? 'active' : ''}`}
              onClick={() => navTo('/terreno')}
            >
              <Search size={17} />
              <span>Consultar y Entregar</span>
            </button>
          </>
        )}
      </nav>

      <div className="navbar-right">
        {(canInstall || isIOS) && (
          <button
            type="button"
            className="btn btn-warning btn-sm btn-install-app"
            onClick={handleInstallClick}
            title="Instalar aplicación en este dispositivo"
          >
            <Download size={14} />
            <span>Instalar App</span>
          </button>
        )}

        {/* Toggle para alternar marco de teléfono en escritorio */}
        <button
          className={`device-toggle-btn ${isMobileFrame ? 'active' : ''}`}
          onClick={onToggleMobileFrame}
          title={isMobileFrame ? 'Cambiar a Vista Completa' : 'Simular Pantalla Móvil'}
        >
          {isMobileFrame ? <Monitor size={15} /> : <Smartphone size={15} />}
          <span>{isMobileFrame ? 'Vista Completa' : 'Simular Móvil'}</span>
        </button>

        <div className="user-profile-badge">
          <div className="user-meta">
            <span className="user-name">{user?.name || user?.username || 'Funcionario'}</span>
            <span className="user-role">{isAdmin ? 'Administrador' : 'Agente Terreno'}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Cerrar sesión">
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
