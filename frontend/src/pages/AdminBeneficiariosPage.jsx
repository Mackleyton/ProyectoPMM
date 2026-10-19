import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import { formatRut, cleanRut } from '../utils/rutUtils';

export default function AdminBeneficiariosPage() {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [loading, setLoading] = useState(true);

  // Beneficiario seleccionado para ver el detalle
  const [selectedItem, setSelectedItem] = useState(null);

  // Estado del modal de importación con los dos modos solicitados
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState('update'); // 'replace' | 'update'
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
    if (e) e.preventDefault();
    cargar();
  }

  function handleOpenModal(mode) {
    setImportMode(mode);
    setSelectedFile(null);
    setImportResult(null);
    setImportError('');
    setImportModalOpen(true);
  }

  function handleFileChange(e) {
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
          {/* BARRA SUPERIOR: BOTONES DE IMPORTACIÓN Y BUSCADOR */}
          <div className="beneficiarios-top-bar">
            <div className="top-bar-left">
              <h2 className="section-title-large">Beneficiarios</h2>
              
              {/* Botón 1: Eliminar y Subir Nueva Nómina */}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ borderColor: '#ef4444', color: '#dc2626' }}
                onClick={() => handleOpenModal('replace')}
                title="Elimina el contenido actual y monta una planilla nueva"
              >
                Eliminar y Subir Nueva Plantilla
              </button>

              {/* Botón 2: Actualizar / Sumar Nómina */}
              <button
                type="button"
                className="btn btn-yellow btn-importar btn-sm"
                onClick={() => handleOpenModal('update')}
                title="Agrega nuevos registros o actualiza los existentes conservando entregas"
              >
                + Actualizar / Sumar Plantilla
              </button>
            </div>

            <form className="top-bar-right" onSubmit={handleSearchSubmit}>
              <div className="search-box-pill">
                <input
                  type="text"
                  placeholder="Ejemplo: 12.345.678-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="pill-search-btn" title="Buscar">
                  🔍
                </button>
              </div>
            </form>
          </div>

          {/* FILTROS RÁPIDOS */}
          <div className="status-filter-pills">
            {['TODOS', 'PENDIENTE', 'ENTREGADO', 'RECHAZADA'].map((st) => (
              <button
                key={st}
                type="button"
                className={`filter-pill-btn ${filtroEstado === st ? 'active' : ''}`}
                onClick={() => setFiltroEstado(st)}
              >
                {st === 'TODOS'
                  ? 'Todos los Registros'
                  : st === 'PENDIENTE'
                  ? 'Pendientes'
                  : st === 'ENTREGADO'
                  ? 'Entregados'
                  : 'Rechazadas'}
              </button>
            ))}
            <span className="results-count-chip">
              {beneficiarios.length} registro{beneficiarios.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* TABLA PRINCIPAL DE BENEFICIARIOS */}
          <div className="admin-table-card">
            {loading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                Cargando nómina de beneficiarios…
              </div>
            ) : beneficiarios.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                <p>No se encontraron beneficiarios con los criterios especificados.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>RUT</th>
                      <th>Contacto</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
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
                          <td style={{ textAlign: 'center' }}>
                            {isEntregado ? (
                              <span className="status-badge-circle green" title="Entregado">
                                ✓
                              </span>
                            ) : isAprobada ? (
                              <span
                                className="status-badge-circle yellow"
                                title="Aprobada - Pendiente"
                              >
                                −
                              </span>
                            ) : (
                              <span className="status-badge-circle red" title={b.estado || 'Rechazada'}>
                                ✕
                              </span>
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
        /* VISTA DE DETALLE ADMINISTRATIVO CON ACTA FÍSICA */
        <div className="admin-detail-container">
          <button
            type="button"
            className="btn-back-link"
            onClick={() => setSelectedItem(null)}
          >
            ← Volver a la lista de beneficiarios
          </button>

          <div className="admin-detail-card">
            <div className="detail-split-layout">
              {/* Columna Izquierda: Datos del Beneficiario */}
              <div className="detail-info-column">
                <h3 className="detail-section-title">Datos del Beneficiario</h3>

                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <label>Nombre del Alumno</label>
                    <span>{selectedItem.nombre_alumno}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>RUT Alumno</label>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {selectedItem.rut_alumno}
                    </span>
                  </div>
                  <div className="detail-info-item">
                    <label>Establecimiento</label>
                    <span>{selectedItem.establecimiento}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>Nivel Educacional</label>
                    <span>{selectedItem.nivel_educacional}</span>
                  </div>
                  <div className="detail-info-item" style={{ gridColumn: 'span 2' }}>
                    <label>Beneficio Social Asignado</label>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                      {selectedItem.beneficio_nombre}
                    </span>
                  </div>
                </div>

                <div className="detail-divider" />

                <h3 className="detail-section-title">Datos del Apoderado</h3>
                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <label>Nombre Completo</label>
                    <span>{selectedItem.nombre_apoderado}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>RUT Apoderado</label>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {selectedItem.rut_apoderado}
                    </span>
                  </div>
                  <div className="detail-info-item">
                    <label>Dirección</label>
                    <span>{selectedItem.direccion}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>Sector Comunal</label>
                    <span>{selectedItem.sector}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>Teléfono</label>
                    <span>{selectedItem.telefono_apoderado || 'No registrado'}</span>
                  </div>
                  <div className="detail-info-item">
                    <label>Correo</label>
                    <span>{selectedItem.correo_apoderado || 'No registrado'}</span>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Estado y Fotografía del Acta */}
              <div className="detail-status-column">
                {selectedItem.entregado ? (
                  <div className="acta-delivered-box">
                    <div className="acta-document-preview">
                      {selectedItem.foto_acta ? (
                        <img
                          src={selectedItem.foto_acta}
                          alt="Acta de entrega firmada"
                          className="acta-real-photo"
                        />
                      ) : (
                        <div className="acta-paper-mockup">
                          <span className="paper-seal">🏛️</span>
                          <div className="paper-header-line" />
                          <div className="paper-text-line" />
                          <div className="paper-text-line short" />
                          <div className="paper-signature">
                            <span className="signature-mark">Firmado</span>
                            <small>Acta Física Archivada</small>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="status-badge-delivered-wrap">
                      <div className="delivered-circle-icon">✓</div>
                      <span className="delivered-text-label">Entregado</span>
                      <span className="delivered-date-text">
                        {selectedItem.fecha_entrega
                          ? `Fecha: ${selectedItem.fecha_entrega}`
                          : 'Entrega registrada en terreno'}
                      </span>
                      {selectedItem.foto_acta && (
                        <a
                          href={selectedItem.foto_acta}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: '10px' }}
                        >
                          Ver Fotografía Original
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="acta-pending-box">
                    <div className="pending-circle-icon">−</div>
                    <span className="pending-text-label">Pendiente</span>
                    <p className="pending-hint-text">
                      La entrega física aún no ha sido registrada por un operador en terreno.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTACIÓN CON AMBOS MODOS FUNCIONALES */}
      {importModalOpen && (
        <div className="import-modal-backdrop">
          <div className="import-modal-card">
            <div className="camera-modal-header">
              <div className="camera-modal-title">
                <div className="camera-icon-badge">📊</div>
                <div>
                  <h3>
                    {importMode === 'replace'
                      ? 'Eliminar Contenido Actual y Cargar Nueva Plantilla'
                      : 'Actualizar / Sumar Información a la Nómina Existente'}
                  </h3>
                  <p>
                    {importMode === 'replace'
                      ? 'Esta acción reiniciará los registros actuales y montará la nueva nómina.'
                      : 'Se agregarán nuevos postulantes y se actualizarán datos conservando las entregas ya registradas.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setImportModalOpen(false)}
                disabled={importLoading}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {importMode === 'replace' ? (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    borderLeft: '4px solid #ef4444',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    color: '#991b1b',
                    fontSize: '0.88rem',
                  }}
                >
                  <strong>⚠️ Atención:</strong> Al confirmar el reemplazo, se eliminarán los beneficiarios actuales y se cargarán únicamente los que estén presentes en la nueva planilla Excel.
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    borderLeft: '4px solid #3b82f6',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    color: '#1e40af',
                    fontSize: '0.88rem',
                  }}
                >
                  <strong>ℹ️ Modo Seguro:</strong> Se incorporarán nuevos registros y se actualizarán los existentes. Las entregas y actas ya realizadas permanecerán intactas.
                </div>
              )}

              {/* Área de Selección de Archivo */}
              <div
                className="file-drop-area"
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', textAlign: 'center', margin: '0 auto' }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div className="drop-icon">📁</div>
                <p className="drop-text">
                  {selectedFile
                    ? `Archivo listo: ${selectedFile.name}`
                    : 'Haz clic aquí para seleccionar tu archivo Excel (.xlsx o .xls)'}
                </p>
                {selectedFile && (
                  <p className="drop-file-name" style={{ color: '#16a34a', fontWeight: 'bold' }}>
                    ✓ Tamaño: {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {importError && (
                <div className="terreno-msg-error" style={{ marginTop: '14px' }}>
                  {importError}
                </div>
              )}

              {importResult && (
                <div
                  style={{
                    backgroundColor: '#ecfdf5',
                    color: '#065f46',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginTop: '14px',
                    fontSize: '0.88rem',
                    fontWeight: '600',
                  }}
                >
                  ✓ {importResult.message} ({importResult.importedRows || 0} beneficiarios procesados).
                </div>
              )}
            </div>

            <div
              style={{
                padding: '16px 24px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setImportModalOpen(false)}
                disabled={importLoading}
              >
                Cerrar
              </button>
              <button
                type="button"
                className={`btn btn-sm ${importMode === 'replace' ? 'btn-outline' : 'btn-yellow'}`}
                style={
                  importMode === 'replace'
                    ? { backgroundColor: '#dc2626', color: 'white', borderColor: '#dc2626' }
                    : {}
                }
                onClick={ejecutarImportacion}
                disabled={!selectedFile || importLoading}
              >
                {importLoading
                  ? 'Procesando planilla…'
                  : importMode === 'replace'
                  ? 'Confirmar Reemplazo Total'
                  : 'Procesar y Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
