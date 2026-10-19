import { useState, useRef, useEffect } from 'react';
import {
  Search,
  Camera,
  CheckSquare,
  Square,
  Check,
  AlertCircle,
  MapPin,
  Clock,
  User,
  Home,
  GraduationCap,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  RotateCw,
  Save,
  WifiOff,
} from 'lucide-react';
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

  // Datos del apoderado y sus beneficios
  const [guardian, setGuardian] = useState(null);
  const [benefits, setBenefits] = useState([]);
  const [checkedBenefitIds, setCheckedBenefitIds] = useState(new Set());

  // Foto y metadata del acta
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
      setSearchError('Por favor ingresa un número de RUT');
      return;
    }

    setLoading(true);
    setSearchError('');
    setGuardian(null);
    setBenefits([]);
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

        // Preseleccionar los beneficios en estado PENDING
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
        // MODO OFFLINE: Guardar en cola IndexedDB
        await offlineStorage.savePendingDelivery({
          rut: guardian.rut,
          benefitIds: benefitIdsArray,
          actaBlob: fotoBlob,
          notes: 'Entrega física en terreno (Modo Offline)',
          latitude: deliveryMeta?.location?.latitude || null,
          longitude: deliveryMeta?.location?.longitude || null,
          captured_at: deliveryMeta?.capturedAt || new Date().toISOString(),
        });
        wasOffline = true;
      } else {
        // En línea: Intentar enviar al backend
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
          console.warn('Fallo de red con el servidor, guardando en cola offline:', serverErr.message);
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

      // Actualizar estado visual de los beneficios en pantalla
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
      alert(`Error al registrar la entrega: ${err.message}`);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  const pendingBenefits = benefits.filter((b) => b.status === 'PENDING');
  const deliveredBenefitsList = benefits.filter((b) => b.status === 'DELIVERED');

  return (
    <div className="terreno-view-container">
      {/* TARJETA DE BÚSQUEDA */}
      <div className="search-card">
        <div className="search-card-header">
          <Search size={22} className="header-icon" />
          <div>
            <h2>Consulta y Entrega de Beneficios</h2>
            <p className="subtitle">
              Ingresa el RUT del apoderado o del estudiante para consultar y registrar el acta física.
            </p>
          </div>
        </div>

        <form onSubmit={ejecutarBusqueda} className="search-form-row">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Ej. 12.345.678-9"
              value={rutInput}
              onChange={handleRutChange}
              className="rut-large-input"
              maxLength={12}
            />
            {rutValidation && (
              <span className={`rut-validation-badge ${rutValidation.valid ? 'valid' : 'invalid'}`}>
                {rutValidation.valid ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{rutValidation.valid ? 'RUT Válido' : rutValidation.message}</span>
              </span>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-search"
            disabled={loading || !rutInput.trim()}
          >
            <Search size={18} />
            <span>{loading ? 'Consultando…' : 'Buscar'}</span>
          </button>
        </form>

        {searchError && (
          <div className="search-error-alert">
            <AlertCircle size={18} />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* INFORMACIÓN DEL APODERADO */}
      {guardian && (
        <div className="guardian-profile-card">
          <div className="guardian-profile-header">
            <div className="guardian-avatar-badge">
              <User size={24} />
            </div>
            <div className="guardian-titles">
              <h3 className="guardian-name">{guardian.fullName}</h3>
              <span className="guardian-rut-pill">RUT {guardian.rut}</span>
            </div>
          </div>

          <div className="guardian-details-grid">
            <div className="detail-item">
              <Home size={15} />
              <div>
                <span className="label">Dirección</span>
                <span className="value">{guardian.address || 'Quilpué'}</span>
              </div>
            </div>
            <div className="detail-item">
              <MapPin size={15} />
              <div>
                <span className="label">Sector Comunal</span>
                <span className="value">{guardian.sector || 'CENTRO'}</span>
              </div>
            </div>
            <div className="detail-item">
              <Phone size={15} />
              <div>
                <span className="label">Teléfono</span>
                <span className="value">{guardian.phone || 'No registrado'}</span>
              </div>
            </div>
            <div className="detail-item">
              <Mail size={15} />
              <div>
                <span className="label">Correo Electrónico</span>
                <span className="value">{guardian.email || 'No registrado'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LISTADO DE BENEFICIOS ASIGNADOS */}
      {guardian && (
        <div className="benefits-section-card">
          <div className="benefits-section-header">
            <div>
              <h3>Beneficios Escolares Asignados</h3>
              <p className="subtitle">
                Marca los beneficios a entregar y adjunta la fotografía del acta física firmada.
              </p>
            </div>
            {pendingBenefits.length > 1 && (
              <button type="button" className="btn btn-sm btn-outline" onClick={toggleTodos}>
                {checkedBenefitIds.size === pendingBenefits.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            )}
          </div>

          <div className="benefits-list">
            {benefits.map((b) => {
              const isDelivered = b.status === 'DELIVERED';
              const isChecked = checkedBenefitIds.has(b.benefitId);

              return (
                <div
                  key={b.benefitId}
                  className={`benefit-row-card ${isDelivered ? 'delivered' : 'pending'}`}
                  onClick={() => !isDelivered && toggleBenefitCheckbox(b.benefitId)}
                >
                  <div className="benefit-check-column">
                    {isDelivered ? (
                      <span className="badge-delivered-check" title="Entregado">
                        <Check size={16} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`checkbox-toggle-btn ${isChecked ? 'checked' : ''}`}
                        aria-label="Seleccionar beneficio"
                      >
                        {isChecked ? <CheckSquare size={20} /> : <Square size={20} />}
                      </button>
                    )}
                  </div>

                  <div className="benefit-info-column">
                    <div className="student-name">
                      <GraduationCap size={16} />
                      <span>{b.student.fullName}</span>
                      <small className="student-rut">({b.student.rut})</small>
                    </div>
                    <div className="benefit-meta-line">
                      <span className="benefit-badge-name">{b.benefitName}</span>
                      <span className="benefit-school">{b.student.establishment}</span>
                    </div>
                  </div>

                  <div className="benefit-status-column">
                    {isDelivered ? (
                      <div className="delivered-tag">
                        <CheckCircle2 size={15} />
                        <span>Entregado {b.deliveredAt ? `(${b.deliveredAt})` : ''}</span>
                      </div>
                    ) : (
                      <span className="pending-tag">Pendiente de entrega</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ZONA DE EVIDENCIA Y REGISTRO DE ENTREGA */}
          {pendingBenefits.length > 0 && (
            <div className="delivery-action-panel">
              <div className="action-panel-info">
                <h4>Respaldo de Entrega con Acta Física</h4>
                <p>
                  El funcionario debe entregar el beneficio, solicitar la firma física en el acta y fotografiarla.
                </p>
              </div>

              <div className="photo-status-box">
                {fotoDataUrl ? (
                  <div className="photo-preview-thumbnail-row">
                    <img src={fotoDataUrl} alt="Acta capturada" className="acta-thumbnail" />
                    <div className="thumbnail-meta">
                      <span className="badge-success-photo">
                        <Check size={14} /> Acta fotografiada y comprimida
                      </span>
                      {deliveryMeta?.location?.latitude && (
                        <small className="geo-meta">
                          <MapPin size={12} /> Coordenadas: {deliveryMeta.location.latitude.toFixed(4)},{' '}
                          {deliveryMeta.location.longitude.toFixed(4)}
                        </small>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        onClick={() => setIsCameraOpen(true)}
                      >
                        Cambiar fotografía
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-yellow btn-capture-acta"
                    onClick={() => setIsCameraOpen(true)}
                  >
                    <Camera size={18} />
                    <span>Tomar o Subir Foto del Acta Firmada</span>
                  </button>
                )}
              </div>

              <div className="action-submit-row">
                <button
                  type="button"
                  className="btn btn-success btn-lg btn-confirm-delivery"
                  onClick={handleRegistrarEntrega}
                  disabled={loading || checkedBenefitIds.size === 0 || !fotoBlob}
                >
                  <Save size={18} />
                  <span>
                    {loading
                      ? 'Registrando entrega…'
                      : `Confirmar Entrega (${checkedBenefitIds.size} seleccionados)`}
                  </span>
                </button>
              </div>
            </div>
          )}
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
        onClose={() => setShowSuccess(false)}
        data={entregaExitosaData}
      />
    </div>
  );
}
