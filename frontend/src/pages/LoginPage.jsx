import { useState } from 'react';
import { apiService } from '../services/apiService';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Por favor ingresa tu usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiService.login(username.trim(), password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas o servidor no disponible.');
    } finally {
      setLoading(false);
    }
  }

  function handleQuick(userType) {
    if (userType === 'admin') {
      setUsername('admin');
      setPassword('Admin123!');
    } else {
      setUsername('terreno');
      setPassword('Terreno123!');
    }
    setError('');
  }

  return (
    <div className="login-wrapper">
      {/* Lado izquierdo institucional */}
      <div className="login-side-illustration">
        <div className="illustration-container">
          <img
            src={`${import.meta.env.BASE_URL}assets/quilpue-iglesia.png`}
            alt="Quilpué"
            className="illustration-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="illustration-text">
            <h2>Plataforma de Beneficios Sociales</h2>
            <p>Ilustre Municipalidad de Quilpué — Dirección de Desarrollo Comunitario (DIDECO)</p>
          </div>
        </div>
      </div>

      {/* Lado derecho: Formulario de Login */}
      <div className="login-form-side">
        <div className="login-card-content">
          <div className="login-brand-header">
            <img
              src={`${import.meta.env.BASE_URL}assets/logo-white-horiz.png`}
              alt="Municipalidad de Quilpué"
              className="login-brand-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="brand-title">QUILPUÉ</span>
            <span className="brand-subtitle">MUNICIPALIDAD</span>
            <span className="brand-dept-tag">DIDECO · BENEFICIOS SOCIALES</span>
          </div>

          {error && <div className="terreno-msg-error">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-input-group">
              <label htmlFor="login-username">Usuario o correo</label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                placeholder="Ej. admin o terreno"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="login-input-group">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-yellow login-submit-btn"
              disabled={loading}
            >
              {loading ? 'Iniciando sesión…' : 'Ingresar al Sistema'}
            </button>
          </form>

          <div className="quick-access-section">
            <span className="quick-access-title">Acceso rápido para funcionarios</span>
            <div className="quick-btn-grid">
              <button
                type="button"
                className="quick-role-btn"
                onClick={() => handleQuick('admin')}
                disabled={loading}
              >
                <strong>Administrador</strong> — Dashboard, Beneficiarios, Nóminas
              </button>
              <button
                type="button"
                className="quick-role-btn"
                onClick={() => handleQuick('terreno')}
                disabled={loading}
              >
                <strong>Operador Terreno</strong> — Búsqueda por RUT y Entregas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
