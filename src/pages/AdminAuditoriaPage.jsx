import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  MapPin,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  LogIn,
} from 'lucide-react';
import { apiService } from '../services/apiService';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return remSec > 0 ? `${mins}m ${remSec}s` : `${mins} min`;
}

function actionBadge(action) {
  switch (action) {
    case 'AUTH_LOGIN_SUCCESS':
      return { label: 'Inicio de Sesión', color: 'green', icon: LogIn };
    case 'AUTH_LOGIN_FAILED':
      return { label: 'Acceso Denegado', color: 'red', icon: AlertTriangle };
    case 'DELIVERY_REGISTER':
      return { label: 'Entrega Registrada', color: 'blue', icon: CheckCircle2 };
    case 'IMPORT_EXCEL_REPLACE':
      return { label: 'Reemplazo Nómina', color: 'red', icon: FileSpreadsheet };
    case 'IMPORT_EXCEL_UPDATE':
      return { label: 'Actualización Nómina', color: 'yellow', icon: FileSpreadsheet };
    case 'DATABASE_RESET':
      return { label: 'Reset de Base de Datos', color: 'red', icon: AlertTriangle };
    default:
      return { label: action, color: 'gray', icon: ShieldCheck };
  }
}

export default function AdminAuditoriaPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroAccion, setFiltroAccion] = useState('');
  const [search, setSearch] = useState('');

  async function cargarLogs() {
    setLoading(true);
    try {
      const data = await apiService.obtenerAuditLogs({ action: filtroAccion, limit: 150 });
      setLogs(data);
    } catch (err) {
      console.error('Error cargando logs de auditoría:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarLogs();
  }, [filtroAccion]);

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (l.username && l.username.toLowerCase().includes(term)) ||
      (l.action && l.action.toLowerCase().includes(term)) ||
      (l.ip_address && l.ip_address.includes(term)) ||
      (l.details && JSON.stringify(l.details).toLowerCase().includes(term))
    );
  });

  return (
    <div className="admin-auditoria-container">
      <div className="auditoria-header-row">
        <div>
          <div className="section-title-with-icon">
            <ShieldCheck size={24} />
            <h2 className="section-title-large">Bitácora de Auditoría del Sistema</h2>
          </div>
          <p className="dashboard-subtitle">
            Registro cronológico inmutable de accesos, entregas físicas en terreno y cargas de nóminas.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={cargarLogs}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          <span>{loading ? 'Actualizando…' : 'Actualizar Bitácora'}</span>
        </button>
      </div>

      {/* FILTROS */}
      <div className="auditoria-filters-bar">
        <div className="search-box-pill" style={{ maxWidth: '320px' }}>
          <input
            type="text"
            placeholder="Buscar por usuario o IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search size={16} className="pill-search-icon" />
        </div>

        <div className="filter-select-wrapper">
          <Filter size={15} />
          <select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value)}
            className="filter-select"
          >
            <option value="">Todas las Acciones</option>
            <option value="DELIVERY_REGISTER">Entregas en Terreno</option>
            <option value="AUTH_LOGIN_SUCCESS">Inicios de Sesión</option>
            <option value="AUTH_LOGIN_FAILED">Intentos Fallidos</option>
            <option value="IMPORT_EXCEL_REPLACE">Reemplazo de Nómina</option>
            <option value="IMPORT_EXCEL_UPDATE">Actualización de Nómina</option>
          </select>
        </div>
      </div>

      {/* TABLA DE AUDITORÍA */}
      <div className="admin-table-card">
        {loading ? (
          <div className="table-loading-state">
            <RefreshCw size={24} className="spin-anim" />
            <span>Cargando eventos de auditoría…</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="table-empty-state">
            <ShieldCheck size={36} className="empty-icon" />
            <p>No se registran eventos de auditoría con los filtros aplicados.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Acción</th>
                  <th>Usuario</th>
                  <th>Tiempo de Atención</th>
                  <th>Detalles Técnicos</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const badge = actionBadge(log.action);
                  const Icon = badge.icon;
                  const dateStr = log.created_at
                    ? new Date(log.created_at).toLocaleString('es-CL')
                    : '—';

                  return (
                    <tr key={log.id}>
                      <td className="cell-time">
                        <Clock size={14} />
                        <span>{dateStr}</span>
                      </td>
                      <td>
                        <span className={`status-badge-clean ${badge.color}`}>
                          <Icon size={14} />
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td>
                        <div className="cell-user">
                          <User size={14} />
                          <span>{log.username || 'Sistema'}</span>
                        </div>
                      </td>
                      <td className="cell-secondary-text">
  {log.action === 'DELIVERY_REGISTER' && log.details?.durationSeconds ? (
    <span style={{ fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
      ⏱️ {formatDuration(log.details.durationSeconds)}
    </span>
  ) : (
    <span style={{ color: '#94a3b8' }}>—</span>
  )}
</td>
                      <td>
                        <div className="audit-details-cell">
                          {log.details ? (
                            <>
                              {log.details.guardianRut && (
                                <span className="meta-tag">RUT: {log.details.guardianRut}</span>
                              )}
                              {log.details.latitude && (
                                <span className="meta-tag geo">
                                  <MapPin size={11} /> {log.details.latitude.toFixed(4)}, {log.details.longitude.toFixed(4)}
                                </span>
                              )}
                              {log.details.fileName && (
                                <span className="meta-tag">{log.details.fileName} ({log.details.importedRows} filas)</span>
                              )}
                              {log.details.mode && (
                                <span className="meta-tag">{log.details.mode}</span>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
