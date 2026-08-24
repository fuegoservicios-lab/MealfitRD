import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
    CHAT_IMAGE_MAX_COUNT,
    CHAT_IMAGE_MAX_SOURCE_BYTES,
    CHAT_IMAGE_MAX_TOTAL_SOURCE_BYTES,
    prepareChatImage,
} from '../utils/chatImageProcessing';

export const initialChatAttachmentsState = { items: [] };

export function chatAttachmentsReducer(state, action) {
    switch (action.type) {
        case 'add':
            return { items: [...state.items, ...action.items].slice(0, CHAT_IMAGE_MAX_COUNT) };
        case 'ready':
            return {
                items: state.items.map((item) => item.id === action.id
                    ? { ...item, ...action.payload, status: 'ready', error: null }
                    : item),
            };
        case 'error':
            return {
                items: state.items.map((item) => item.id === action.id
                    ? { ...item, status: 'error', error: action.error }
                    : item),
            };
        case 'remove':
            return { items: state.items.filter((item) => item.id !== action.id) };
        case 'clear':
            return initialChatAttachmentsState;
        default:
            return state;
    }
}

const attachmentId = () => (
    globalThis.crypto?.randomUUID?.()
    || `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export function useChatAttachments({ onReject, concurrency = 2 } = {}) {
    const [state, dispatch] = useReducer(chatAttachmentsReducer, initialChatAttachmentsState);
    const itemsRef = useRef(state.items);
    const controllersRef = useRef(new Map());
    const jobsRef = useRef([]);
    const activeJobsRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => { itemsRef.current = state.items; }, [state.items]);

    const pump = useCallback(function pumpJobs() {
        while (activeJobsRef.current < concurrency && jobsRef.current.length) {
            const job = jobsRef.current.shift();
            if (!job || job.controller.signal.aborted) continue;
            activeJobsRef.current += 1;
            prepareChatImage(job.sourceFile, { signal: job.controller.signal })
                .then((prepared) => {
                    if (!mountedRef.current || job.controller.signal.aborted) return;
                    dispatch({ type: 'ready', id: job.id, payload: prepared });
                })
                .catch((error) => {
                    if (!mountedRef.current || error?.name === 'AbortError') return;
                    dispatch({ type: 'error', id: job.id, error: error?.code || 'IMAGE_PREP_FAILED' });
                })
                .finally(() => {
                    activeJobsRef.current -= 1;
                    controllersRef.current.delete(job.id);
                    pumpJobs();
                });
        }
    }, [concurrency]);

    const addFiles = useCallback((inputFiles) => {
        const files = Array.from(inputFiles || []);
        const existing = itemsRef.current;
        const freeSlots = Math.max(0, CHAT_IMAGE_MAX_COUNT - existing.length);
        if (!freeSlots) {
            onReject?.('IMAGE_COUNT_LIMIT');
            return [];
        }

        const currentBytes = existing.reduce((sum, item) => sum + (item.sourceFile?.size || 0), 0);
        let acceptedBytes = 0;
        const accepted = [];
        for (const file of files) {
            if (accepted.length >= freeSlots) break;
            if (!String(file?.type || '').startsWith('image/')) {
                onReject?.('IMAGE_TYPE_INVALID');
                continue;
            }
            if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) {
                onReject?.('IMAGE_TOO_LARGE');
                continue;
            }
            if (currentBytes + acceptedBytes + file.size > CHAT_IMAGE_MAX_TOTAL_SOURCE_BYTES) {
                onReject?.('IMAGE_TOTAL_TOO_LARGE');
                break;
            }
            const id = attachmentId();
            const controller = new AbortController();
            const previewUrl = URL.createObjectURL(file);
            const item = { id, sourceFile: file, file, previewUrl, status: 'preparing', error: null };
            accepted.push(item);
            acceptedBytes += file.size;
            controllersRef.current.set(id, controller);
            jobsRef.current.push({ id, sourceFile: file, controller });
        }
        if (files.length > accepted.length && accepted.length >= freeSlots) onReject?.('IMAGE_COUNT_LIMIT');
        if (accepted.length) {
            itemsRef.current = [...existing, ...accepted].slice(0, CHAT_IMAGE_MAX_COUNT);
            dispatch({ type: 'add', items: accepted });
            pump();
        }
        return accepted.map((item) => item.id);
    }, [onReject, pump]);

    const restorePreparedFiles = useCallback((inputFiles) => {
        const existing = itemsRef.current;
        const freeSlots = Math.max(0, CHAT_IMAGE_MAX_COUNT - existing.length);
        const restored = Array.from(inputFiles || []).slice(0, freeSlots).flatMap((value, index) => {
            if (!(value instanceof Blob) || !String(value.type || '').startsWith('image/')) return [];
            const file = value instanceof File
                ? value
                : new File([value], `borrador-${index + 1}.jpg`, { type: value.type || 'image/jpeg' });
            if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) return [];
            const id = attachmentId();
            return [{
                id,
                sourceFile: file,
                file,
                previewUrl: URL.createObjectURL(file),
                status: 'ready',
                error: null,
            }];
        });
        if (restored.length) {
            itemsRef.current = [...existing, ...restored].slice(0, CHAT_IMAGE_MAX_COUNT);
            dispatch({ type: 'add', items: restored });
        }
        return restored.map((item) => item.id);
    }, []);

    const remove = useCallback((id) => {
        controllersRef.current.get(id)?.abort();
        controllersRef.current.delete(id);
        jobsRef.current = jobsRef.current.filter((job) => job.id !== id);
        const item = itemsRef.current.find((candidate) => candidate.id === id);
        if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        itemsRef.current = itemsRef.current.filter((candidate) => candidate.id !== id);
        dispatch({ type: 'remove', id });
    }, []);

    const clear = useCallback(({ revoke = true } = {}) => {
        controllersRef.current.forEach((controller) => controller.abort());
        controllersRef.current.clear();
        jobsRef.current = [];
        if (revoke) {
            itemsRef.current.forEach((item) => {
                if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
            });
        }
        itemsRef.current = [];
        dispatch({ type: 'clear' });
    }, []);

    const waitUntilSettled = useCallback(async () => {
        while (mountedRef.current && itemsRef.current.some((item) => item.status === 'preparing')) {
            await new Promise((resolve) => setTimeout(resolve, 30));
        }
        const snapshot = itemsRef.current;
        const failed = snapshot.find((item) => item.status === 'error');
        if (failed) {
            const error = new Error(failed.error || 'IMAGE_PREP_FAILED');
            error.code = failed.error || 'IMAGE_PREP_FAILED';
            throw error;
        }
        return snapshot.filter((item) => item.status === 'ready');
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        const controllers = controllersRef.current;
        return () => {
            mountedRef.current = false;
            controllers.forEach((controller) => controller.abort());
            itemsRef.current.forEach((item) => {
                if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
            });
        };
    }, []);

    return useMemo(() => ({
        attachments: state.items,
        addFiles,
        restorePreparedFiles,
        removeAttachment: remove,
        clearAttachments: clear,
        waitUntilSettled,
        hasPreparing: state.items.some((item) => item.status === 'preparing'),
        hasErrors: state.items.some((item) => item.status === 'error'),
    }), [state.items, addFiles, restorePreparedFiles, remove, clear, waitUntilSettled]);
}
