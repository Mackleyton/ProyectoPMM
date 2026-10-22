import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileDown,
  RefreshCw,
  Users,
  CheckCircle2,
  Clock,
  PieChart,
  BarChart3,
  TrendingUp,
  PackageCheck,
  Award,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import DonutChart from '../components/DonutChart';
import BarChart from '../components/BarChart';

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  async function cargarKpis() {
    setLoading(true);
    try {
      const data = await apiService.obtenerKpis();
      setKpis(data);
    } catch (err) {
      console.error('Error cargando KPIs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarKpis();
  }, []);

  const total = kpis?.totalBeneficiariosAprobados ?? (kpis?.totalRegistros ?? 0);
  const entregados = kpis?.entregadosConActa ?? (kpis?.totalEntregados ?? 0);
  const pendientes = kpis?.pendientesDeRetiro ?? Math.max(0, total - entregados);
  const avance = total > 0 ? Math.round((entregados / total) * 100) : 0;

  const donutData = [
    { label: 'Entregados con Acta', value: entregados, color: '#16a34a' },
    { label: 'Pendientes de Retiro', value: pendientes, color: '#2563eb' },
  ];

  const barSectorData =
    kpis?.distribucionSectores && kpis.distribucionSectores.length > 0
      ? kpis.distribucionSectores.map((s, idx) => ({
          label: s.sector,
          value: s.cantidad,
          color: ['#2563eb', '#7c3aed', '#ea580c', '#eab308', '#06b6d4', '#10b981'][idx % 6],
        }))
      : (kpis?.deliveriesBySector && kpis.deliveriesBySector.length > 0
          ? kpis.deliveriesBySector.map((s, idx) => ({
              label: s.sector,
              value: s.deliveries,
              color: ['#2563eb', '#7c3aed', '#ea580c', '#eab308', '#06b6d4', '#10b981'][idx % 6],
            }))
          : []);

  const barNivelData =
    kpis?.distribucionNivel && kpis.distribucionNivel.length > 0
      ? kpis.distribucionNivel.map((n, idx) => ({
          label: n.nivel,
          value: n.cantidad,
          color: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][idx % 4],
        }))
      : [];

  const stockLevels = kpis?.stockPorNivel ?? [
    { nivel: 'Pre-Básica (Pre-Kinder y Kinder)', inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
    { nivel: 'Básica Primer Ciclo (1° a 4° Básico)', inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
    { nivel: 'Básica Segundo Ciclo (5° a 8° Básico)', inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
    { nivel: 'Media (1° a 4° Medio)', inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
  ];

  const totalInicial = stockLevels.reduce((acc, row) => acc + (row.inicial || 0), 0);
  const totalEntregadas = stockLevels.reduce((acc, row) => acc + (row.entregadas || 0), 0);
  const totalSaldo = stockLevels.reduce((acc, row) => acc + (row.saldo || 0), 0);
  const pctGlobal = totalInicial > 0 ? Math.round((totalEntregadas / totalInicial) * 100) : 0;

  const flujoHoras = kpis?.flujoPorHora ?? [
    { rango: '08:00 - 11:00', cantidad: 0 },
    { rango: '11:00 - 14:00', cantidad: 0 },
    { rango: '14:00 - 17:00', cantidad: 0 },
    { rango: '17:00+', cantidad: 0 },
  ];

  return (
    <div className="admin-dashboard-container" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="dashboard-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="section-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LayoutDashboard size={24} color="#1d4ed8" />
            <h2 className="dashboard-main-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Panel de Gestión y Trazabilidad Municipal</h2>
          </div>
          <p className="dashboard-subtitle" style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Control logístico, entrega con acta de respaldo y distribución territorial — Municipalidad de Quilpué
          </p>
        </div>
        <div className="dashboard-actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => apiService.exportarTransparenciaCSV?.()}
            title="Descargar reporte según Ley 21.180"
          >
            <FileDown size={15} />
            <span>Exportar Ley de Transparencia</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={cargarKpis}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
            <span>{loading ? 'Actualizando…' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* TARJETAS KPIS */}
      <div className="kpi-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="kpi-stat-card border-blue" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #2563eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontWeight: 600 }}>
            <Users size={18} />
            <span className="kpi-card-label">Beneficiarios Aprobados</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{total.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Estado APROBADA en padrón</span>
        </div>

        <div className="kpi-stat-card border-green" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 600 }}>
            <CheckCircle2 size={18} />
            <span className="kpi-card-label">Entregados con Acta</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a', margin: '0.5rem 0 0.25rem' }}>{entregados.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Con respaldo fotográfico</span>
        </div>

        <div className="kpi-stat-card border-orange" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ea580c', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9a3412', fontWeight: 600 }}>
            <Clock size={18} />
            <span className="kpi-card-label">Pendientes de Retiro</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ea580c', margin: '0.5rem 0 0.25rem' }}>{pendientes.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Aprobadas por retirar</span>
        </div>

        <div className="kpi-stat-card border-purple" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #9333ea', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b21a8', fontWeight: 600 }}>
            <TrendingUp size={18} />
            <span className="kpi-card-label">Avance Global</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#9333ea', margin: '0.5rem 0 0.25rem' }}>{avance}%</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Cumplimiento total comunal</span>
        </div>
      </div>

      {/* TABLA CONTROL LOGÍSTICO MUNICIPAL */}
      <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PackageCheck size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Control Logístico Municipal — Estado del Stock por Nivel</h3>
          </div>
          <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 500 }}>
            Descuento automático al subir acta
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '0.75rem' }}>Nivel Educacional</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Stock Inicial (Aprobadas)</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Entregadas con Acta</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Saldo Restante</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>% Avance</th>
              </tr>
            </thead>
            <tbody>
              {stockLevels.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 500 }}>{row.nivel}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>{(row.inicial || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{(row.entregadas || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{(row.saldo || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: (row.pct || 0) >= 100 ? '#dcfce7' : '#f1f5f9',
                      color: (row.pct || 0) >= 100 ? '#15803d' : '#334155',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                    }}>
                      {row.pct || 0}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                <td style={{ padding: '0.75rem' }}>TOTAL CONSOLIDADO</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalInicial.toLocaleString('es-CL')}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a' }}>{totalEntregadas.toLocaleString('es-CL')}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalSaldo.toLocaleString('es-CL')}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{pctGlobal}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* GRÁFICOS: SECTORES Y ESTADO GENERAL */}
      <div className="charts-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} color="#2563eb" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Distribución por Sector</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Alumnos Aprobados</span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barSectorData} emptyMessage="Sin registros aprobados para mostrar sectores" />
          </div>
        </div>

        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PieChart size={18} color="#16a34a" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Estado de Cumplimiento General</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Actas vs Pendientes</span>
          </div>
          <div className="chart-panel-content">
            <DonutChart data={donutData} emptyMessage="Sin entregas registradas" />
          </div>
        </div>
      </div>

      {/* GRÁFICOS INFERIORES: NIVEL Y HORARIOS */}
      <div className="charts-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={18} color="#8b5cf6" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Distribución por Nivel Educativo</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Alumnos Aprobados</span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barNivelData} emptyMessage="Sin registros aprobados por nivel educativo" />
          </div>
        </div>

        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#ea580c" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Flujo de Entregas por Período Horario</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Metadata de Actas</span>
          </div>
          <div className="chart-panel-content">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {flujoHoras.map((f, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{f.rango}</span>
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{f.cantidad} actas</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
