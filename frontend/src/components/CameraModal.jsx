import { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, Upload, AlertCircle, MapPin, Clock } from 'lucide-react';
import { compressImage, getDeviceLocation } from '../utils/imageUtils';

export default function CameraModal({ isOpen, onClose, onPhotoCaptured }) {
  const [stream, setStream] = useState(null);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [location, setLocation] = useState(null);
  const [captureTime, setCaptureTime] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
      // Iniciar captura de coordenadas GPS en paralelo
      getDeviceLocation().then((loc) => setLocation(loc));
    } else {
      stopCamera();
      setPhotoDataUrl(null);
      setPhotoBlob(null);
      setCameraError('');
      setLocation(null);
      setCaptureTime(null);
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
      setCameraError('No se pudo acceder a la cámara directamente. Puedes usar el botón para seleccionar o tomar una foto desde tu galería.');
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
      const now = new Date();
      setCaptureTime(now.toLocaleTimeString('es-CL'));

      // Compresión en cliente
      const compressedBlob = await compressImage(rawBlob, { maxWidth: 1280, maxHeight: 1280, quality: 0.78 });
      const dataUrl = URL.createObjectURL(compressedBlob);

      setPhotoBlob(compressedBlob);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      console.error('Error al comprimir fotografía:', err);
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
    setCaptureTime(null);
    startCamera();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content camera-modal">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Camera size={20} />
            <h3>Captura de Acta Física Firmada</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        <div className="camera-view-container">
          {!photoDataUrl ? (
            <>
              {cameraError ? (
                <div className="camera-error-box">
                  <AlertCircle size={36} className="error-icon" />
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    <span>Seleccionar foto del dispositivo</span>
                  </button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="camera-video-stream"
                  onLoadedMetadata={() => videoRef.current?.play()}
                />
              )}
            </>
          ) : (
            <div className="photo-preview-wrapper">
              <img src={photoDataUrl} alt="Vista previa del acta" className="captured-photo-img" />
              {isCompressing && (
                <div className="compression-overlay">
                  <RefreshCw size={24} className="spin-anim" />
                  <span>Optimizando fotografía…</span>
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

        {/* Metadatos en vivo */}
        <div className="camera-meta-info-row">
          <div className="meta-pill">
            <Clock size={14} />
            <span>{captureTime ? `Hora: ${captureTime}` : 'Hora actual'}</span>
          </div>
          <div className="meta-pill">
            <MapPin size={14} />
            <span>
              {location?.latitude
                ? `GPS: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                : 'GPS: Adquiriendo señal…'}
            </span>
          </div>
        </div>

        <div className="modal-footer camera-footer">
          {!photoDataUrl ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                <span>Subir archivo</span>
              </button>
              {!cameraError && (
                <button type="button" className="btn btn-primary btn-capture" onClick={takeSnapshot}>
                  <Camera size={18} />
                  <span>Capturar Acta</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={retakePhoto} disabled={isCompressing}>
                <RefreshCw size={16} />
                <span>Volver a tomar</span>
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleConfirm}
                disabled={isCompressing || !photoBlob}
              >
                <Check size={18} />
                <span>Confirmar Fotografía</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
