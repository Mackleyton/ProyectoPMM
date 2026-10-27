/**
 * Comprime una imagen (File o Blob) utilizando HTML5 Canvas
 * Reduce drásticamente el peso (de 8MB a ~150-250KB) manteniendo legibilidad para firmas y actas.
 * 
 * @param {File|Blob} file - Archivo de imagen original
 * @param {Object} options
 * @param {number} [options.maxWidth=1280] - Ancho máximo
 * @param {number} [options.maxHeight=1280] - Alto máximo
 * @param {number} [options.quality=0.78] - Calidad JPEG (0.1 a 1.0)
 * @returns {Promise<Blob>} Imagen comprimida en formato Blob JPEG
 */
export async function compressImage(file, { maxWidth = 1280, maxHeight = 1280, quality = 0.78 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Calcular nueva escala manteniendo la relación de aspecto
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file); // Fallback al original si falla el canvas
        }

        // Fondo blanco para prevenir transparencias oscuras al convertir a JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('No fue posible decodificar la imagen.'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Error al leer el archivo de fotografía.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Obtiene la geolocalización GPS del dispositivo si está disponible
 * @returns {Promise<{latitude: number|null, longitude: number|null, accuracy: number|null}>}
 */
export async function getDeviceLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve({ latitude: null, longitude: null, accuracy: null });
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        console.warn('Geolocalización no otorgada o no disponible:', err.message);
        resolve({ latitude: null, longitude: null, accuracy: null });
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });
}
