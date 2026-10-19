import { useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { formatRut, validateRut, cleanRut } from '../utils/rutUtils';
import { apiService } from '../services/apiService';
import { offlineStorage } from '../services/offlineStorage';
import CameraModal from '../components/CameraModal';
import SuccessModal from '../components/SuccessModal';

export default function TerrenoView() {
  const [rutInput, setRutInput] = useState('');
  const [rutValidation, setRutValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Beneficiario encontrado
  const [guardian, setGuardian] = useState(null);
  const [benefits, setBenefits] = useState([]);
  const [showFicha, setShowFicha] = useState(false);

  // Selección de beneficios para entregar
  const [checkedBenefitIds, setCheckedBenefitIds] = useState(new Set());

  // Foto y metadata
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [fotoBlob, setFotoBlob] = useState(null);
  const [fotoDataUrl, setFotoDataUrl] = useState(null);
  const [deliveryMeta, setDeliveryMeta] = useState(null);

  // Modal de éxito
  const [showSuccess, setShowSuccess] = useState(false);
  const [entregaExitosaData, setEntregaExitosaData] = useState(null);

  const isSubmittingRef = useRef(false);

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
      setSearchError('Por favor ingresa un número de RUT.');
      return;
    }

    setLoading(true);
    setSearchError('');
    setGuardian(null);
    setBenefits([]);
    setShowFicha(false);
    setCheckedBenefitIds(new Set());
    setFotoBlob(null);
    setFotoDataUrl(null);
    setDeliveryMeta(null);

    try {
      const data = await apiService.buscarPorRut(rutLimpio);
      if (!data.guardian || (data.benefits && data.benefits.length === 0)) {
        setSearchError(`No se encontraron registros activos para el RUT ${rutInput}`);
      } else {
        setGuardian(data.guardian);
        setBenefits(data.benefits || []);

        // Seleccionar los pendientes por defecto
        const initialSelected = new Set();
        (data.benefits || []).forEach((b) => {
          if (b.status === 'PENDING') {
            initialSelected.add(b.benefitId);
          }
        });
        setCheckedBenefitIds(initialSelected);
      }
    } catch (err) {
      setSearchError(err.message || 'Error al consultar beneficiario.');
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

  function handlePhotoCaptured(blob, dataUrl, meta) {
    setFotoBlob(blob);
    setFotoDataUrl(dataUrl);
    setDeliveryMeta(meta);
  }

  async function handleRegistrarEntrega() {
    if (isSubmittingRef.current || loading) return;

    if (checkedBenefitIds.size === 0) {
      alert('Debes seleccionar al menos un beneficio pendiente para realizar la entrega.');
      return;
    }
    if (!fotoBlob) {
      alert('Es obligatorio adjuntar la fotografía del acta física firmada.');
      setIsCameraOpen(true);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const benefitIdsArray = Array.from(checkedBenefitIds);
      const fechaNow = new Date().toLocaleTimeString('es-CL');
      const isOnline = navigator.onLine;

      let deliveredResults = [];
      let wasOffline = false;

      if (!isOnline) {
        await offlineStorage.savePendingDelivery({
          rut: guardian.rut,
          benefitIds: benefitIdsArray,
          actaBlob: fotoBlob,
          notes: 'Entrega en terreno (Modo Offline)',
          latitude: deliveryMeta?.location?.latitude || null,
          longitude: deliveryMeta?.location?.longitude || null,
          captured_at: deliveryMeta?.capturedAt || new Date().toISOString(),
        });
        wasOffline = true;
      } else {
        try {
          const res = await apiService.registrarEntrega({
            rut: guardian.rut,
            benefitIds: benefitIdsArray,
            actaFile: fotoBlob,
            notes: 'Entrega física en terreno',
            latitude: deliveryMeta?.location?.latitude || null,
            longitude: deliveryMeta?.location?.longitude || null,
            captured_at: deliveryMeta?.capturedAt || new Date().toISOString(),
            sync_status: 'SYNCED',
          });
          deliveredResults = res.deliveredBenefits || [];
        } catch (serverErr) {
          console.warn('Fallo de conexión, guardando en cola offline:', serverErr.message);
          await offlineStorage.savePendingDelivery({
            rut: guardian.rut,
            benefitIds: benefitIdsArray,
            actaBlob: fotoBlob,
            notes: 'Entrega física en terreno (Fallo temporal de conexión)',
            latitude: deliveryMeta?.location?.latitude || null,
            longitude: deliveryMeta?.location?.longitude || null,
            captured_at: deliveryMeta?.capturedAt || new Date().toISOString(),
          });
          wasOffline = true;
        }
      }

      // Actualizar estado local
      setBenefits((prev) =>
        prev.map((b) =>
          checkedBenefitIds.has(b.benefitId)
            ? { ...b, status: 'DELIVERED', deliveredAt: fechaNow }
            : b
        )
      );

      setEntregaExitosaData({
        guardianName: guardian.fullName,
        rut: guardian.rut,
        deliveredBenefits:
          deliveredResults.length > 0
            ? deliveredResults
            : benefits
                .filter((b) => checkedBenefitIds.has(b.benefitId))
                .map((b) => ({ studentName: b.student.fullName, benefitName: b.benefitName })),
        timestamp: fechaNow,
        location: deliveryMeta?.location,
        isOffline: wasOffline,
      });

      setShowSuccess(true);
      setCheckedBenefitIds(new Set());
      setFotoBlob(null);
      setFotoDataUrl(null);
      setDeliveryMeta(null);
    } catch (err) {
      alert(`Error al registrar entrega: ${err.message}`);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  const pendingList = benefits.filter((b) => b.status === 'PENDING');
  const pendingCount = pendingList.length;

  return (
    <div className="terreno-view-container">
      {!showFicha ? (
        /* PANTALLA 1: BÚSQUEDA Y TABLA PRELIMINAR */
        <div className="terreno-search-card">
          <div className="screen-header">
            <h2 className="screen-title">Búsqueda de Beneficiario</h2>
            <p className="screen-subtitle">
              Ingresa el RUT del apoderado o alumno para consultar beneficios disponibles
            </p>
          </div>

          <form onSubmit={ejecutarBusqueda} className="search-form-row">
            <div className="search-input-wrapper">
              <input
                type="text"
                className={`search-input-field ${
                  rutValidation ? (rutValidation.valid ? 'valid' : 'invalid') : ''
                }`}
                placeholder="Ej: 12.345.678-9"
                value={rutInput}
                onChange={handleRutChange}
              />
              <button
                type="submit"
                className="search-action-btn"
                disabled={loading}
                title="Buscar"
              >
                <Search size={18} />
              </button>
            </div>
            {rutValidation && (
              <span className={`rut-validation-msg ${rutValidation.valid ? 'valid' : 'invalid'}`}>
                {rutValidation.valid ? 'RUT con formato válido' : rutValidation.message}
              </span>
            )}
          </form>

          {searchError && <div className="terreno-msg-error">{searchError}</div>}

          {guardian && (
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
                  <tr className="clickable-row" onClick={() => setShowFicha(true)}>
                    <td>
                      <div className="row-name">{guardian.fullName}</div>
                      <div className="row-sub">
                        {benefits.length} beneficio{benefits.length !== 1 ? 's' : ''} asignado{benefits.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="row-rut">{guardian.rut}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-icon-circle ${pendingCount > 0 ? 'yellow' : 'green'}`}>
                        {pendingCount > 0 ? '−' : '✓'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* PANTALLA 2: FICHA DE BENEFICIARIO Y ENTREGA */
        <>
          <button type="button" className="btn-back-link" onClick={() => setShowFicha(false)}>
            ← Volver a la búsqueda
          </button>

          <div className="ficha-card">
            {/* Datos del Apoderado */}
            <div className="ficha-section">
              <h3 className="section-title">Datos del Apoderado</h3>
              <div className="ficha-grid">
                <div className="ficha-field">
                  <label>RUT</label>
                  <span>{guardian.rut}</span>
                </div>
                <div className="ficha-field">
                  <label>Nombre Completo</label>
                  <span>{guardian.fullName}</span>
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
                  <label>Teléfono</label>
                  <span>{guardian.phone || 'No registrado'}</span>
                </div>
                <div className="ficha-field">
                  <label>Correo</label>
                  <span>{guardian.email || 'No registrado'}</span>
                </div>
              </div>
            </div>

            <div className="ficha-divider" />

            {/* Alumnos y Beneficios Asignados */}
            <div className="ficha-section">
              <div className="section-header-flex">
                <h3 className="section-title">Alumnos y Beneficios Asignados</h3>
                {pendingCount > 1 && (
                  <button type="button" className="select-all-btn" onClick={toggleTodos}>
                    {checkedBenefitIds.size === pendingCount ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              <div className="alumnos-list">
                {benefits.map((b) => {
                  const isDelivered = b.status === 'DELIVERED';
                  const isSelected = checkedBenefitIds.has(b.benefitId);

                  return (
                    <div
                      key={b.benefitId}
                      className={`alumno-card-item ${isSelected ? 'selected' : ''} ${
                        isDelivered ? 'delivered' : ''
                      }`}
                      onClick={() => !isDelivered && toggleBenefitCheckbox(b.benefitId)}
                    >
                      {isDelivered ? (
                        <span className="badge-delivered-check" title="Entregado">
                          ✓
                        </span>
                      ) : (
                        <label
                          className="custom-checkbox-container"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBenefitCheckbox(b.benefitId)}
                          />
                          <span className="checkbox-checkmark" />
                        </label>
                      )}

                      <div className="alumno-details-col">
                        <div className="alumno-name-row">
                          <strong>{b.student.fullName}</strong>
                          <span className="alumno-rut-badge">{b.student.rut}</span>
                        </div>
                        <div className="alumno-meta-row">
                          <span>{b.student.establishment}</span>
                          <span>·</span>
                          <span>{b.student.educationalLevel}</span>
                        </div>
                        <div className="alumno-benefit-tag">{b.benefitName}</div>
                      </div>

                      <div>
                        {isDelivered ? (
                          <span className="status-badge-clean green">Entregado</span>
                        ) : (
                          <span className="status-badge-clean yellow">Pendiente</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Captura de Acta y Confirmación */}
            {pendingCount > 0 && (
              <>
                <div className="ficha-divider" />
                <div className="entrega-action-section">
                  {fotoDataUrl ? (
                    <div className="captured-preview-box">
                      <img src={fotoDataUrl} alt="Acta capturada" className="acta-preview-thumb" />
                      <div className="captured-meta">
                        <span>Acta fotografiada y optimizada</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => setIsCameraOpen(true)}
                        >
                          Cambiar fotografía
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-yellow full-width"
                      onClick={() => setIsCameraOpen(true)}
                    >
                      Capturar Acta Firmada
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary full-width"
                    onClick={handleRegistrarEntrega}
                    disabled={loading || checkedBenefitIds.size === 0 || !fotoBlob}
                    style={{ marginTop: '12px' }}
                  >
                    {loading
                      ? 'Registrando entrega…'
                      : `Confirmar Entrega (${checkedBenefitIds.size} seleccionados)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
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
        onClose={() => setShowSuccess(false)}
        data={entregaExitosaData}
      />
    </div>
  );
}
