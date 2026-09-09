import { useState, useRef, useEffect } from 'react';
import { formatRut, validateRut, cleanRut } from '../utils/rutUtils';
import { apiService } from '../services/apiService';
import CameraModal from '../components/CameraModal';
import SuccessModal from '../components/SuccessModal';

export default function TerrenoView() {
  const [rutInput, setRutInput] = useState('');
  const [rutValidation, setRutValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [resultados, setResultados] = useState(null);

  // Selección activa para entrega
  const [selectedApoderado, setSelectedApoderado] = useState(null);
  const [selectedAlumnos, setSelectedAlumnos] = useState([]);
  const [checkedRuts, setCheckedRuts] = useState(new Set());

  // Foto del acta
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoDataUrl, setFotoDataUrl] = useState(null);

  // Modal de éxito
  const [showSuccess, setShowSuccess] = useState(false);
  const [entregaExitosaData, setEntregaExitosaData] = useState(null);

  const inputRef = useRef(null);

  // Manejar escritura de RUT con formateo dinámico
  function handleRutChange(e) {
    const raw = e.target.value;
    const formatted = formatRut(raw);
    setRutInput(formatted);

    const cleaned = cleanRut(formatted);
    if (cleaned.length >= 7) {
      const val = validateRut(formatted);
      setRutValidation(val);
    } else {
      setRutValidation(null);
    }
  }

  async function ejecutarBusqueda(e) {
    if (e) e.preventDefault();
    const rutLimpio = cleanRut(rutInput);
    if (!rutLimpio) {
      setSearchError('Por favor ingrese un número de RUT');
      return;
    }

    setLoading(true);
    setSearchError('');
    setResultados(null);
    setSelectedApoderado(null);
    setSelectedAlumnos([]);
    setCheckedRuts(new Set());
    setFotoFile(null);
    setFotoDataUrl(null);

    try {
      const data = await apiService.buscarPorRut(rutLimpio);
      if (data.total === 0) {
        setSearchError(`No se encontraron registros para el RUT ${rutInput}`);
        setResultados([]);
      } else {
        setResultados(data.resultados);
        // Si hay un solo grupo familiar, abrir directamente la ficha
        const grupos = agruparPorApoderado(data.resultados);
        if (grupos.length === 1) {
          abrirFichaEntrega(grupos[0]);
        }
      }
    } catch (err) {
      setSearchError(err.message || 'Error al consultar beneficiario');
    } finally {
      setLoading(false);
    }
  }

  function agruparPorApoderado(lista) {
    const map = new Map();
    for (const item of lista) {
      const key = cleanRut(item.rut_apoderado) || 'SIN_APODERADO';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.values()];
  }

  function abrirFichaEntrega(alumnosGrupo) {
    const apoderado = alumnosGrupo[0];
    setSelectedApoderado(apoderado);
    setSelectedAlumnos(alumnosGrupo);

    // Inicializar checkboxes: premarcar los alumnos con estado APROBADA y no entregados aún
    const inicialChecked = new Set();
    alumnosGrupo.forEach((al) => {
      const isAprobada = (al.estado || '').toUpperCase().includes('APROBADA');
      if (isAprobada && !al.entregado) {
        inicialChecked.add(cleanRut(al.rut_alumno));
      }
    });
    setCheckedRuts(inicialChecked);
  }

  function toggleAlumnoCheckbox(rutAlumno) {
    const rutClean = cleanRut(rutAlumno);
    const nuevoSet = new Set(checkedRuts);
    if (nuevoSet.has(rutClean)) {
      nuevoSet.delete(rutClean);
    } else {
      nuevoSet.add(rutClean);
    }
    setCheckedRuts(nuevoSet);
  }

  function toggleTodos(todosSeleccionados) {
    if (todosSeleccionados) {
      setCheckedRuts(new Set());
    } else {
      const nuevoSet = new Set();
      selectedAlumnos.forEach((al) => {
        const isAprobada = (al.estado || '').toUpperCase().includes('APROBADA');
        if (isAprobada && !al.entregado) {
          nuevoSet.add(cleanRut(al.rut_alumno));
        }
      });
      setCheckedRuts(nuevoSet);
    }
  }

  function handlePhotoCaptured(file, dataUrl) {
    setFotoFile(file);
    setFotoDataUrl(dataUrl);
  }

  async function handleRegistrarEntrega() {
    if (checkedRuts.size === 0) {
      alert('Debe marcar al menos un beneficio con el checkbox para realizar la entrega.');
      return;
    }
    if (!fotoFile && !fotoDataUrl) {
      alert('Es obligatorio capturar la fotografía del acta física firmada.');
      setIsCameraOpen(true);
      return;
    }

    setLoading(true);
    try {
      const rutsArray = [...checkedRuts];
      const res = await apiService.registrarEntrega({
        rut_apoderado: selectedApoderado.rut_apoderado,
        ruts_alumnos: rutsArray,
        fotoFile: fotoFile,
        fotoDataUrl: fotoDataUrl,
      });

      // Preparar datos para el modal de éxito
      const entregados = selectedAlumnos.filter((al) => checkedRuts.has(cleanRut(al.rut_alumno)));
      setEntregaExitosaData({
        apoderado: selectedApoderado,
        beneficiarios: entregados,
        fecha: res.fecha,
      });

      setShowSuccess(true);
    } catch (err) {
      alert('Error al registrar entrega: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCerrarExito() {
    setShowSuccess(false);
    setEntregaExitosaData(null);
    setSelectedApoderado(null);
    setSelectedAlumnos([]);
    setCheckedRuts(new Set());
    setFotoFile(null);
    setFotoDataUrl(null);
    setRutInput('');
    setResultados(null);
    inputRef.current?.focus();
  }

  const grupos = resultados ? agruparPorApoderado(resultados) : [];

  return (
    <div className="terreno-view-container">
      {/* VISTA 1: BÚSQUEDA Y RESULTADOS PRELIMINARES */}
      {!selectedApoderado ? (
        <div className="terreno-search-card">
          <div className="screen-header">
            <h2 className="screen-title">Beneficiarios</h2>
            <p className="screen-subtitle">
              Ingrese RUT del beneficiario para registrar o consultar la entrega
            </p>
          </div>

          <form className="search-form-row" onSubmit={ejecutarBusqueda}>
            <div className="search-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className={`search-input-field ${
                  rutValidation ? (rutValidation.isValid ? 'valid' : 'invalid') : ''
                }`}
                placeholder="Ejemplo: 12.345.678-9"
                value={rutInput}
                onChange={handleRutChange}
                autoFocus
              />
              <button
                type="submit"
                className="search-action-btn"
                disabled={loading || !rutInput.trim()}
                title="Buscar"
              >
                {loading ? '…' : '🔍'}
              </button>
            </div>
            {rutValidation && !rutValidation.isValid && (
              <span className="rut-validation-msg invalid">⚠️ {rutValidation.error}</span>
            )}
            {rutValidation && rutValidation.isValid && (
              <span className="rut-validation-msg valid">✓ Formato y RUT válido</span>
            )}
          </form>

          {searchError && <div className="terreno-msg-error">⚠️ {searchError}</div>}

          {/* TABLA DE BENEFICIARIOS (preliminar.png - pantalla 3) */}
          {grupos.length > 0 && (
            <div className="beneficiarios-table-wrap">
              <table className="preliminar-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>RUT</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((b, idx) => {
                    const isEntregado = b.entregado;
                    const isAprobada = (b.estado || '').toUpperCase().includes('APROBADA');
                    return (
                      <tr
                        key={idx}
                        className="clickable-row"
                        onClick={() => {
                          const grupo = resultados.filter(
                            (r) => cleanRut(r.rut_apoderado) === cleanRut(b.rut_apoderado)
                          );
                          abrirFichaEntrega(grupo);
                        }}
                      >
                        <td>
                          <div className="row-name">{b.nombre_alumno || b.nombre_apoderado}</div>
                          <small className="row-sub">
                            {b.nombre_alumno ? `Apod: ${b.nombre_apoderado}` : 'Apoderado'}
                          </small>
                        </td>
                        <td className="row-rut">{b.rut_alumno || b.rut_apoderado}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isEntregado ? (
                            <span className="status-icon-circle green" title="Entregado">
                              ✓
                            </span>
                          ) : isAprobada ? (
                            <span className="status-icon-circle yellow" title="Aprobada - Pendiente de Retiro">
                              −
                            </span>
                          ) : (
                            <span className="status-icon-circle red" title="Rechazada">
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
      ) : (
        /* VISTA 2: FICHA DE ENTREGA Y CHECKBOXES PARCIALES (preliminar.png - pantalla 4) */
        <div className="terreno-ficha-container">
          <button
            type="button"
            className="btn-back-link"
            onClick={() => setSelectedApoderado(null)}
          >
            ‹ Regresar
          </button>

          <div className="ficha-card">
            {/* SECCIÓN APODERADO */}
            <div className="ficha-section">
              <h3 className="section-title">Apoderado</h3>
              <div className="ficha-grid">
                <div className="ficha-field">
                  <label>Nombre</label>
                  <span>{selectedApoderado.nombre_apoderado || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>RUT</label>
                  <span>{selectedApoderado.rut_apoderado || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Dirección</label>
                  <span>{selectedApoderado.direccion || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Sector</label>
                  <span>{selectedApoderado.sector || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Correo</label>
                  <span>{selectedApoderado.correo_apoderado || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Teléfono</label>
                  <span>{selectedApoderado.telefono_apoderado || '—'}</span>
                </div>
              </div>
            </div>

            <div className="ficha-divider" />

            {/* SECCIÓN ALUMNOS CON CHECKBOXES DE ENTREGA PARCIAL */}
            <div className="ficha-section">
              <div className="section-header-flex">
                <h3 className="section-title">
                  {selectedAlumnos.length === 1
                    ? 'Beneficiario (Alumno)'
                    : `Beneficiarios Asociados (${selectedAlumnos.length})`}
                </h3>
                {selectedAlumnos.length > 1 && (
                  <button
                    type="button"
                    className="select-all-btn"
                    onClick={() => toggleTodos(checkedRuts.size === selectedAlumnos.length)}
                  >
                    {checkedRuts.size === selectedAlumnos.length
                      ? 'Desmarcar todos'
                      : 'Seleccionar todos pendientes'}
                  </button>
                )}
              </div>

              <div className="alumnos-list">
                {selectedAlumnos.map((alumno) => {
                  const rutClean = cleanRut(alumno.rut_alumno);
                  const isChecked = checkedRuts.has(rutClean);
                  const isEntregado = alumno.entregado;
                  const isAprobada = (alumno.estado || '').toUpperCase().includes('APROBADA');

                  return (
                    <div
                      key={alumno.rut_alumno}
                      className={`alumno-card-item ${isChecked ? 'selected' : ''} ${
                        isEntregado ? 'delivered' : ''
                      }`}
                    >
                      {/* Checkbox de entrega parcial */}
                      <div className="alumno-check-col">
                        {isEntregado ? (
                          <span className="badge-delivered-check" title="Ya entregado">
                            ✓
                          </span>
                        ) : isAprobada ? (
                          <label className="custom-checkbox-container">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAlumnoCheckbox(alumno.rut_alumno)}
                            />
                            <span className="checkbox-checkmark" />
                          </label>
                        ) : (
                          <span className="badge-rejected-cross" title="Postulación rechazada">
                            ✕
                          </span>
                        )}
                      </div>

                      {/* Datos del Alumno */}
                      <div className="alumno-details-col">
                        <div className="alumno-name-row">
                          <strong>{alumno.nombre_alumno}</strong>
                          <span className="alumno-rut-badge">RUT {alumno.rut_alumno}</span>
                        </div>
                        <div className="alumno-meta-row">
                          <span>🏫 {alumno.establecimiento || 'Establecimiento no especificado'}</span>
                          <span>📚 {alumno.nivel_educacional || 'Nivel Básico'}</span>
                        </div>
                        <div className="alumno-benefit-tag">
                          🎁 {alumno.beneficio_nombre || 'Set Escolar Municipal 2026'}
                        </div>

                        {isEntregado && (
                          <div className="delivery-status-info">
                            <span className="delivered-badge">✓ Beneficio Entregado</span>
                            {alumno.fecha_entrega && (
                              <small>Entregado el: {alumno.fecha_entrega}</small>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Contador de entregas parciales */}
              <div className="partial-delivery-counter">
                <span>Beneficios marcados para retiro actual:</span>
                <strong>
                  {checkedRuts.size} de {selectedAlumnos.filter((a) => !a.entregado).length}{' '}
                  pendientes
                </strong>
              </div>
            </div>

            {/* SECCIÓN MÓDULO DE FOTOS / CÁMARA (preliminar.png - pantalla 4) */}
            <div className="camera-upload-section">
              {fotoDataUrl ? (
                <div className="photo-attached-preview">
                  <img src={fotoDataUrl} alt="Acta firmada" className="attached-img" />
                  <div className="attached-info">
                    <span className="attached-success-text">✓ Fotografía del acta adjunta</span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setIsCameraOpen(true)}
                    >
                      📷 Repetir Fotografía
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="camera-dropzone"
                  onClick={() => setIsCameraOpen(true)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="camera-icon-circle">
                    <svg viewBox="0 0 24 24" className="camera-svg-icon" fill="none" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <circle cx="12" cy="13" r="4" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <span className="camera-dropzone-text">Subir Fotografía Del Acta</span>
                  <small className="camera-dropzone-sub">
                    Acceso directo a la cámara para respaldar firma física
                  </small>
                </div>
              )}
            </div>

            {/* BOTÓN REGISTRAR ENTREGA (preliminar.png - botón amarillo) */}
            <button
              type="button"
              className="btn btn-yellow btn-lg full-width"
              onClick={handleRegistrarEntrega}
              disabled={loading || checkedRuts.size === 0}
            >
              {loading ? 'Registrando Entrega…' : 'Registrar Entrega'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CÁMARA DE HARDWARE */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* MODAL DE ÉXITO ("Entrega Registrada" con checkmark verde) */}
      <SuccessModal
        isOpen={showSuccess}
        onClose={handleCerrarExito}
        apoderado={entregaExitosaData?.apoderado}
        beneficiariosEntregados={entregaExitosaData?.beneficiarios}
        fecha={entregaExitosaData?.fecha}
      />
    </div>
  );
}
