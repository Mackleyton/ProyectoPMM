import { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, Upload } from 'lucide-react';
import { compressImage, getDeviceLocation } from '../utils/imageUtils';

export default function CameraModal({ isOpen, onClose, onPhotoCaptured }) {
  const [stream, setStream] = useState(null);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [location, setLocation] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
      getDeviceLocation().then((loc) => setLocation(loc));
    } else {
      stopCamera();
      setPhotoDataUrl(null);
      setPhotoBlob(null);
      setCameraError('');
      setLocation(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  async function startCamera() {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Cámara no accesible:', err.message);
      setCameraError('No se pudo acceder a la cámara directamente. Puedes usar el botón para subir una fotografía desde tus archivos.');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }

  async function processCapturedBlob(rawBlob) {
    setIsCompressing(true);
    try {
      const compressed = await compressImage(rawBlob, { maxWidth: 1280, maxHeight: 1280, quality: 0.78 });
      const dataUrl = URL.createObjectURL(compressed);
      setPhotoBlob(compressed);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      console.error('Error al procesar foto:', err);
    } finally {
      setIsCompressing(false);
    }
  }

  function takeSnapshot() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          processCapturedBlob(blob);
          stopCamera();
        }
      },
      'image/jpeg',
      0.9
    );
  }

  function handleFileSelected(e) {
    const file = e.target.files[0];
    if (file) {
      processCapturedBlob(file);
      stopCamera();
    }
  }

  function handleConfirm() {
    if (photoBlob) {
      onPhotoCaptured(photoBlob, photoDataUrl, {
        location,
        capturedAt: new Date().toISOString(),
      });
      onClose();
    }
  }

  function retakePhoto() {
    setPhotoDataUrl(null);
    setPhotoBlob(null);
    startCamera();
  }

  if (!isOpen) return null;

  return (
    <div className="camera-modal-backdrop">
      <div className="camera-modal-container">
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <div className="camera-icon-badge">📷</div>
            <div>
              <h3>Captura de Acta Firmada</h3>
              <p>Encuadra el documento dentro de la guía y presiona capturar</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        <div className="camera-modal-body">
          {!photoDataUrl ? (
            <div className="live-camera-wrap">
              {cameraError ? (
                <div className="camera-loading-overlay">
                  <p style={{ textAlign: 'center', padding: '0 16px' }}>{cameraError}</p>
                  <button
                    type="button"
                    className="btn btn-yellow"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={16} /> Subir desde archivo
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="live-camera-video"
                    onLoadedMetadata={() => videoRef.current?.play()}
                  />
                  <div className="acta-guide-overlay">
                    <div className="acta-guide-box">
                      <span className="guide-corner tl" />
                      <span className="guide-corner tr" />
                      <span className="guide-corner bl" />
                      <span className="guide-corner br" />
                      <span className="guide-text">Encuadra el acta física aquí</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="live-camera-wrap">
              <img
                src={photoDataUrl}
                alt="Vista previa del acta"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              {isCompressing && (
                <div className="camera-loading-overlay">
                  <div className="camera-spinner" />
                  <span>Optimizando acta…</span>
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

        <div className="camera-modal-footer" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          {!photoDataUrl ? (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} /> Subir archivo
              </button>
              {!cameraError && (
                <button
                  type="button"
                  className="btn btn-yellow btn-shutter"
                  onClick={takeSnapshot}
                >
                  <span className="shutter-circle" />
                  <span>Tomar Fotografía</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={retakePhoto}
                disabled={isCompressing}
              >
                <RefreshCw size={15} /> Volver a tomar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={isCompressing || !photoBlob}
              >
                <Check size={16} /> Confirmar Fotografía
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
