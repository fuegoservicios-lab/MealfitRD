import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controls = vi.hoisted(() => ({ pending: new Map() }));

vi.mock('../utils/chatImageProcessing', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        prepareChatImage: vi.fn((file) => new Promise((resolve, reject) => {
            controls.pending.set(file.name, { resolve, reject });
        })),
    };
});

import { useChatAttachments } from '../hooks/useChatAttachments';

const image = (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

describe('[P1-CHAT-MULTI-IMAGE] reducer y cancelación de adjuntos', () => {
    beforeEach(() => {
        controls.pending.clear();
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn((file) => `blob:${file.name}`),
            revokeObjectURL: vi.fn(),
        });
    });

    it('procesa como máximo dos imágenes a la vez y publica las cuatro en orden', async () => {
        const { result } = renderHook(() => useChatAttachments({ concurrency: 2 }));
        act(() => result.current.addFiles([image('a.jpg'), image('b.jpg'), image('c.jpg'), image('d.jpg')]));
        expect([...controls.pending.keys()]).toEqual(['a.jpg', 'b.jpg']);

        await act(async () => controls.pending.get('a.jpg').resolve({ file: image('a-ready.jpg'), thumbDataUrl: 'data:a' }));
        await waitFor(() => expect(controls.pending.has('c.jpg')).toBe(true));
        await act(async () => controls.pending.get('b.jpg').resolve({ file: image('b-ready.jpg'), thumbDataUrl: 'data:b' }));
        await waitFor(() => expect(controls.pending.has('d.jpg')).toBe(true));
        await act(async () => {
            controls.pending.get('c.jpg').resolve({ file: image('c-ready.jpg'), thumbDataUrl: 'data:c' });
            controls.pending.get('d.jpg').resolve({ file: image('d-ready.jpg'), thumbDataUrl: 'data:d' });
        });

        await waitFor(() => expect(result.current.attachments.every((item) => item.status === 'ready')).toBe(true));
        expect(result.current.attachments.map((item) => item.sourceFile.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    });

    it('quitar una imagen pendiente la aborta y evita que reaparezca como fantasma', async () => {
        const { result } = renderHook(() => useChatAttachments({ concurrency: 1 }));
        act(() => result.current.addFiles([image('ghost.jpg')]));
        const id = result.current.attachments[0].id;
        act(() => result.current.removeAttachment(id));
        await act(async () => controls.pending.get('ghost.jpg').resolve({ file: image('late.jpg'), thumbDataUrl: 'data:late' }));
        expect(result.current.attachments).toEqual([]);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ghost.jpg');
    });

    it('rechaza la quinta imagen sin desplazar las cuatro ya elegidas', () => {
        const onReject = vi.fn();
        const { result } = renderHook(() => useChatAttachments({ concurrency: 2, onReject }));
        act(() => result.current.addFiles([image('1.jpg'), image('2.jpg'), image('3.jpg'), image('4.jpg'), image('5.jpg')]));
        expect(result.current.attachments).toHaveLength(4);
        expect(result.current.attachments.map((item) => item.sourceFile.name)).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg']);
        expect(onReject).toHaveBeenCalledWith('IMAGE_COUNT_LIMIT');
    });
});
