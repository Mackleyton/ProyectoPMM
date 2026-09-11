import { useState, useRef } from 'react';
import { formatRut, validateRut, cleanRut } from '../utils/rutUtils';
import { apiService } from '../services/apiService';
import CameraModal from '../components/CameraModal';
import SuccessModal from '../components/SuccessModal';

export default function TerrenoView() {
  const [rutInput, setRutInput] = useState('');
  const [rutValidation, setRutValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Datos del apoderado y sus beneficios devueltos por el backend
  const [guardian, setGuardian] = useState(null);
  const [benefits, setBenefits] = useState([]);
  const [checkedBenefitIds, setCheckedBenefitIds] = useState(new Set());

  // Foto del acta
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoDataUrl, setFotoDataUrl] = useState(null);

  // Modal de éxito
  const [showSuccess, setShowSuccess] = useState(false);
  const [entregaExitosaData, setEntregaExitosaData] = useState(null);

  const inputRef = useRef(null);
  const isSubmittingRef = useRef(false);

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
    setGuardian(null);
    setBenefits([]);
    setCheckedBenefitIds(new Set());
    setFotoFile(null);
    setFotoDataUrl(null);

    try {
      const data = await apiService.buscarPorRut(rutLimpio);
      if (!data.guardian || (data.benefits && data.benefits.length === 0)) {
        setSearchError(`No se encontraron registros activos para el RUT ${rutInput}`);
      } else {
        setGuardian(data.guardian);
        setBenefits(data.benefits || []);

        // Preseleccionar beneficios que estén en estado PENDING
        const initialSelected = new Set();
        (data.benefits || []).forEach((b) => {
          if (b.status === 'PENDING') {
            initialSelected.add(b.benefitId);
          }
        });
        setCheckedBenefitIds(initialSelected);
      }
    } catch (err) {
      setSearchError(err.message || 'Error al consultar beneficiario');
    } finally {
      setLoading(false);
    }
  }

  function toggleBenefitCheckbox(benefitId) {
    const nuevoSet = new Set(checkedBenefitIds);
    if (nuevoSet.has(benefitId)) {
      nuevoSet.delete(benefitId);
    } else {
      nuevoSet.add(benefitId);
    }
    setCheckedBenefitIds(nuevoSet);
  }

  function toggleTodos() {
    const pendingList = benefits.filter((b) => b.status === 'PENDING');
    if (checkedBenefitIds.size === pendingList.length) {
      setCheckedBenefitIds(new Set());
    } else {
      const nuevoSet = new Set(pendingList.map((b) => b.benefitId));
      setCheckedBenefitIds(nuevoSet);
    }
  }

  function handlePhotoCaptured(file, dataUrl) {
    setFotoFile(file);
    setFotoDataUrl(dataUrl);
  }

  async function handleRegistrarEntrega() {
    if (isSubmittingRef.current || loading) return;

    if (checkedBenefitIds.size === 0) {
      alert('Debe marcar al menos un beneficio con el checkbox para realizar la entrega.');
      return;
    }
    if (!fotoFile && !fotoDataUrl) {
      alert('Es obligatorio capturar la fotografía del acta física firmada.');
      setIsCameraOpen(true);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const benefitIdsArray = Array.from(checkedBenefitIds);

      // Si tenemos dataUrl pero no File, convertir a File
      let fileToSend = fotoFile;
      if (!fileToSend && fotoDataUrl) {
        const resBlob = await fetch(fotoDataUrl);
        const blob = await resBlob.blob();
        fileToSend = new File([blob], `acta_${Date.now()}.jpg`, { type: 'image/jpeg' });
      }

      const res = await apiService.registrarEntrega({
        rut: guardian.rut,
        benefitIds: benefitIdsArray,
        actaFile: fileToSend,
        notes: 'Entrega en terreno - Quilpué',
      });

      // Actualizar estado local de los beneficios a DELIVERED
      const fechaNow = new Date().toLocaleString('es-CL');
      setBenefits((prev) =>
        prev.map((b) =>
          checkedBenefitIds.has(b.benefitId)
            ? { ...b, status: 'DELIVERED', deliveredAt: fechaNow }
            : b
        )
      );

      // Preparar datos para el modal de éxito
      const entregados = benefits
        .filter((b) => checkedBenefitIds.has(b.benefitId))
        .map((b) => ({
          nombre_alumno: b.student?.fullName || 'Alumno',
          rut_alumno: b.student?.rut || '',
          nivel_educacional: b.student?.educationalLevel || b.benefitName,
        }));

      setEntregaExitosaData({
        apoderado: {
          nombre_apoderado: guardian.fullName,
          rut_apoderado: guardian.rut,
        },
        beneficiarios: entregados,
        fecha: res.delivery?.deliveredAt || fechaNow,
      });

      setCheckedBenefitIds(new Set());
      setFotoFile(null);
      setFotoDataUrl(null);
      setShowSuccess(true);
    } catch (err) {
      alert('Error al registrar entrega: ' + err.message);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  function handleCerrarExito() {
    setShowSuccess(false);
    setEntregaExitosaData(null);
    setGuardian(null);
    setBenefits([]);
    setCheckedBenefitIds(new Set());
    setFotoFile(null);
    setFotoDataUrl(null);
    setRutInput('');
    inputRef.current?.focus();
  }

  const pendingBenefits = benefits.filter((b) => b.status === 'PENDING');

  return (
    <div className="terreno-view-container">
      {/* VISTA 1: BÚSQUEDA Y RESULTADOS PRELIMINARES */}
      {!guardian ? (
        <div className="terreno-search-card">
          <div className="screen-header">
            <h2 className="screen-title">Beneficiarios</h2>
            <p className="screen-subtitle">
              Ingrese RUT del apoderado o del estudiante para consultar y registrar entregas
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
                placeholder="Ejemplo: 16.033.988-8"
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

          {/* Tips de búsqueda rápida con datos de la planilla */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', color: '#64748b' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>💡 RUTs de beneficiarios (Planilla Excel):</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.5' }}>
              <li><code>15.234.567-8</code> — Juan Pérez Gómez (Alumno: Pedro Pérez Díaz - Quilpué Centro)</li>
              <li><code>12.876.543-2</code> — Ana Silva Rojas (Alumna: Sofía Muñoz Silva - Belloto Norte)</li>
              <li><code>16.432.109-7</code> — Carlos Valenzuela Soto (Alumno: Lucas Valenzuela Castro)</li>
              <li><code>17.890.123-4</code> — Luis Castro Romero (Mesa 3 - 12:00)</li>
              <li><code>14.567.890-0</code> — Mauricio Vera (Ya entregado previamente)</li>
            </ul>
          </div>
        </div>
      ) : (
        /* VISTA 2: FICHA DE ENTREGA Y CHECKBOXES DE BENEFICIOS */
        <div className="terreno-ficha-container">
          <button
            type="button"
            className="btn-back-link"
            onClick={() => {
              setGuardian(null);
              setBenefits([]);
            }}
          >
            ‹ Volver a Buscar
          </button>

          <div className="ficha-card">
            {/* SECCIÓN APODERADO */}
            <div className="ficha-section">
              <h3 className="section-title">Apoderado Responsable</h3>
              <div className="ficha-grid">
                <div className="ficha-field">
                  <label>Nombre Completo</label>
                  <span>{guardian.fullName || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>RUT</label>
                  <span>{guardian.rut || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Dirección</label>
                  <span>{guardian.address || 'Quilpué'}</span>
                </div>
                <div className="ficha-field">
                  <label>Sector</label>
                  <span>{guardian.sector || 'CENTRO'}</span>
                </div>
                <div className="ficha-field">
                  <label>Correo Electrónico</label>
                  <span>{guardian.email || '—'}</span>
                </div>
                <div className="ficha-field">
                  <label>Teléfono</label>
                  <span>{guardian.phone || '—'}</span>
                </div>
              </div>
            </div>

            <div className="ficha-divider" />

            {/* SECCIÓN ALUMNOS CON CHECKBOXES DE ENTREGA */}
            <div className="ficha-section">
              <div className="section-header-flex">
                <h3 className="section-title">
                  {benefits.length === 1
                    ? 'Beneficio Escolar'
                    : `Beneficios Asociados (${benefits.length})`}
                </h3>
                {pendingBenefits.length > 1 && (
                  <button
                    type="button"
                    className="select-all-btn"
                    onClick={toggleTodos}
                  >
                    {checkedBenefitIds.size === pendingBenefits.length
                      ? 'Desmarcar todos'
                      : 'Seleccionar todos pendientes'}
                  </button>
                )}
              </div>

              <div className="alumnos-list">
                {benefits.map((b) => {
                  const isChecked = checkedBenefitIds.has(b.benefitId);
                  const isDelivered = b.status === 'DELIVERED';

                  return (
                    <div
                      key={b.benefitId}
                      className={`alumno-card-item ${isChecked ? 'selected' : ''} ${
                        isDelivered ? 'delivered' : ''
                      }`}
                    >
                      {/* Checkbox de selección */}
                      <div className="alumno-check-col">
                        {isDelivered ? (
                          <span className="badge-delivered-check" title="Ya entregado">
                            ✓
                          </span>
                        ) : (
                          <label className="custom-checkbox-container">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBenefitCheckbox(b.benefitId)}
                            />
                            <span className="checkbox-checkmark" />
                          </label>
                        )}
                      </div>

                      {/* Datos del Alumno y Beneficio */}
                      <div className="alumno-details-col">
                        <div className="alumno-name-row">
                          <strong>{b.student?.fullName || 'Alumno'}</strong>
                          <span className="alumno-rut-badge">RUT {b.student?.rut}</span>
                        </div>
                        <div className="alumno-meta-row">
                          <span>🏫 {b.student?.establishment || 'Colegio Quilpué'}</span>
                          <span>📚 {b.student?.educationalLevel || 'Nivel Escolar'}</span>
                        </div>
                        <div className="alumno-benefit-tag">
                          🎁 {b.benefitName || 'Set Escolar Municipal 2026'}
                        </div>

                        {isDelivered && (
                          <div className="delivery-status-info">
                            <span className="delivered-badge">✓ Beneficio Entregado</span>
                            {b.deliveredAt && (
                              <small>Fecha: {b.deliveredAt}</small>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Contador de entregas */}
              <div className="partial-delivery-counter">
                <span>Beneficios marcados para retiro actual:</span>
                <strong>
                  {checkedBenefitIds.size} de {pendingBenefits.length} pendientes
                </strong>
              </div>
            </div>

            {/* SECCIÓN FOTOGRAFÍA / CÁMARA */}
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
                  <span className="camera-dropzone-text">Capturar Fotografía Del Acta</span>
                  <small className="camera-dropzone-sub">
                    Fotografíe la firma en el acta física para respaldo y trazabilidad
                  </small>
                </div>
              )}
            </div>

            {/* BOTÓN REGISTRAR ENTREGA */}
            <button
              type="button"
              className="btn btn-yellow btn-lg full-width"
              onClick={handleRegistrarEntrega}
              disabled={loading || checkedBenefitIds.size === 0}
            >
              {loading ? 'Registrando Entrega en Servidor…' : 'Registrar Entrega'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CÁMARA */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* MODAL DE ÉXITO */}
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
