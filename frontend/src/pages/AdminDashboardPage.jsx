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
  Timer,
  Zap,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import DonutChart from '../components/DonutChart';
import BarChart from '../components/BarChart';

// Formateador de tiempo legible (ej: 145 segundos -> 2m 25s)
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Sin registros';
  if (seconds < 60) return `${seconds} seg`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return remSec > 0 ? `${mins}m ${remSec}s` : `${mins} min`;
}

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

  // 1. 5 NIVELES OFICIALES DE LA TABLA MUNICIPAL (Declarado primero)
  const stockLevels = kpis?.stockPorNivel ?? [
    { nivel: 'PRE BÁSICA', licitacion: 800, inicial: 490, entregadas: 0, saldo: 490, pct: 0 },
    { nivel: 'BÁSICA PRIMER CICLO (1° A 4° BÁSICO)', licitacion: 1700, inicial: 1443, entregadas: 0, saldo: 1443, pct: 0 },
    { nivel: 'BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)', licitacion: 1700, inicial: 1569, entregadas: 0, saldo: 1569, pct: 0 },
    { nivel: 'MEDIA', licitacion: 1500, inicial: 1124, entregadas: 0, saldo: 1124, pct: 0 },
    { nivel: 'SUPERIOR', licitacion: 700, inicial: 419, entregadas: 0, saldo: 419, pct: 0 },
  ];

  const totalLicitacion = stockLevels.reduce((acc, row) => acc + (row.licitacion || 0), 0);
  const totalInicial = stockLevels.reduce((acc, row) => acc + (row.inicial || 0), 0);
  const totalEntregadas = stockLevels.reduce((acc, row) => acc + (row.entregadas || 0), 0);
  const totalSaldo = stockLevels.reduce((acc, row) => acc + (row.saldo || 0), 0);
  const pctGlobal = totalInicial > 0 ? Math.round((totalEntregadas / totalInicial) * 100) : 0;

  // DATOS REALES DE LOS ALUMNOS CARGADOS POR EXCEL
  const total = kpis?.totalBeneficiariosAprobados ?? (kpis?.totalRegistros ?? 0);
  const entregados = kpis?.entregadosConActa ?? (kpis?.totalEntregados ?? 0);
  // Pendientes de retiro reales del Excel
  const pendientes = kpis?.pendientesDeRetiro ?? Math.max(0, total - entregados);
  const avance = total > 0 ? Math.round((entregados / total) * 100) : 0;
  const avgTime = kpis?.tiempoPromedioSegundos ?? 0;
  // Gráfico Donut (Estado de Cumplimiento General):
  // Se calcula SOLO con los alumnos del Excel (ej: 1 Entregado vs 4 Pendientes = Total 5)
  const donutData = [
    { label: 'Entregados con Acta', value: entregados, color: '#16a34a' },
    { label: 'Pendientes de Retiro', value: pendientes, color: '#2563eb' },
  ];
  // Gráfico por sector
  const barSectorData =
    kpis?.distribucionSectores && kpis.distribucionSectores.length > 0
      ? kpis.distribucionSectores.map((s, idx) => ({
          label: s.sector,
          value: s.cantidad ?? s.deliveries ?? 0,
          color: ['#2563eb', '#7c3aed', '#ea580c', '#eab308', '#06b6d4', '#10b981'][idx % 6],
        }))
      : [];
  // Gráfico de Distribución por Nivel Educativo:
  // Muestra ÚNICAMENTE la cantidad de beneficiarios pendientes cargados por el Excel
  const barNivelData =
    kpis?.distribucionNivel && kpis.distribucionNivel.length > 0
      ? kpis.distribucionNivel.map((n, idx) => ({
          label: n.nivel,
          value: n.cantidad ?? 0, // <-- Alumnos pendientes reales del Excel
          color: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'][idx % 5],
        }))
      : [];

  // Flujo horario
  const flujoHoras = kpis?.flujoPorHora ?? [
    { rango: '08:00 - 11:00', cantidad: 0 },
    { rango: '11:00 - 14:00', cantidad: 0 },
    { rango: '14:00 - 17:00', cantidad: 0 },
    { rango: '17:00+', cantidad: 0 },
  ];

  const maxFlujo = Math.max(...flujoHoras.map((f) => f.cantidad || 0), 0);
  const totalActasHorarias = flujoHoras.reduce((acc, f) => acc + (f.cantidad || 0), 0);

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

      {/* TARJETAS KPIS SUPERIORES (5 INDICADORES) */}
      <div className="kpi-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="kpi-stat-card border-blue" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #2563eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontWeight: 600 }}>
            <Users size={18} />
            <span className="kpi-card-label">Beneficiarios Aprobados</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{total.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Meta comunal aprobada</span>
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
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Saldo total por entregar</span>
        </div>

        <div className="kpi-stat-card border-purple" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #9333ea', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b21a8', fontWeight: 600 }}>
            <TrendingUp size={18} />
            <span className="kpi-card-label">Avance Global</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#9333ea', margin: '0.5rem 0 0.25rem' }}>{avance}%</div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>Cumplimiento total comunal</span>
        </div>

        <div className="kpi-stat-card border-cyan" style={{ background: '#fff', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #0891b2', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="kpi-icon-line" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0e7490', fontWeight: 600 }}>
            <Timer size={18} />
            <span className="kpi-card-label">Tiempo Atención</span>
          </div>
          <div className="kpi-card-value" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0891b2', margin: '0.5rem 0 0.25rem' }}>
            {formatDuration(avgTime)}
          </div>
          <span className="kpi-card-desc" style={{ color: '#64748b', fontSize: '0.8rem' }}>RUT a confirmación en terreno</span>
        </div>
      </div>

      {/* TABLA CONTROL LOGÍSTICO MUNICIPAL */}
      <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PackageCheck size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Total de Beneficiarios por Nivel Educacional — Control de Stock</h3>
          </div>
          <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 500 }}>
            Descuento automático por acta
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '0.75rem' }}>Nivel Educacional</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Pedido Licitación</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Aprobadas (Stock Inicial)</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a' }}>Entregadas con Acta</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Saldo Restante</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>% Avance</th>
              </tr>
            </thead>
            <tbody>
              {stockLevels.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{row.nivel}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b' }}>{(row.licitacion || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{(row.inicial || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{(row.entregadas || 0).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: (row.saldo || 0) === 0 ? '#16a34a' : '#0f172a' }}>
                    {(row.saldo || 0).toLocaleString('es-CL')}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: (row.pct || 0) >= 100 ? '#dcfce7' : '#f1f5f9',
                      color: (row.pct || 0) >= 100 ? '#15803d' : '#334155',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                    }}>
                      {row.pct || 0}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                <td style={{ padding: '0.75rem' }}>TOTAL CONSOLIDADO</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b' }}>{totalLicitacion.toLocaleString('es-CL')}</td>
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

      {/* GRÁFICOS INFERIORES: NIVEL EDUCATIVO (PENDIENTES) Y FLUJO HORARIO */}
      <div className="charts-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={18} color="#8b5cf6" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Distribución por Nivel Educativo</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
              Pendientes de Retiro
            </span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barNivelData} emptyMessage="Sin alumnos pendientes por nivel educativo" />
          </div>
        </div>

        {/* FLUJO DE ENTREGAS POR PERÍODO HORARIO */}
        <div className="chart-panel-card" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div className="panel-title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#ea580c" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Flujo de Entregas por Período Horario</h3>
            </div>
            <span className="chart-panel-badge" style={{ fontSize: '0.75rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 500 }}>
              {totalActasHorarias} actas registradas
            </span>
          </div>

          <div className="chart-panel-content">
            {totalActasHorarias === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                Sin actas registradas para analizar franjas horarias
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {flujoHoras.map((f, idx) => {
                  const pct = maxFlujo > 0 ? Math.round((f.cantidad / maxFlujo) * 100) : 0;
                  const isPeak = maxFlujo > 0 && f.cantidad === maxFlujo && f.cantidad > 0;

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#334155' }}>
                          <span>{f.rango}</span>
                          {isPeak && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', background: '#fee2e2', color: '#b91c1c', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                              <Zap size={10} /> Pico de afluencia
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {f.cantidad} {f.cantidad === 1 ? 'acta' : 'actas'}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '10px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: isPeak ? 'linear-gradient(90deg, #f97316, #ea580c)' : '#3b82f6',
                            borderRadius: '999px',
                            transition: 'width 0.4s ease-in-out',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}