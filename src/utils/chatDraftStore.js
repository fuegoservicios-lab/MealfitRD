const DB_NAME = 'mealfit-agent-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

let databasePromise = null;

const openDatabase = () => {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
            }
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
    return databasePromise;
};

const transact = async (mode, operation) => {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);
        let result = null;
        request.onsuccess = () => { result = request.result ?? null; };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Draft transaction aborted'));
    });
};

async function readBlobBytes(blob) {
    if (!(blob instanceof Blob)) return null;
    try {
        const buffer = typeof blob.arrayBuffer === 'function'
            ? await blob.arrayBuffer()
            : await new Response(blob).arrayBuffer();
        return buffer && buffer.byteLength > 0 ? buffer : null;
    } catch {
        return null;
    }
}

async function serializeDraftFile(value, index) {
    const buffer = await readBlobBytes(value);
    if (!buffer) return null;
    return {
        bytes: buffer,
        name: String(value?.name || `borrador-${index + 1}.jpg`),
        type: String(value?.type || 'image/jpeg') || 'image/jpeg',
        lastModified: Number.isFinite(value?.lastModified) ? value.lastModified : Date.now(),
    };
}

async function deserializeDraftFile(entry, index) {
    if (!entry) return null;
    if (entry instanceof Blob) {
        const buffer = await readBlobBytes(entry);
        if (!buffer) return null;
        return new File([buffer], (entry instanceof File && entry.name) || `borrador-${index + 1}.jpg`, {
            type: String(entry.type || 'image/jpeg') || 'image/jpeg',
            lastModified: entry instanceof File && Number.isFinite(entry.lastModified) ? entry.lastModified : Date.now(),
        });
    }
    const bytes = entry.bytes;
    const isBinary = bytes instanceof ArrayBuffer
        || ArrayBuffer.isView(bytes)
        || Object.prototype.toString.call(bytes) === '[object ArrayBuffer]';
    if (isBinary && Number(bytes.byteLength) > 0) {
        return new File([bytes], String(entry.name || `borrador-${index + 1}.jpg`), {
            type: String(entry.type || 'image/jpeg') || 'image/jpeg',
            lastModified: Number.isFinite(entry.lastModified) ? entry.lastModified : Date.now(),
        });
    }
    return null;
}

export async function loadChatDraft(sessionId) {
    if (!sessionId) return null;
    const draft = await transact('readonly', (store) => store.get(sessionId));
    if (!draft) return null;
    const files = (await Promise.all(Array.from(draft.files || []).slice(0, 4).map(deserializeDraftFile)))
        .filter(Boolean);
    if (!String(draft.text || '').trim() && !files.length) return null;
    return { ...draft, files };
}

export async function saveChatDraft(sessionId, { text = '', files = [] } = {}) {
    if (!sessionId) return;
    const serializedFiles = (
        await Promise.all(
            Array.from(files || [])
                .filter((file) => file instanceof Blob)
                .slice(0, 4)
                .map(serializeDraftFile),
        )
    ).filter(Boolean);
    if (!String(text).trim() && !serializedFiles.length) {
        await deleteChatDraft(sessionId);
        return;
    }
    await transact('readwrite', (store) => store.put({
        sessionId,
        text: String(text),
        files: serializedFiles,
        updatedAt: Date.now(),
    }));
}

export async function deleteChatDraft(sessionId) {
    if (!sessionId) return;
    await transact('readwrite', (store) => store.delete(sessionId));
}

export async function clearAllChatDrafts() {
    await transact('readwrite', (store) => store.clear());
}
