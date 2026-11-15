import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChatAttachments } from '../hooks/useChatAttachments';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const _agentPagePath = path.resolve(_dir, '../pages/AgentPage.jsx');

function installMockIndexedDB() {
    const records = new Map();
    const fireAsync = (fn) => Promise.resolve().then(fn);

    const makeRequest = (exec) => {
        const req = { result: null, error: null, onsuccess: null, onerror: null };
        fireAsync(() => {
            try {
                req.result = exec();
                req.onsuccess?.({ target: req });
            } catch (err) {
                req.error = err;
                req.onerror?.({ target: req });
            }
        });
        return req;
    };

    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: vi.fn(),
        close: vi.fn(),
        onversionchange: null,
        transaction: () => {
            const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
            const store = {
                get: (key) => {
                    const req = makeRequest(() => records.get(key) ?? undefined);
                    fireAsync(() => fireAsync(() => tx.oncomplete?.()));
                    return req;
                },
                put: (value) => {
                    const req = makeRequest(() => {
                        records.set(value.sessionId, value);
                        return value.sessionId;
                    });
                    fireAsync(() => fireAsync(() => tx.oncomplete?.()));
                    return req;
                },
                delete: (key) => {
                    const req = makeRequest(() => {
                        records.delete(key);
                        return undefined;
                    });
                    fireAsync(() => fireAsync(() => tx.oncomplete?.()));
                    return req;
                },
                clear: () => {
                    const req = makeRequest(() => {
                        records.clear();
                        return undefined;
                    });
                    fireAsync(() => fireAsync(() => tx.oncomplete?.()));
                    return req;
                },
            };
            return {
                objectStore: () => store,
                set oncomplete(cb) { tx.oncomplete = cb; },
                get oncomplete() { return tx.oncomplete; },
                set onerror(cb) { tx.onerror = cb; },
                set onabort(cb) { tx.onabort = cb; },
            };
        },
    };

    globalThis.indexedDB = {
        open: () => {
            const req = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
            fireAsync(() => {
                req.onsuccess?.({ target: req });
            });
            return req;
        },
    };
    return records;
}

describe('chatDraftStore binary persistence & recovery', () => {
    const originalIndexedDB = globalThis.indexedDB;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        globalThis.indexedDB = originalIndexedDB;
    });

    it('serializa los archivos a ArrayBuffer en saveChatDraft y reconstruye File en loadChatDraft', async () => {
        const records = installMockIndexedDB();
        const { saveChatDraft, loadChatDraft } = await import('../utils/chatDraftStore');

        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
        const file = new File([bytes], 'jugo-cena.jpg', { type: 'image/jpeg', lastModified: 1700000000000 });

        await saveChatDraft('sess-1', { text: 'Este jugo fue parte de la cena', files: [file] });

        const rawRecord = records.get('sess-1');
        expect(rawRecord).toBeTruthy();
        expect(rawRecord.files).toHaveLength(1);
        expect(rawRecord.files[0]).not.toBeInstanceOf(Blob);
        expect(rawRecord.files[0].bytes).toBeInstanceOf(ArrayBuffer);
        expect(rawRecord.files[0].name).toBe('jugo-cena.jpg');
        expect(rawRecord.files[0].type).toBe('image/jpeg');

        const loaded = await loadChatDraft('sess-1');
        expect(loaded.text).toBe('Este jugo fue parte de la cena');
        expect(loaded.files).toHaveLength(1);
        expect(loaded.files[0]).toBeInstanceOf(File);
        expect(loaded.files[0].name).toBe('jugo-cena.jpg');
        expect(loaded.files[0].size).toBe(bytes.byteLength);
        const loadedBytes = new Uint8Array(await loaded.files[0].arrayBuffer());
        expect(Array.from(loadedBytes)).toEqual(Array.from(bytes));
    });

    it('descarta Blobs corruptos o vacios al guardar y al cargar borradores heredados', async () => {
        const records = installMockIndexedDB();
        const { saveChatDraft, loadChatDraft } = await import('../utils/chatDraftStore');

        const emptyBlob = new File([], 'vacio.jpg', { type: 'image/jpeg' });
        const brokenBlob = new File([new Uint8Array([1, 2, 3])], 'roto.jpg', { type: 'image/jpeg' });
        brokenBlob.arrayBuffer = () => Promise.reject(new DOMException('NotReadableError'));

        await saveChatDraft('sess-broken', { text: '', files: [emptyBlob, brokenBlob] });
        expect(records.has('sess-broken')).toBe(false);

        // Simula borrador legado guardado con un Blob WebKit ilegible + otro vacio y sin texto
        records.set('sess-legacy', {
            sessionId: 'sess-legacy',
            text: '',
            files: [brokenBlob, emptyBlob],
            updatedAt: Date.now(),
        });
        expect(await loadChatDraft('sess-legacy')).toBeNull();
    });
});

describe('useChatAttachments.restorePreparedFiles guard', () => {
    it('ignora archivos vacios de borrador pero restaura archivos validos con bytes', () => {
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => 'blob:mock-restored');
        URL.revokeObjectURL = vi.fn();

        try {
            const { result } = renderHook(() => useChatAttachments());
            const emptyFile = new File([], 'vacio.jpg', { type: 'image/jpeg' });
            const validFile = new File([new Uint8Array([1, 2, 3, 4])], 'jugo.jpg', { type: 'image/jpeg' });

            let restoredIds = [];
            act(() => {
                restoredIds = result.current.restorePreparedFiles([emptyFile, validFile]);
            });

            expect(restoredIds).toHaveLength(1);
            expect(result.current.attachments).toHaveLength(1);
            expect(result.current.attachments[0].file.name).toBe('jugo.jpg');
            expect(result.current.attachments[0].file.size).toBe(4);
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });
});

describe('AgentPage upload retry & FormData materialization contract', () => {
    it('conserva retryAttachments al fallar uploadOne y materializa File antes de FormData.append', () => {
        const src = fs.readFileSync(_agentPagePath, 'utf8');

        const catchStart = src.indexOf('catch (uploadError)');
        expect(catchStart).toBeGreaterThan(-1);
        const catchBlock = src.slice(catchStart, catchStart + 650);
        expect(catchBlock).toContain('retryAttachments: retryItems');
        expect(catchBlock).toContain('retryWithCurrentAttachments: false');
        expect(catchBlock).not.toContain('retryWithCurrentAttachments: true');

        const uploadStart = src.indexOf('const uploadOne = async (item)');
        expect(uploadStart).toBeGreaterThan(-1);
        const uploadBlock = src.slice(uploadStart, uploadStart + 2200);
        expect(uploadBlock).toContain('materializeAttachmentFile(item)');
        expect(uploadBlock).toContain("uploadForm.append('file', fileToUpload");
        expect(uploadBlock).toContain('422:');
        expect(src).toContain('422: {');
    });
});
