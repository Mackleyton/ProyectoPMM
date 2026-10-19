import { useState, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  Upload,
  RefreshCw,
  Trash2,
  PlusCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  X,
  FileCheck,
  Eye,
  MapPin,
  Calendar,
} from 'lucide-react';
import { apiService } from '../services/apiService';

export default function AdminBeneficiariosPage() {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  // Modal de importación con los dos modos solicitados
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState('update'); // 'update' | 'replace'
  const [selectedFile, setSelectedFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const fileInputRef = useRef(null);

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiService.obtenerBeneficiarios({
        search,
        estado: filtroEstado,
      });
      setBeneficiarios(data);
    } catch (err) {
      console.error('Error al cargar beneficiarios:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [filtroEstado]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    cargar();
  }

  function openImportModal(mode) {
    setImportMode(mode);
    setSelectedFile(null);
    setImportResult(null);
    setImportError('');
    setImportModalOpen(true);
  }

  function handleFileSelected(e) {
    const file = e.target.files[0];
    if (file) {
      if (!/\.xlsx?$/i.test(file.name)) {
        setImportError('Solo se admiten archivos de planilla Excel (.xlsx o .xls)');
        return;
      }
      setSelectedFile(file);
      setImportError('');
      setImportResult(null);
    }
  }

  async function ejecutarImportacion() {
    if (!selectedFile || importLoading) return;
    setImportLoading(true);
    setImportError('');
    setImportResult(null);

    try {
      const res = await apiService.subirPlanillaExcel(selectedFile, importMode);
      setImportResult(res);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await cargar();
    } catch (err) {
      setImportError(err.message || 'Error al procesar la planilla');
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="admin-beneficiarios-container">
      {!selectedItem ? (
        <>
          {/* BARRA SUPERIOR CON LOS DOS BOTONES REQUERIDOS */}
          <div className="beneficiarios-top-bar">
            <div className="top-bar-left">
              <div className="section-title-with-icon">
                <Users size={24} />
                <h2 className="section-title-large">Padrón de Beneficiarios</h2>
              </div>
              <div className="import-action-buttons">
                {/* Botón 1: Reemplazo total */}
                <button
                  type="button"
                  className="btn btn-danger-outline btn-sm"
                  onClick={() => openImportModal('replace')}
                  title="Elimina el contenido actual y monta una planilla nueva desde cero"
                >
                  <Trash2 size={16} />
                  <span>Eliminar y Subir Nueva Nómina</span>
                </button>

                {/* Botón 2: Actualización incremental */}
                <button
                  type="button"
                  className="btn btn-yellow btn-sm"
                  onClick={() => openImportModal('update')}
                  title="Agrega nuevos registros o actualiza los existentes conservando entregas"
                >
                  <PlusCircle size={16} />
                  <span>Actualizar / Sumar Nómina</span>
                </button>
              </div>
            </div>

            <form className="top-bar-right" onSubmit={handleSearchSubmit}>
              <div className="search-box-pill">
                <input
                  type="text"
                  placeholder="Buscar por RUT o Nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="pill-search-btn" title="Buscar">
                  <Search size={16} />
                </button>
              </div>
            </form>
          </div>

          {/* FILTROS POR ESTADO */}
          <div className="status-filter-pills">
            {[
              { id: 'TODOS', label: 'Todos los Registros' },
              { id: 'PENDIENTE', label: 'Pendientes' },
              { id: 'ENTREGADO', label: 'Entregados' },
              { id: 'RECHAZADA', label: 'Rechazadas' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-pill-btn ${filtroEstado === f.id ? 'active' : ''}`}
                onClick={() => setFiltroEstado(f.id)}
              >
                <span>{f.label}</span>
              </button>
            ))}
            <span className="results-count-chip">
              {beneficiarios.length} registro{beneficiarios.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* TABLA PRINCIPAL */}
          <div className="admin-table-card">
            {loading ? (
              <div className="table-loading-state">
                <RefreshCw size={24} className="spin-anim" />
                <span>Cargando padrón de beneficiarios…</span>
              </div>
            ) : beneficiarios.length === 0 ? (
              <div className="table-empty-state">
                <FileSpreadsheet size={36} className="empty-icon" />
                <p>No se encontraron beneficiarios con los criterios seleccionados.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Alumno / Apoderado</th>
                      <th>RUT</th>
                      <th>Contacto</th>
                      <th>Establecimiento</th>
                      <th>Beneficio</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                      <th style={{ textAlign: 'center' }}>Acta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {beneficiarios.map((b) => {
                      const isEntregado = b.entregado;
                      const isAprobada = (b.estado || '').toUpperCase().includes('APROBADA');

                      return (
                        <tr
                          key={b.id || `${b.rut_alumno}_${b.beneficio_nombre}`}
                          className="table-row-hover"
                          onClick={() => setSelectedItem(b)}
                        >
                          <td>
                            <div className="cell-primary-name">
                              {b.nombre_alumno || b.nombre_apoderado}
                            </div>
                            <small className="cell-secondary-text">
                              Apoderado: {b.nombre_apoderado}
                            </small>
                          </td>
                          <td className="cell-rut">
                            <div>{b.rut_alumno}</div>
                            <small className="cell-secondary-text">Apod: {b.rut_apoderado}</small>
                          </td>
                          <td>
                            <div>{b.telefono_apoderado || 'Sin teléfono'}</div>
                            <small className="cell-secondary-text">{b.correo_apoderado || '—'}</small>
                          </td>
                          <td>
                            <div className="cell-school">{b.establecimiento || 'Quilpué'}</div>
                            <small className="cell-secondary-text">{b.sector}</small>
                          </td>
                          <td>
                            <span className="cell-benefit-badge">{b.beneficio_nombre}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isEntregado ? (
                              <span className="status-badge-clean green">
                                <CheckCircle2 size={14} />
                                <span>Entregado</span>
                              </span>
                            ) : isAprobada ? (
                              <span className="status-badge-clean yellow">
                                <Clock size={14} />
                                <span>Pendiente</span>
                              </span>
                            ) : (
                              <span className="status-badge-clean gray">
                                <XCircle size={14} />
                                <span>{b.estado || 'Rechazada'}</span>
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {b.foto_acta ? (
                              <button
                                type="button"
                                className="btn-table-icon"
                                title="Ver fotografía del acta física"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(b);
                                }}
                              >
                                <Eye size={16} />
                              </button>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* VISTA DE DETALLE DEL BENEFICIARIO SELECCIONADO */
        <div className="beneficiary-detail-view">
          <div className="detail-top-nav">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSelectedItem(null)}
            >
              ← Volver al listado
            </button>
            <h3 className="detail-title">Detalle de Beneficiario y Trazabilidad</h3>
          </div>

          <div className="detail-content-grid">
            <div className="detail-card info-card">
              <h4>Información del Estudiante</h4>
              <div className="detail-row">
                <span className="d-label">Nombre Completo:</span>
                <span className="d-val">{selectedItem.nombre_alumno}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">RUT Estudiante:</span>
                <span className="d-val">{selectedItem.rut_alumno}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Establecimiento:</span>
                <span className="d-val">{selectedItem.establecimiento}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Nivel Educacional:</span>
                <span className="d-val">{selectedItem.nivel_educacional}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Beneficio Asignado:</span>
                <span className="d-val highlight">{selectedItem.beneficio_nombre}</span>
              </div>

              <h4 style={{ marginTop: '20px' }}>Información del Apoderado</h4>
              <div className="detail-row">
                <span className="d-label">Apoderado:</span>
                <span className="d-val">{selectedItem.nombre_apoderado}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">RUT Apoderado:</span>
                <span className="d-val">{selectedItem.rut_apoderado}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Dirección:</span>
                <span className="d-val">{selectedItem.direccion}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Sector:</span>
                <span className="d-val">{selectedItem.sector}</span>
              </div>
              <div className="detail-row">
                <span className="d-label">Contacto:</span>
                <span className="d-val">{selectedItem.telefono_apoderado || '—'} · {selectedItem.correo_apoderado || '—'}</span>
              </div>
            </div>

            <div className="detail-card acta-card">
              <h4>Respaldo de Entrega (Acta Física Firmada)</h4>
              {selectedItem.foto_acta ? (
                <div className="acta-full-preview">
                  <img src={selectedItem.foto_acta} alt="Acta de entrega firmada" className="acta-image" />
                  <div className="acta-meta-bar">
                    <span className="meta-text">
                      <Calendar size={14} /> Fecha entrega: {selectedItem.fecha_entrega || 'Registrada'}
                    </span>
                    <a
                      href={selectedItem.foto_acta}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline"
                    >
                      Abrir en tamaño original
                    </a>
                  </div>
                </div>
              ) : (
                <div className="acta-missing-box">
                  <Clock size={32} />
                  <p>Beneficio en estado pendiente. Aún no se ha registrado la entrega física ni el acta en terreno.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTACIÓN CON LOS DOS MODOS */}
      {importModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content import-modal">
            <div className="modal-header">
              <div className="modal-title-with-icon">
                <FileSpreadsheet size={22} />
                <h3>
                  {importMode === 'replace'
                    ? 'Reemplazar Nómina Completa'
                    : 'Actualizar o Sumar a la Nómina Existente'}
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setImportModalOpen(false)}
                disabled={importLoading}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {importMode === 'replace' ? (
                <div className="import-alert-box danger">
                  <AlertTriangle size={24} className="alert-icon" />
                  <div>
                    <strong>Advertencia de Reemplazo Total:</strong>
                    <p>
                      Esta acción eliminará el padrón y las actas actuales, cargando únicamente la información
                      contenida en la nueva planilla Excel.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="import-alert-box info">
                  <PlusCircle size={24} className="alert-icon" />
                  <div>
                    <strong>Modo Actualización / Fusión:</strong>
                    <p>
                      Se agregarán nuevos postulantes y se actualizarán los datos de los existentes.
                      Las actas físicas y entregas ya registradas se conservarán intactas.
                    </p>
                  </div>
                </div>
              )}

              <div
                className="file-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />
                <Upload size={32} className="dropzone-icon" />
                <p className="dropzone-text">
                  {selectedFile
                    ? `Archivo seleccionado: ${selectedFile.name}`
                    : 'Haz clic o arrastra aquí tu planilla Excel (.xlsx, .xls)'}
                </p>
                <small className="dropzone-sub">
                  Soporta planillas como <code>Listado Ayuda Escolar.xlsx</code> y formatos comunales oficiales.
                </small>
              </div>

              {importError && (
                <div className="modal-error-alert">
                  <XCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importResult && (
                <div className="modal-success-alert">
                  <CheckCircle2 size={16} />
                  <span>
                    {importResult.message || 'Planilla procesada con éxito'} ({importResult.importedRows || 0} registros).
                  </span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setImportModalOpen(false)}
                disabled={importLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${importMode === 'replace' ? 'btn-danger' : 'btn-primary'}`}
                onClick={ejecutarImportacion}
                disabled={!selectedFile || importLoading}
              >
                {importLoading ? (
                  <>
                    <RefreshCw size={16} className="spin-anim" />
                    <span>Procesando nómina…</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>
                      {importMode === 'replace' ? 'Confirmar y Reemplazar Todo' : 'Procesar y Actualizar'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
