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

export async function loadChatDraft(sessionId) {
    if (!sessionId) return null;
    return transact('readonly', (store) => store.get(sessionId));
}

export async function saveChatDraft(sessionId, { text = '', files = [] } = {}) {
    if (!sessionId) return;
    const usableFiles = Array.from(files || []).filter((file) => file instanceof Blob).slice(0, 4);
    if (!String(text).trim() && !usableFiles.length) {
        await deleteChatDraft(sessionId);
        return;
    }
    await transact('readwrite', (store) => store.put({
        sessionId,
        text: String(text),
        files: usableFiles,
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
