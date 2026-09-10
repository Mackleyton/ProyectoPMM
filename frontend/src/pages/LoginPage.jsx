import { useState } from 'react';
import { apiService } from '../services/apiService';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function executeLogin(userToAuth, passToAuth) {
    setError('');
    setLoading(true);
    try {
      const data = await apiService.login(userToAuth, passToAuth);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor ingrese su usuario o correo institucional');
      return;
    }
    if (!password) {
      setError('Por favor ingrese su contraseña');
      return;
    }
    executeLogin(username.trim(), password);
  }

  function handleQuickLogin(role) {
    if (role === 'admin') {
      setUsername('admin');
      setPassword('Admin123!');
      executeLogin('admin', 'Admin123!');
    } else {
      setUsername('terreno');
      setPassword('Terreno123!');
      executeLogin('terreno', 'Terreno123!');
    }
  }

  return (
    <div className="login-wrapper">
      {/* Columna Izquierda (Desktop) con Ilustración de Quilpué */}
      <div className="login-side-illustration">
        <div className="illustration-container">
          <img
            src={`${import.meta.env.BASE_URL}assets/quilpue-iglesia.png`}
            alt="Ilustración Quilpué"
            className="illustration-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="illustration-text">
            <h2>Municipalidad de Quilpué</h2>
            <p>Plataforma de Gestión y Trazabilidad de Beneficios Sociales</p>
          </div>
        </div>
      </div>

      {/* Columna Derecha / Pantalla Móvil Completa */}
      <div className="login-form-side">
        <div className="login-card-content">
          {/* Logo y Encabezado Institucional */}
          <div className="login-brand-header">
            <img
              src={`${import.meta.env.BASE_URL}assets/logo-white-vert.png`}
              alt="Municipalidad de Quilpué"
              className="login-brand-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="brand-logo-text">
              <span className="brand-title">QUILPUÉ</span>
              <span className="brand-subtitle">MUNICIPALIDAD</span>
            </div>
            <div className="brand-dept-tag">Departamento Social</div>
          </div>

          {/* Formulario conectado directamente al Backend */}
          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error-msg">⚠️ {error}</div>}

            <div className="login-input-group">
              <label htmlFor="login-email">Usuario o Correo Institucional</label>
              <input
                id="login-email"
                type="text"
                placeholder="Ej: admin o terreno"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="login-input-group">
              <label htmlFor="login-pass">Contraseña</label>
              <input
                id="login-pass"
                type="password"
                placeholder="Ej: Admin123! o Terreno123!"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <span className="forgot-link" style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Credenciales oficiales verificadas por el backend
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-yellow login-submit-btn"
              disabled={loading}
            >
              {loading ? 'Validando credenciales…' : 'Ingresar'}
            </button>
          </form>

          {/* Botones de Acceso Rápido con credenciales oficiales */}
          <div className="quick-access-section">
            <span className="quick-access-title">Credenciales Oficiales del Backend</span>
            <div className="quick-btn-grid">
              <button
                type="button"
                className="quick-role-btn terreno"
                onClick={() => handleQuickLogin('terreno')}
                disabled={loading}
              >
                📱 Operador Terreno (<code>terreno</code> / <code>Terreno123!</code>)
              </button>
              <button
                type="button"
                className="quick-role-btn admin"
                onClick={() => handleQuickLogin('admin')}
                disabled={loading}
              >
                📊 Administrador (<code>admin</code> / <code>Admin123!</code>)
              </button>
            </div>
          </div>
        </div>

        {/* Silueta urbana inferior en vista móvil */}
        <div className="login-bottom-skyline" />
      </div>
    </div>
  );
}
