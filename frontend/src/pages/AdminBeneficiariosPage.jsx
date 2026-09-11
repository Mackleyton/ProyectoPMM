import { useState, useEffect } from 'react';
import { apiService, API_BASE } from '../services/apiService';
import { formatRut, cleanRut } from '../utils/rutUtils';

export default function AdminBeneficiariosPage({ onOpenImportModal }) {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [loading, setLoading] = useState(true);

  // Beneficiario seleccionado para ver el detalle (preliminar2.png pantallas 3 y 4)
  const [selectedItem, setSelectedItem] = useState(null);
  // Modal de zoom para inspección visual del acta en alta resolución
  const [zoomActaUrl, setZoomActaUrl] = useState(null);

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiService.obtenerBeneficiarios({
        search,
        estado: filtroEstado,
      });
      setBeneficiarios(data);
    } catch (err) {
      console.error(err);
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

  return (
    <div className="admin-beneficiarios-container">
      {!selectedItem ? (
        <>
          {/* BARRA SUPERIOR: + IMPORTAR Y BUSCADOR (preliminar2.png - pantalla 2) */}
          <div className="beneficiarios-top-bar">
            <div className="top-bar-left">
              <h2 className="section-title-large">Beneficiarios</h2>
              <button
                type="button"
                className="btn btn-yellow btn-importar"
                onClick={onOpenImportModal}
              >
                + Importar
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
                  ? '⏳ Pendientes'
                  : st === 'ENTREGADO'
                  ? '✓ Entregados'
                  : '✕ Rechazadas'}
              </button>
            ))}
            <span className="results-count-chip">
              {beneficiarios.length} registro{beneficiarios.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* TABLA PRINCIPAL DE BENEFICIARIOS (preliminar2.png - pantalla 2) */}
          <div className="admin-table-card">
            {loading ? (
              <div className="table-loading-state">Cargando nómina de beneficiarios…</div>
            ) : beneficiarios.length === 0 ? (
              <div className="table-empty-state">
                <span className="empty-icon">📂</span>
                <p>No se encontraron beneficiarios con los criterios especificados.</p>
              </div>
            ) : (
              <div className="table-responsive">
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
                          key={b.rut_alumno || b.id}
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
                              <span className="status-badge-circle red" title="Rechazada">
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
        /* VISTA DE DETALLE DEL BENEFICIARIO (preliminar2.png - pantallas 3 y 4) */
        <div className="admin-detail-container">
          <button
            type="button"
            className="btn-back-link"
            onClick={() => setSelectedItem(null)}
          >
            ‹ Regresar
          </button>

          <div className="admin-detail-card">
            <div className="detail-split-layout">
              {/* Columna Izquierda: Información de Apoderado y Alumno */}
              <div className="detail-info-column">
                <div className="detail-section">
                  <h3 className="detail-section-title">Apoderado</h3>
                  <div className="detail-info-grid">
                    <div className="detail-info-item">
                      <label>Nombre</label>
                      <span>{selectedItem.nombre_apoderado || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>RUT</label>
                      <span>{selectedItem.rut_apoderado || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Dirección</label>
                      <span>{selectedItem.direccion || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Sector</label>
                      <span>{selectedItem.sector || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Correo</label>
                      <span>{selectedItem.correo_apoderado || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Teléfono</label>
                      <span>{selectedItem.telefono_apoderado || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-divider" />

                <div className="detail-section">
                  <h3 className="detail-section-title">Alumno</h3>
                  <div className="detail-info-grid">
                    <div className="detail-info-item">
                      <label>Nombre</label>
                      <span>{selectedItem.nombre_alumno || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>RUT</label>
                      <span>{selectedItem.rut_alumno || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Institución educativa</label>
                      <span>{selectedItem.establecimiento || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Nivel Educacional</label>
                      <span>{selectedItem.nivel_educacional || '—'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Beneficio Asignado</label>
                      <span>{selectedItem.beneficio_nombre || 'Set Escolar 2026'}</span>
                    </div>
                    <div className="detail-info-item">
                      <label>Fecha Postulación</label>
                      <span>{selectedItem.fecha_postulacion || '12/12/2025'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Acta Física Firmada y Estado (preliminar2.png pantallas 3 y 4) */}
              <div className="detail-status-column">
                {selectedItem.entregado ? (
                  <div className="acta-delivered-box">
                    {(() => {
                      const rawPhoto = selectedItem.foto_acta || selectedItem.foto_entrega;
                      const fotoUrl = rawPhoto
                        ? (rawPhoto.startsWith('http') || rawPhoto.startsWith('data:') ? rawPhoto : `${API_BASE}${rawPhoto}`)
                        : null;

                      return (
                        <div className="acta-document-preview">
                          {fotoUrl ? (
                            <div
                              className="acta-photo-interactive-container"
                              onClick={() => setZoomActaUrl(fotoUrl)}
                              title="Haz clic para ver el acta en alta resolución"
                            >
                              <img
                                src={fotoUrl}
                                alt="Acta firmada"
                                className="acta-real-photo"
                              />
                              <div className="acta-photo-overlay-tag">
                                🔍 Clic para ampliar acta
                              </div>
                            </div>
                          ) : (
                            <div className="acta-paper-mockup">
                              <div className="paper-seal">🏛️</div>
                              <div className="paper-header-line" />
                              <div className="paper-text-line" />
                              <div className="paper-text-line short" />
                              <div className="paper-signature">
                                <span className="signature-mark">✍️ Firmado</span>
                                <small>Acta de Entrega Digitalizada</small>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="status-badge-delivered-wrap">
                      <div className="delivered-circle-icon">✓</div>
                      <span className="delivered-text-label">Beneficio Entregado</span>
                      {selectedItem.fecha_entrega && (
                        <small className="delivered-date-text">
                          Fecha: {selectedItem.fecha_entrega}
                        </small>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="acta-pending-box">
                    <div className="pending-circle-icon">−</div>
                    <span className="pending-text-label">Entrega Pendiente</span>
                    <p className="pending-hint-text">
                      El beneficiario aún no ha acudido al centro de distribución para retirar el beneficio.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lightbox de inspección del Acta Física en Alta Resolución */}
      {zoomActaUrl && selectedItem && (
        <div className="modal-backdrop" onClick={() => setZoomActaUrl(null)}>
          <div className="acta-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="acta-lightbox-header">
              <div className="acta-lightbox-titles">
                <h3>Acta de Entrega Digitalizada</h3>
                <p>
                  Beneficiario: <strong>{selectedItem.nombre_alumno || selectedItem.nombre_apoderado}</strong> | RUT: <strong>{selectedItem.rut_apoderado}</strong>
                </p>
              </div>
              <div className="acta-lightbox-actions">
                <a
                  href={zoomActaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  download={`Acta_${cleanRut(selectedItem.rut_apoderado || 'entrega')}.jpg`}
                >
                  ⬇ Descargar Original
                </a>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setZoomActaUrl(null)}
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div className="acta-lightbox-body">
              <img
                src={zoomActaUrl}
                alt="Acta de entrega firmada"
                className="acta-lightbox-img"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
