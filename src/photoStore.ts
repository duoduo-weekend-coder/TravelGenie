/**
 * IndexedDB-backed photo store.
 * Keeps base64 photo data out of localStorage (5MB limit)
 * and in IndexedDB (hundreds of MB capacity).
 */

const DB_NAME = 'travel-photos';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGet(db: IDBDatabase, key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

function txPut(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function isBase64(url: string): boolean {
  return url.startsWith('data:');
}

interface PhotoFields {
  imageUrl?: string;
  googlePlacePhoto?: string;
}

/**
 * Save base64 photos from items into IndexedDB.
 * Returns a map of itemId → stripped fields (empty strings replacing base64).
 */
export async function savePhotos(
  items: { id: string; imageUrl?: string; googlePlacePhoto?: string }[]
): Promise<void> {
  const db = await openDB();
  for (const item of items) {
    const photos: PhotoFields = {};
    let hasPhoto = false;
    if (item.imageUrl && isBase64(item.imageUrl)) {
      photos.imageUrl = item.imageUrl;
      hasPhoto = true;
    }
    if (item.googlePlacePhoto && isBase64(item.googlePlacePhoto)) {
      photos.googlePlacePhoto = item.googlePlacePhoto;
      hasPhoto = true;
    }
    if (hasPhoto) {
      await txPut(db, item.id, JSON.stringify(photos));
    }
  }
  db.close();
}

/**
 * Load photos from IndexedDB and merge them into items.
 * Mutates items in-place for efficiency.
 */
export async function loadPhotos(
  items: { id: string; imageUrl?: string; googlePlacePhoto?: string }[]
): Promise<void> {
  const db = await openDB();
  for (const item of items) {
    const raw = await txGet(db, item.id);
    if (raw) {
      try {
        const photos: PhotoFields = JSON.parse(raw);
        if (photos.imageUrl && !item.imageUrl) item.imageUrl = photos.imageUrl;
        if (photos.googlePlacePhoto && !item.googlePlacePhoto) item.googlePlacePhoto = photos.googlePlacePhoto;
      } catch { /* ignore corrupt entries */ }
    }
  }
  db.close();
}

/**
 * Delete photos for given item IDs from IndexedDB.
 */
export async function deletePhotos(itemIds: string[]): Promise<void> {
  const db = await openDB();
  for (const id of itemIds) {
    await txDelete(db, id);
  }
  db.close();
}

/**
 * Strip base64 photos from a trip object, returning a lightweight copy
 * suitable for localStorage. Does NOT mutate the original.
 */
export function stripPhotosForStorage<T extends { id: string; imageUrl?: string; googlePlacePhoto?: string }>(
  items: T[]
): T[] {
  return items.map(item => {
    const stripped = { ...item };
    if (stripped.imageUrl && isBase64(stripped.imageUrl)) stripped.imageUrl = '';
    if (stripped.googlePlacePhoto && isBase64(stripped.googlePlacePhoto)) stripped.googlePlacePhoto = '';
    return stripped;
  });
}
