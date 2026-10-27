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
  UserPlus,
  Trash2,
  ShieldAlert,
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

  // Estados para Modal de Gestión de Usuarios
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create'
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'FIELD_AGENT' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState({ error: '', success: '' });
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);

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
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setCanInstall(true);
      });

      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
      if (isIosDevice) {
        setIsIOS(true);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      alert(
        'Para instalar en iPhone/iPad: Presiona el botón "Compartir" de Safari (cuadrado con flecha) y selecciona "Agregar a la pantalla de inicio".'
      );
    }
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const pendingDeliveries = await offlineStorage.getAllPendingDeliveries();
      for (const item of pendingDeliveries) {
        try {
          await apiService.registrarEntrega({
            rut: item.rut,
            benefitIds: item.benefitIds,
            actaFile: item.actaBlob,
            notes: item.notes || 'Entrega en terreno (Sincronizada)',
            latitude: item.latitude,
            longitude: item.longitude,
            captured_at: item.captured_at,
            sync_status: 'SYNCED',
            duration_seconds: item.duration_seconds || null,
          });
          await offlineStorage.deletePendingDelivery(item.id);
        } catch (err) {
          console.warn('Error sincronizando entrega:', err.message);
        }
      }
      await updatePendingCount();
    } finally {
      setIsSyncing(false);
    }
  };

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await apiService.obtenerUsuarios();
      setUsersList(data);
    } catch (err) {
      console.warn('Error cargando usuarios:', err.message);
    } finally {
      setUsersLoading(false);
    }
  }

  function handleOpenUserModal() {
    setShowUserModal(true);
    setActiveTab('list');
    setCreateMsg({ error: '', success: '' });
    loadUsers();
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateMsg({ error: '', success: '' });
    setCreateLoading(true);

    try {
      const res = await apiService.crearUsuario(formData);
      setCreateMsg({ success: res.message || 'Usuario creado con éxito', error: '' });
      setFormData({ firstName: '', lastName: '', email: '', password: '', role: 'FIELD_AGENT' });
      await loadUsers();
      setTimeout(() => {
        setActiveTab('list');
        setCreateMsg({ error: '', success: '' });
      }, 1200);
    } catch (err) {
      setCreateMsg({ error: err.message || 'Error al crear usuario', success: '' });
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeleteUser(userId, userIdentifier) {
    if (!window.confirm(`¿Estás seguro de eliminar al usuario "${userIdentifier}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setDeleteLoadingId(userId);
    try {
      await apiService.eliminarUsuario(userId);
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Error al eliminar usuario');
    } finally {
      setDeleteLoadingId(null);
    }
  }

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

      {/* Menú de Enlaces */}
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
        {/* BOTÓN GESTIONAR / AGREGAR USUARIOS (SOLO ADMIN) */}
        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenUserModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <UserPlus size={15} />
            <span className="hide-on-small">Agregar Usuario</span>
          </button>
        )}

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

      {/* MODAL GESTIÓN Y CREACIÓN DE USUARIOS */}
      {showUserModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '580px',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} color="#1a56db" />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  Gestión de Usuarios
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Pestañas: Lista de Usuarios / Agregar Usuario */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.2rem', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'list' ? '3px solid #1a56db' : '3px solid transparent',
                  color: activeTab === 'list' ? '#1a56db' : '#64748b',
                }}
              >
                Usuarios Registrados ({usersList.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('create');
                  setCreateMsg({ error: '', success: '' });
                }}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'create' ? '3px solid #1a56db' : '3px solid transparent',
                  color: activeTab === 'create' ? '#1a56db' : '#64748b',
                }}
              >
                + Agregar Usuario
              </button>
            </div>

            {createMsg.error && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ⚠️ {createMsg.error}
              </div>
            )}
            {createMsg.success && (
              <div style={{ background: '#dcfce7', color: '#166534', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ✅ {createMsg.success}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {activeTab === 'list' ? (
                <div>
                  {usersLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      <RotateCw className="spin" size={24} style={{ marginBottom: '0.5rem' }} />
                      <p style={{ margin: 0 }}>Cargando usuarios...</p>
                    </div>
                  ) : usersList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No hay usuarios para mostrar.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {usersList.map((u) => {
                        const isCurrent = user?.id && String(user.id) === String(u.id);
                        const isMainAdmin = u.username === 'admin';
                        const isDeletable = !isCurrent && !isMainAdmin;
                        const roleColor = u.role === 'ADMIN' ? '#7c3aed' : '#0284c7';
                        const roleBg = u.role === 'ADMIN' ? '#f5f3ff' : '#f0f9ff';

                        return (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.75rem 1rem',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              background: '#f8fafc',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{u.name || u.username}</strong>
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '9999px',
                                    background: roleBg,
                                    color: roleColor,
                                    border: `1px solid ${roleColor}33`,
                                  }}
                                >
                                  {u.role === 'ADMIN' ? 'Administrador' : 'Terreno'}
                                </span>
                                {isCurrent && (
                                  <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>
                                    (Tú)
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{u.username}</span>
                            </div>

                            <div>
                              {isDeletable ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  disabled={deleteLoadingId === u.id}
                                  title="Eliminar este usuario"
                                  style={{
                                    background: '#fee2e2',
                                    border: '1px solid #fca5a5',
                                    color: '#b91c1c',
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  <Trash2 size={14} />
                                  {deleteLoadingId === u.id ? 'Borrando...' : 'Eliminar'}
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                  {isMainAdmin ? 'Protegido' : 'En sesión'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Nombre</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Juan"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Apellido</label>
                      <input
                        type="text"
                        placeholder="Ej: Pérez"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Tipo de Usuario (Rol)</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', background: '#fff' }}
                    >
                      <option value="FIELD_AGENT">Operador de Terreno (Registro de entregas y consulta)</option>
                      <option value="ADMIN">Administrador (Acceso total, reportes, carga de planillas y gestión)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Correo Electrónico (será su nombre de usuario)</label>
                    <input
                      type="email"
                      required
                      placeholder="usuario@quilpue.cl"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Contraseña de Acceso</label>
                    <input
                      type="password"
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActiveTab('list')}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Ver Usuarios
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={createLoading}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      {createLoading ? 'Creando...' : (formData.role === 'ADMIN' ? 'Crear Administrador' : 'Crear Operador')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}