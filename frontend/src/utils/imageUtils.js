/**
 * Utilidades para procesamiento, redimensionamiento y compresión de fotografías de actas
 */

/**
 * Comprime y redimensiona una imagen en el cliente antes de enviarla al servidor.
 * Convierte fotos pesadas de teléfonos móviles (6MB-15MB) a JPEG optimizado (~200KB-400KB),
 * manteniendo total legibilidad de firmas y evitando timeouts o errores de payload en Render.
 *
 * @param {File|Blob} fileOrBlob
 * @param {number} maxDimension - Dimensión máxima en píxeles (default: 1600)
 * @param {number} quality - Calidad de compresión JPEG (default: 0.85)
 * @returns {Promise<{ file: File, dataUrl: string }>}
 */
export function compressImage(fileOrBlob, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!fileOrBlob) {
      return reject(new Error('No se proporcionó ningún archivo de imagen'));
    }

    const reader = new FileReader();
    reader.onerror = () => {
      // Fallback seguro
      const fallbackFile =
        fileOrBlob instanceof File
          ? fileOrBlob
          : new File([fileOrBlob], `acta_${Date.now()}.jpg`, { type: 'image/jpeg' });
      resolve({ file: fallbackFile, dataUrl: '' });
    };

    reader.onload = (e) => {
      const dataUri = e.target.result;
      const img = new Image();

      img.onerror = () => {
        // En caso de error cargando el tag Image (ej. formato exótico), devolver original
        const fallbackFile =
          fileOrBlob instanceof File
            ? fileOrBlob
            : new File([fileOrBlob], `acta_${Date.now()}.jpg`, { type: 'image/jpeg' });
        resolve({ file: fallbackFile, dataUrl: dataUri });
      };

      img.onload = () => {
        let width = img.width || 1280;
        let height = img.height || 720;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Limpiar fondo a blanco por si tiene transparencias (PNG)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Dibujar imagen redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              const fallback =
                fileOrBlob instanceof File
                  ? fileOrBlob
                  : new File([fileOrBlob], `acta_${Date.now()}.jpg`, { type: 'image/jpeg' });
              return resolve({ file: fallback, dataUrl: dataUri });
            }

            const rawName = fileOrBlob instanceof File && fileOrBlob.name ? fileOrBlob.name : '';
            const baseName = rawName ? rawName.replace(/\.[^/.]+$/, '') : `acta_${Date.now()}`;
            const compressedFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

            resolve({ file: compressedFile, dataUrl: compressedDataUrl });
          },
          'image/jpeg',
          quality
        );
      };

      img.src = dataUri;
    };

    reader.readAsDataURL(fileOrBlob);
  });
}
