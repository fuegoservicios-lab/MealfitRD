// [P1-PLAN-LOTE-1050] Adjuntar con el teclado abierto: un panel DENTRO del cuadro de escribir (pegado al teclado), no un
// menú flotante colocado por medidas que se descolocaba al hacer captura. Y en «Compartir» nuestro selector Galería /
// Cámara en vez del menú de tres opciones de iOS.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('../config/platform', async (orig) => ({ ...(await orig()), isNativeApp: vi.fn(() => false), nativePlatform: vi.fn(() => 'ios') }));
vi.mock('../utils/nativeChatImagePicker', async (orig) => ({
    ...(await orig()),
    chooseNativeGalleryImage: vi.fn(async () => new File(['x'], 'g.jpg', { type: 'image/jpeg' })),
    takeNativeChatPhoto: vi.fn(async () => [new File(['x'], 'c.jpg', { type: 'image/jpeg' })]),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { isNativeApp, nativePlatform } from '../config/platform';
import { chooseNativeGalleryImage, takeNativeChatPhoto } from '../utils/nativeChatImagePicker';
import { cargarFoto } from '../utils/historiaConFoto';
import { AttachmentInlinePanel } from '../components/agent/AttachmentInlinePanel';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(isNativeApp).mockReturnValue(false);
    vi.mocked(nativePlatform).mockReturnValue('ios');
});
afterEach(() => { vi.clearAllMocks(); });

describe('[1050] el panel de adjuntar integrado', () => {
    const Arnes = ({ onClose = vi.fn(), onGallery = vi.fn() }) => {
        const triggerRef = React.useRef(null);
        return <>
            <textarea aria-label="mensaje" />
            <button ref={triggerRef} type="button">mas</button>
            <AttachmentInlinePanel open onClose={onClose} onGallery={onGallery} onCamera={vi.fn()} triggerRef={triggerRef} />
            <p>fuera</p>
        </>;
    };

    it('no se coloca por medidas: va en el flujo, sin portal ni estilos de posición', () => {
        render(<Arnes />);
        const panel = screen.getByRole('group', { name: 'Añadir imagen' });
        expect(panel.getAttribute('style')).toBeNull();
        expect(panel.parentElement).toBe(document.querySelector('textarea').parentElement);
        const codigo = leer('components/agent/AttachmentInlinePanel.jsx').replace(/^\s*\/\/.*$/gm, '');
        expect(codigo).not.toMatch(/getBoundingClientRect|createPortal|visualViewport/);
    });

    it('[1051] cuelga ENCIMA del cuadro por CSS y no empuja la línea de escribir (iOS dejaba el cursor en el sitio viejo)', () => {
        const css = leer('components/agent/AttachmentInlinePanel.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const regla = css.match(/\.attach-inline\s*\{([^}]*)\}/)[1];
        expect(regla).toMatch(/position:\s*absolute/);
        expect(regla).toMatch(/bottom:\s*calc\(100% \+ 8px\)/);
        expect(regla).not.toMatch(/margin-bottom/);
        const src = leer('pages/AgentPage.jsx');
        const caja = src.slice(src.indexOf('<div className="input-box-dictable" style={{'), src.indexOf('<AttachmentInlinePanel'));
        expect(caja).toMatch(/position: 'relative'/);
    });

    it('no roba el foco: el cuadro de texto sigue enfocado al tocar una opción (el teclado de iOS no se cierra)', () => {
        const onGallery = vi.fn();
        render(<Arnes onGallery={onGallery} />);
        const campo = screen.getByLabelText('mensaje');
        campo.focus();
        const galeria = screen.getByRole('button', { name: /galería/i });
        expect(fireEvent.mouseDown(galeria)).toBe(false);
        expect(fireEvent.pointerDown(galeria)).toBe(false);
        fireEvent.click(galeria);
        expect(onGallery).toHaveBeenCalledTimes(1);
        expect(campo).toHaveFocus();
    });

    it('se cierra al tocar fuera o con Escape, pero no al tocar el «+» (que lo cierra él)', () => {
        const onClose = vi.fn();
        render(<Arnes onClose={onClose} />);
        fireEvent.pointerDown(screen.getByRole('button', { name: 'mas' }));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.pointerDown(screen.getByText('fuera'));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('el chat lo pinta dentro del cuadro y el «+» se vuelve «×» y lo cierra', () => {
        const src = leer('pages/AgentPage.jsx');
        const area = src.slice(src.indexOf('const renderInputArea = (isCentered = false) => ('));
        expect(area.indexOf('<AttachmentInlinePanel')).toBeGreaterThan(0);
        expect(area.indexOf('<AttachmentInlinePanel')).toBeLessThan(area.indexOf('className="chat-composer-input"'));
        expect(src).toContain("${showAttachmentSource && attachmentAnchorRect ? ' abierto' : ''}");
        expect(src).toMatch(/if \(showAttachmentSource && attachmentAnchorRect\) \{\s*reopenKeyboardAfterAttachmentRef\.current = false;\s*setShowAttachmentSource\(false\);\s*return;/);
        expect(leer('components/agent/AttachmentInlinePanel.css')).toContain('.attachment-btn.abierto .attachment-plus { transform: rotate(45deg); }');
    });
});

describe('[1050] «Compartir»: nuestro selector de foto', () => {
    const props = {
        onClose: vi.fn(),
        consumed: { calories: 1404, protein: 50, carbs: 181, fats: 55, meals: [{ meal_name: 'Mangú', calories: 510 }], micros: null, microsCoverage: { con_datos: 0, total: 1 } },
        metas: { calories: 2050, protein: 134, carbs: 251, fats: 57 },
    };

    it('«Ponle tu foto» ofrece Galería y Cámara (no abre el menú del sistema)', async () => {
        render(<ShareDaySheet {...props} />);
        const clic = vi.spyOn(HTMLInputElement.prototype, 'click');
        fireEvent.click(await screen.findByRole('button', { name: /ponle tu foto/i }));
        expect(clic).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /galería/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cámara/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
        expect(screen.getByRole('button', { name: /ponle tu foto/i })).toBeInTheDocument();
        clic.mockRestore();
    });

    it('en la web, Cámara abre el input con `capture` y Galería el de la fototeca', async () => {
        render(<ShareDaySheet {...props} />);
        const abiertos = [];
        const clic = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () { abiertos.push(this.dataset.testid); });
        fireEvent.click(await screen.findByRole('button', { name: /ponle tu foto/i }));
        fireEvent.click(screen.getByRole('button', { name: /cámara/i }));
        fireEvent.click(screen.getByRole('button', { name: /ponle tu foto/i }));
        fireEvent.click(screen.getByRole('button', { name: /galería/i }));
        expect(abiertos).toEqual(['share-day-camara', 'share-day-foto']);
        expect(screen.getByTestId('share-day-camara').getAttribute('capture')).toBe('environment');
        clic.mockRestore();
    });

    it('en la app nativa usa la fototeca del binario y la cámara del plugin (a 2400 px)', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        render(<ShareDaySheet {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /ponle tu foto/i }));
        fireEvent.click(screen.getByRole('button', { name: /galería/i }));
        await waitFor(() => expect(chooseNativeGalleryImage).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(cargarFoto).toHaveBeenCalledTimes(1));
        await screen.findByRole('radiogroup', { name: /estilo de la historia/i });
        fireEvent.click(screen.getByRole('button', { name: /cambiar foto/i }));
        fireEvent.click(screen.getByRole('button', { name: /cámara/i }));
        await waitFor(() => expect(takeNativeChatPhoto).toHaveBeenCalledWith({ lado: 2400 }));
    });

    it('en Android nativo la cámara abre CameraViewfinder in-app sin salir a @capacitor/camera', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(nativePlatform).mockReturnValue('android');
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
        });
        render(<ShareDaySheet {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /ponle tu foto/i }));
        fireEvent.click(screen.getByRole('button', { name: /cámara/i }));
        expect(await screen.findByRole('dialog', { name: 'Tomar una foto' })).toBeInTheDocument();
        expect(takeNativeChatPhoto).not.toHaveBeenCalled();

        const agentSrc = leer('pages/AgentPage.jsx');
        expect(agentSrc).toContain("if (source === 'camera' && nativePlatform() === 'android'");
        expect(agentSrc).toContain('setChatCameraOpen(true)');
    });
});

describe('[1053] arrastrar sobre el panel no panea la página', () => {
    it('el panel no deja arrastrar (touch-action: none) y no se cierra solo con un scroll programático', () => {
        const css = leer('components/agent/AttachmentInlinePanel.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const regla = css.match(/\.attach-inline\s*\{([^}]*)\}/)[1];
        expect(regla).toMatch(/touch-action:\s*none/);
        expect(regla).toMatch(/overscroll-behavior:\s*contain/);
        const codigo = leer('components/agent/AttachmentInlinePanel.jsx').replace(/^\s*\/\/.*$/gm, '');
        expect(codigo).not.toMatch(/addEventListener\('scroll'/);
    });
});

describe('[1054] el chat no retoca la selección del cuadro por su cuenta', () => {
    it('sin `programarRefrescoDelCursor` ni `setSelectionRange` en el chat (deshecho el lote 1052)', () => {
        // El 1052 volvía a fijar la selección 260 ms después de cerrar el panel; con «Galería» eso caía con el selector de
        // fotos ya abierto y el teclado escondido, iOS «llevaba el campo a la vista» y, al volver con la X, la app entera
        // quedaba desplazada hacia arriba (captura del dueño, 16-nov 9:49). El cursor desplazado lo arregló el 1053.
        const src = leer('pages/AgentPage.jsx');
        expect(src).not.toMatch(/programarRefrescoDelCursor|cursorIOS/);
        expect(src).not.toMatch(/chatInputRef\.current\??\.setSelectionRange/);
    });
});
