import { useState, useRef, useEffect } from 'react';

export default function CameraModal({ isOpen, onClose, onPhotoCaptured }) {
  const [stream, setStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Iniciar cámara cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      iniciarCamara();
    } else {
      detenerCamara();
      setCapturedPhoto(null);
      setCameraError('');
    }
    return () => detenerCamara();
  }, [isOpen]);

  async function iniciarCamara() {
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador no soporta acceso directo a cámara WebRTC');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setIsLiveCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('No se pudo acceder a la cámara en vivo:', err);
      setIsLiveCameraActive(false);
      setCameraError(
        'No se detectó cámara activa o no se otorgaron permisos. Puedes usar el selector de cámara nativo del dispositivo.'
      );
    }
  }

  function detenerCamara() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsLiveCameraActive(false);
  }

  function tomarFoto() {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const file = new File([blob], `acta_firmada_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedPhoto({ file, dataUrl });
        detenerCamara();
      },
      'image/jpeg',
      0.9
    );
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedPhoto({
        file,
        dataUrl: event.target.result,
      });
      detenerCamara();
    };
    reader.readAsDataURL(file);
  }

  function repetirFoto() {
    setCapturedPhoto(null);
    iniciarCamara();
  }

  function confirmarFoto() {
    if (capturedPhoto) {
      onPhotoCaptured(capturedPhoto.file, capturedPhoto.dataUrl);
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="camera-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="camera-modal-container">
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <span className="camera-icon-badge">📷</span>
            <div>
              <h3>Captura de Acta Física Firmada</h3>
              <p>Asegura buena iluminación y que la firma sea legible</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="camera-modal-body">
          {/* Vista previa de foto capturada */}
          {capturedPhoto ? (
            <div className="photo-preview-wrap">
              <img src={capturedPhoto.dataUrl} alt="Acta capturada" className="photo-preview-img" />
              <div className="photo-preview-badge">✓ Captura lista para asociar</div>
            </div>
          ) : (
            /* Visor de cámara en vivo o fallback */
            <div className="live-camera-wrap">
              {isLiveCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="live-camera-video"
                    onLoadedMetadata={() => videoRef.current?.play()}
                  />
                  {/* Guía visual de encuadre para acta tamaño carta/oficio */}
                  <div className="acta-guide-overlay">
                    <div className="acta-guide-box">
                      <div className="guide-corner tl" />
                      <div className="guide-corner tr" />
                      <div className="guide-corner bl" />
                      <div className="guide-corner br" />
                      <span className="guide-text">Encuadre el Acta de Entrega aquí</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="camera-fallback-box">
                  <div className="fallback-icon">📄</div>
                  <h4>Dispositivo listo para captura</h4>
                  {cameraError && <p className="fallback-warning">{cameraError}</p>}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📸 Abrir Cámara del Teléfono
                  </button>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

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
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Galería / Archivo
              </button>
              {isLiveCameraActive && (
                <button type="button" className="btn btn-warning btn-shutter" onClick={tomarFoto}>
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
