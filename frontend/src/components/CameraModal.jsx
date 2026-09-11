import { useState, useRef, useEffect, useCallback } from 'react';
import { compressImage } from '../utils/imageUtils';

export default function CameraModal({ isOpen, onClose, onPhotoCaptured }) {
  const [stream, setStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (trasera) o 'user' (frontal/webcam)

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Detener todos los tracks del stream activo
  const detenerCamara = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error deteniendo track:', e);
        }
      });
      setStream(null);
    }
  }, [stream]);

  // Enlazar el stream de video al elemento <video> de forma segura
  const attachStreamToVideo = useCallback((videoElement, mediaStream) => {
    if (!videoElement || !mediaStream) return;
    try {
      videoElement.srcObject = mediaStream;
      videoElement.setAttribute('playsinline', 'true');
      videoElement.muted = true;
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Autoplay bloqueado o demorado:', err);
        });
      }
    } catch (err) {
      console.warn('Error asignando srcObject:', err);
    }
  }, []);

  // Callback ref para el elemento <video>
  const setVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && stream) {
      attachStreamToVideo(node, stream);
    }
  }, [stream, attachStreamToVideo]);

  // Si el stream cambia, volver a enlazar
  useEffect(() => {
    if (videoRef.current && stream) {
      attachStreamToVideo(videoRef.current, stream);
    }
  }, [stream, attachStreamToVideo]);

  // Enumerar dispositivos de video disponibles (PC webcams o cámaras móviles)
  const listarCamaras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      return videoDevices;
    } catch {
      return [];
    }
  }, []);

  // Iniciar la cámara con tolerancia para PC y Móviles
  const iniciarCamara = useCallback(async (forcedDeviceId = null, preferredFacing = facingMode) => {
    setCameraError('');
    setIsInitializing(true);
    detenerCamara();

    // Validar compatibilidad WebRTC y HTTPS
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsInitializing(false);
      setCameraError(
        window.isSecureContext === false
          ? 'El acceso a la cámara requiere conexión segura (HTTPS). En Render esto funciona automáticamente con su certificado SSL.'
          : 'Tu navegador no soporta acceso directo a la cámara. Puedes utilizar la cámara nativa de tu dispositivo.'
      );
      return;
    }

    let mediaStream = null;

    try {
      // 1. Si tenemos un deviceId específico (ej: tras cambiar de cámara)
      if (forcedDeviceId) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: forcedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } else {
        // 2. Intento prioritario: Cámara según orientación ideal (trasera en móviles o frontal en PC)
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (idealErr) {
          console.warn('Fallo con facingMode ideal, intentando captura estándar sin restricciones:', idealErr);
          // 3. Fallback genérico para PC / laptops (webcams estándar que no soportan facingMode ni 720p estricto)
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      setStream(mediaStream);
      await listarCamaras();
    } catch (err) {
      console.warn('Error al iniciar cámara:', err);
      let msg = 'No se pudo activar la cámara.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permiso denegado. Concede acceso a la cámara en el ícono de permisos de tu navegador.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No se encontró ninguna cámara conectada en tu equipo.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'La cámara está siendo utilizada por otra aplicación (Zoom, Teams, Meet, etc.).';
      }
      setCameraError(msg);
    } finally {
      setIsInitializing(false);
    }
  }, [detenerCamara, facingMode, listarCamaras]);

  // Al abrir el modal
  useEffect(() => {
    if (isOpen) {
      setCapturedPhoto(null);
      iniciarCamara();
    } else {
      detenerCamara();
      setCapturedPhoto(null);
      setCameraError('');
    }
    return () => detenerCamara();
  }, [isOpen]);

  // Alternar entre cámaras disponibles (Trasera <-> Frontal en móviles, o Webcams en PC)
  const alternarCamara = async () => {
    if (availableCameras.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % availableCameras.length;
      setCurrentCameraIndex(nextIndex);
      const targetDevice = availableCameras[nextIndex];
      await iniciarCamara(targetDevice.deviceId);
    } else {
      // Si el navegador no dio nombres de dispositivos aún, alternar facingMode
      const newFacing = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newFacing);
      await iniciarCamara(null, newFacing);
    }
  };

  // Capturar frame actual del video a Canvas
  const tomarFoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    if (width === 0 || height === 0) {
      alert('La cámara se está iniciando, espera un instante antes de capturar.');
      return;
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    // Siempre capturar sin efecto espejo para que el texto y firmas del acta sean legibles
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const file = new File([blob], `acta_firmada_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedPhoto({ file, dataUrl });
        detenerCamara();
      },
      'image/jpeg',
      0.85
    );
  };

  // Manejar selección de foto desde archivo o cámara nativa con compresión automática
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsInitializing(true);
      const compressed = await compressImage(file, 1600, 0.85);
      setCapturedPhoto({
        file: compressed.file,
        dataUrl: compressed.dataUrl,
      });
      detenerCamara();
    } catch (err) {
      console.warn('Error comprimiendo imagen:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhoto({
          file,
          dataUrl: event.target.result,
        });
        detenerCamara();
      };
      reader.readAsDataURL(file);
    } finally {
      setIsInitializing(false);
      if (e.target) e.target.value = '';
    }
  };

  const repetirFoto = () => {
    setCapturedPhoto(null);
    iniciarCamara();
  };

  const confirmarFoto = () => {
    if (capturedPhoto) {
      onPhotoCaptured(capturedPhoto.file, capturedPhoto.dataUrl);
      onClose();
    }
  };

  if (!isOpen) return null;

  const isFrontCamera = facingMode === 'user';

  return (
    <div className="camera-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="camera-modal-container">
        {/* Cabecera del Modal */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <span className="camera-icon-badge">📷</span>
            <div>
              <h3>Captura de Acta Física Firmada</h3>
              <p>Funciona con la cámara de tu móvil, tablet o webcam de PC</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="camera-modal-body">
          {capturedPhoto ? (
            /* Vista previa de foto capturada */
            <div className="photo-preview-wrap">
              <img src={capturedPhoto.dataUrl} alt="Acta capturada" className="photo-preview-img" />
              <div className="photo-preview-badge">✓ Fotografía lista para asociar</div>
            </div>
          ) : (
            /* Visor de video en vivo */
            <div className="live-camera-wrap">
              {isInitializing && (
                <div className="camera-loading-overlay">
                  <div className="camera-spinner" />
                  <span>Iniciando cámara…</span>
                </div>
              )}

              {stream ? (
                <>
                  <video
                    ref={setVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`live-camera-video ${isFrontCamera ? 'mirrored' : ''}`}
                  />
                  {/* Guía visual para encuadrar documento */}
                  <div className="acta-guide-overlay">
                    <div className="acta-guide-box">
                      <div className="guide-corner tl" />
                      <div className="guide-corner tr" />
                      <div className="guide-corner bl" />
                      <div className="guide-corner br" />
                      <span className="guide-text">Encuadre el acta firmada aquí</span>
                    </div>
                  </div>
                </>
              ) : (
                !isInitializing && (
                  <div className="camera-fallback-box">
                    <div className="fallback-icon">📸</div>
                    <h4>Cámara no disponible directamente</h4>
                    {cameraError && <p className="fallback-warning">{cameraError}</p>}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📁 Abrir Cámara Nativa o Galería
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {/* Input para fallback de cámara nativa en móviles y selector de archivos en PC */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

        {/* Pie del Modal con Acciones */}
        <div className="camera-modal-footer">
          {capturedPhoto ? (
            <>
              <button type="button" className="btn btn-outline" onClick={repetirFoto}>
                🔄 Repetir Foto
              </button>
              <button type="button" className="btn btn-warning" onClick={confirmarFoto}>
                ✓ Usar Esta Fotografía
              </button>
            </>
          ) : (
            <>
              {/* Botón para cambiar de cámara si hay más de 1 dispositivo o para alternar frontal/trasera */}
              {stream && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={alternarCamara}
                  title="Cambiar entre cámara trasera y frontal, o cambiar de webcam"
                >
                  🔄 Cambiar Cámara
                </button>
              )}

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Galería / Archivo
              </button>

              {stream && (
                <button
                  type="button"
                  className="btn btn-warning btn-shutter"
                  onClick={tomarFoto}
                  disabled={isInitializing}
                >
                  <span className="shutter-circle" /> Capturar Acta
                </button>
              )}

              <button type="button" className="btn btn-gray" onClick={onClose}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
