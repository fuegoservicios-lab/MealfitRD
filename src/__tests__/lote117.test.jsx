// [P1-PLAN-LOTE-117 · 2026-09-19] Las fotos del chat se ven en el teléfono y el visor las enseña enteras y nítidas.
// El backend entrega los adjuntos como ruta relativa protegida por la sesión; un `<img>` no manda cabeceras, así que en
// la app nativa (y en la PWA de iOS sin cookie) la foto daba 404/403 → «Imagen no disponible».
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const plataforma = vi.hoisted(() => ({ nativa: false }));
vi.mock('../config/platform', () => ({ isNativeApp: () => plataforma.nativa }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import { ChatImage } from '../components/agent/ChatImage';
import { _vaciarCacheDeImagenes, claveDeImagen, esRutaDelBackend } from '../hooks/useChatImageSrc';

const RUTA = '/api/chat/attachments/11111111-1111-1111-1111-111111111111?expires=1&sig=abc';
const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

beforeEach(() => {
    plataforma.nativa = false;
    _vaciarCacheDeImagenes();
    vi.mocked(fetchWithAuth).mockReset();
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:foto-${++n}`);
    URL.revokeObjectURL = vi.fn();
});

describe('carga de las fotos del chat', () => {
    it('en la app nativa la ruta del backend se trae AUTENTICADA y se pinta desde un blob', async () => {
        plataforma.nativa = true;
        vi.mocked(fetchWithAuth).mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
        render(<ChatImage url={RUTA} alt="foto" />);
        expect(screen.queryByAltText('foto')).not.toBeInTheDocument(); // aún cargando: hueco, no imagen rota
        await waitFor(() => expect(screen.getByAltText('foto').getAttribute('src')).toBe('blob:foto-1'));
        expect(fetchWithAuth).toHaveBeenCalledWith(RUTA);
    });

    it('la misma foto no se vuelve a descargar aunque cambie la firma de la URL', async () => {
        plataforma.nativa = true;
        vi.mocked(fetchWithAuth).mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
        const { unmount } = render(<ChatImage url={RUTA} alt="foto" />);
        await waitFor(() => expect(screen.getByAltText('foto')).toBeInTheDocument());
        unmount();
        render(<ChatImage url={RUTA.replace('sig=abc', 'sig=otra')} alt="foto" />);
        expect(screen.getByAltText('foto').getAttribute('src')).toBe('blob:foto-1');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        expect(claveDeImagen(RUTA)).toBe('/api/chat/attachments/11111111-1111-1111-1111-111111111111');
    });

    it('en la web va directa; si el <img> falla (PWA sin cookie) se reintenta autenticada antes de rendirse', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
        const roto = vi.fn();
        render(<ChatImage url={RUTA} alt="foto" onBroken={roto} />);
        expect(screen.getByAltText('foto').getAttribute('src')).toBe(RUTA);
        expect(fetchWithAuth).not.toHaveBeenCalled();
        fireEvent.error(screen.getByAltText('foto'));
        await waitFor(() => expect(screen.getByAltText('foto').getAttribute('src')).toBe('blob:foto-1'));
        expect(roto).not.toHaveBeenCalled();
    });

    it('solo se da por perdida cuando también falla la carga autenticada', async () => {
        plataforma.nativa = true;
        vi.mocked(fetchWithAuth).mockResolvedValue({ ok: false, status: 403 });
        const roto = vi.fn();
        render(<ChatImage url={RUTA} alt="foto" onBroken={roto} />);
        await waitFor(() => expect(roto).toHaveBeenCalled());
    });

    it('miniaturas y vistas previas locales (data:/blob:) no pasan por el backend', () => {
        plataforma.nativa = true;
        render(<ChatImage url="data:image/jpeg;base64,AAAA" alt="mini" />);
        expect(screen.getByAltText('mini').getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(esRutaDelBackend('blob:x')).toBe(false);
    });
});

describe('el visor', () => {
    it('la imagen cabe ENTERA: pista definida, no `auto`', () => {
        const css = leer('components/agent/MessageBubble.css');
        const i = css.indexOf('.message-image-viewer {');
        const bloque = css.slice(i, css.indexOf('}', i));
        expect(bloque).toContain('grid-template-rows: minmax(0, 1fr);');
        expect(bloque).toContain('grid-template-columns: minmax(0, 1fr);');
    });
    it('abre la versión completa, no la miniatura de 360 px', () => {
        expect(leer('components/agent/MessageBubble.jsx')).toContain("media[viewerIndex]?.fullUrl || media[viewerIndex]?.url");
        expect(leer('pages/AgentPage.jsx')).toContain('fullUrl: item.url || item.image_url || item.previewUrl || item.thumbDataUrl,');
    });
});
