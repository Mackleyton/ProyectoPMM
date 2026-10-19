import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileDown,
  RefreshCw,
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  PieChart,
  BarChart3,
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

  const total = kpis?.totalRegistros ?? 0;
  const entregados = kpis?.totalEntregados ?? 0;
  const pendientes = kpis?.totalPendientes ?? 0;
  const entregadosHoy = kpis?.entregadosHoy ?? 0;
  const avance = total > 0 ? Math.round((entregados / total) * 100) : 0;

  const donutData = [
    { label: 'Entregados', value: entregados, color: '#16a34a' },
    { label: 'Pendientes', value: pendientes, color: '#2563eb' },
  ];

  const barData =
    kpis?.deliveriesBySector && kpis.deliveriesBySector.length > 0
      ? kpis.deliveriesBySector.map((s, idx) => ({
          label: s.sector,
          value: s.deliveries,
          color: ['#2563eb', '#7c3aed', '#ea580c', '#eab308', '#06b6d4'][idx % 5],
        }))
      : [
          { label: 'Belloto Norte', value: 320, color: '#2563eb' },
          { label: 'Belloto Sur', value: 410, color: '#7c3aed' },
          { label: 'Quilpué Centro', value: 560, color: '#ea580c' },
          { label: 'Canal Chacao', value: 230, color: '#eab308' },
          { label: 'Pompeya', value: 180, color: '#06b6d4' },
        ];

  return (
    <div className="admin-dashboard-container">
      <div className="dashboard-header-row">
        <div>
          <div className="section-title-with-icon">
            <LayoutDashboard size={24} />
            <h2 className="dashboard-main-title">Panel de Gestión y Trazabilidad</h2>
          </div>
          <p className="dashboard-subtitle">
            Monitoreo en tiempo real de la entrega de beneficios escolares — Municipalidad de Quilpué
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => apiService.exportarTransparenciaCSV()}
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
      <div className="kpi-cards-grid">
        <div className="kpi-stat-card border-gray">
          <div className="kpi-icon-line">
            <Users size={18} />
            <span className="kpi-card-label">Total de beneficios</span>
          </div>
          <div className="kpi-card-value">{total.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Padrón total asignado</span>
        </div>

        <div className="kpi-stat-card border-yellow">
          <div className="kpi-icon-line text-yellow">
            <CheckCircle2 size={18} />
            <span className="kpi-card-label">Entregados</span>
          </div>
          <div className="kpi-card-value text-yellow">{entregados.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">{avance}% de avance global</span>
        </div>

        <div className="kpi-stat-card border-blue">
          <div className="kpi-icon-line text-blue">
            <Clock size={18} />
            <span className="kpi-card-label">Pendientes</span>
          </div>
          <div className="kpi-card-value text-blue">{pendientes.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Por retirar en centros</span>
        </div>

        <div className="kpi-stat-card border-gray">
          <div className="kpi-icon-line">
            <Calendar size={18} />
            <span className="kpi-card-label">Entregados hoy</span>
          </div>
          <div className="kpi-card-value">{entregadosHoy.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Jornada actual en terreno</span>
        </div>
      </div>

      {/* GRÁFICOS */}
      <div className="charts-grid-two">
        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <div className="panel-title-with-icon">
              <BarChart3 size={18} />
              <h3>Distribución Territorial</h3>
            </div>
            <span className="chart-panel-badge">Por sector comarcal</span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barData} />
          </div>
        </div>

        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <div className="panel-title-with-icon">
              <PieChart size={18} />
              <h3>Estado de Cumplimiento</h3>
            </div>
            <span className="chart-panel-badge">Consolidado general</span>
          </div>
          <div className="chart-panel-content">
            <DonutChart data={donutData} />
          </div>
        </div>
      </div>
    </div>
  );
}
