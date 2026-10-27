const DB_NAME = 'beneficios_quilpue_db';
const DB_VERSION = 1;
const STORE_DELIVERIES = 'pending_deliveries';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_DELIVERIES)) {
        db.createObjectStore(STORE_DELIVERIES, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const offlineStorage = {
  /**
   * Encola una entrega para sincronización posterior
   */
  async savePendingDelivery(delivery) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DELIVERIES, 'readwrite');
      const store = tx.objectStore(STORE_DELIVERIES);
      const item = {
        ...delivery,
        queuedAt: new Date().toISOString(),
      };
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Obtiene todas las entregas pendientes de sincronizar
   */
  async getPendingDeliveries() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DELIVERIES, 'readonly');
      const store = tx.objectStore(STORE_DELIVERIES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Elimina una entrega de la cola tras sincronizarse con éxito
   */
  async removePendingDelivery(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DELIVERIES, 'readwrite');
      const store = tx.objectStore(STORE_DELIVERIES);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Cuenta cuántas entregas están pendientes
   */
  async countPendingDeliveries() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DELIVERIES, 'readonly');
      const store = tx.objectStore(STORE_DELIVERIES);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  },

  /**
   * Sincroniza todas las entregas pendientes contra el backend
   */
  async syncAllPending(apiService) {
    const pending = await this.getPendingDeliveries();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await apiService.registrarEntrega({
          rut: item.rut,
          benefitIds: item.benefitIds,
          actaFile: item.actaBlob,
          notes: item.notes,
          latitude: item.latitude,
          longitude: item.longitude,
          captured_at: item.captured_at,
          sync_status: 'OFFLINE_SYNCED',
        });

        await this.removePendingDelivery(item.id);
        synced++;
      } catch (err) {
        console.warn(`Error sincronizando entrega ID ${item.id}:`, err.message);
        failed++;
      }
    }

    return { synced, failed };
  },
};
