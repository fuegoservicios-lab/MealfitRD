// [P1-COMPARTIR-DIA · 2026-09-23] La hoja: vista previa, compartir con imagen, WhatsApp, copiar y privacidad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../config/platform', async (orig) => ({ ...(await orig()), isNativeApp: vi.fn(() => false) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { toast } from 'sonner';
import { isNativeApp } from '../config/platform';
import { dibujarTarjetaDelDia } from '../utils/tarjetaDelDia';
import { fechaLarga } from '../utils/compartirDia';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 1205, protein: 73, carbs: 125, fats: 42, meals: [{ meal_name: 'Mangú con huevo', calories: 510 }], micros: null, microsCoverage: { con_datos: 0, total: 1 } },
    metas: { calories: 2050, protein: 134, carbs: 251, fats: 57 },
    microMetas: null,
};

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(isNativeApp).mockReturnValue(false);   // `clearAllMocks` no deshace un `mockReturnValue`
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('ShareDaySheet', () => {
    it('pinta la vista previa y comparte imagen + texto', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await waitFor(() => expect(screen.getByRole('img', { name: /mi día/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /^compartir$/i }));
        await waitFor(() => expect(share).toHaveBeenCalled());
        const arg = share.mock.calls[0][0];
        expect(arg.files).toHaveLength(1);
        expect(arg.text).toContain('Bioboros');
    });

    it('WhatsApp siempre disponible, con el texto codificado y sin las comidas por defecto', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        const wa = await screen.findByRole('link', { name: /whatsapp/i });
        expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
        expect(decodeURIComponent(wa.getAttribute('href'))).not.toContain('Mangú');
        fireEvent.click(screen.getByRole('checkbox', { name: /incluir lo que comí/i }));
        await waitFor(() => expect(decodeURIComponent(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href'))).toContain('Mangú'));
    });

    it('copiar texto usa el portapapeles', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText } });
        render(<ShareDaySheet {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /copiar texto/i }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('kcal')));
    });

    it('en la web sin hoja de archivos ofrece descargar la imagen', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        expect(await screen.findByRole('button', { name: /descargar imagen/i })).toBeInTheDocument();
    });

    // [P1-COMPARTIR-DIA · fix round 1]
    it('en la app nativa no se ofrece descargar (Capacitor no gestiona `a.download`): quedan WhatsApp y copiar', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await screen.findByRole('img', { name: /mi día/i });
        expect(screen.queryByRole('button', { name: /descargar imagen/i })).toBeNull();
        expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copiar texto/i })).toBeInTheDocument();
    });

    it('un segundo toque mientras se abre la hoja del sistema no vuelve a compartir ni avisa de un fallo falso', async () => {
        let terminar;
        const share = vi.fn(() => new Promise((r) => { terminar = r; }));
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await screen.findByRole('img', { name: /mi día/i });
        const boton = screen.getByRole('button', { name: /^compartir$/i });
        // Los dos toques en el mismo lote: el botón todavía no se ha deshabilitado; los para la marca de «pendiente».
        act(() => { boton.click(); boton.click(); });
        expect(share).toHaveBeenCalledTimes(1);
        expect(boton).toBeDisabled();
        await act(async () => { terminar(); });
        await waitFor(() => expect(boton).not.toBeDisabled());
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('«Texto copiado» lleva id: tocar «Copiar texto» varias veces reemplaza el aviso en vez de apilarlo', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText } });
        render(<ShareDaySheet {...props} />);
        const copiar = await screen.findByRole('button', { name: /copiar texto/i });
        fireEvent.click(copiar);
        fireEvent.click(copiar);
        await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
        const [primero, segundo] = toast.success.mock.calls.map((c) => c[1]?.id);
        expect(primero).toEqual(expect.any(String));
        expect(segundo).toBe(primero);
    });

    it('al cerrar la hoja se revoca la URL que estaba en pantalla', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        const { unmount } = render(<ShareDaySheet {...props} />);
        const enPantalla = (await screen.findByRole('img', { name: /mi día/i })).getAttribute('src');
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(enPantalla);
    });

    it('al redibujar, la imagen en pantalla no se revoca hasta que la nueva está puesta; al cerrar, se revoca la última', async () => {
        let terminarSegunda;
        vi.mocked(dibujarTarjetaDelDia)
            .mockImplementationOnce(async () => new Blob(['1'], { type: 'image/png' }))
            .mockImplementationOnce(() => new Promise((r) => { terminarSegunda = r; }));
        URL.createObjectURL.mockReturnValueOnce('blob:1').mockReturnValueOnce('blob:2');
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        const { unmount } = render(<ShareDaySheet {...props} />);
        expect((await screen.findByRole('img', { name: /mi día/i })).getAttribute('src')).toBe('blob:1');

        fireEvent.click(screen.getByRole('checkbox', { name: /incluir lo que comí/i }));   // redibujo en curso
        expect(screen.getByRole('img', { name: /mi día/i }).getAttribute('src')).toBe('blob:1');
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();

        await act(async () => { terminarSegunda(new Blob(['2'], { type: 'image/png' })); });
        await waitFor(() => expect(screen.getByRole('img', { name: /mi día/i }).getAttribute('src')).toBe('blob:2'));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
        expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:2');

        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2');
    });
});

// [P1-COMPARTIR-DIA-PASADO · 2026-09-24] Desde el Diario llega el día que se mira.
describe('ShareDaySheet · un día pasado', () => {
    it('con `fecha`, la imagen, el texto y la cabecera dicen ESE día', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        const ayer = new Date(2026, 8, 23, 12);
        render(<ShareDaySheet {...props} fecha={ayer} />);
        await screen.findByRole('img', { name: /mi día/i });
        expect(dibujarTarjetaDelDia.mock.calls[0][0].fecha.getTime()).toBe(ayer.getTime());
        expect(decodeURIComponent(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href'))).toContain(fechaLarga(ayer));
        const fecha = screen.getByText(fechaLarga(ayer));
        expect(screen.getByRole('dialog', { name: 'Compartir tu día' }).getAttribute('aria-describedby')).toBe(fecha.id);
    });

    it('otra `Date` con el mismo instante (un render nuevo del padre) no redibuja la imagen', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        const { rerender } = render(<ShareDaySheet {...props} fecha={new Date(2026, 8, 23, 12)} />);
        await screen.findByRole('img', { name: /mi día/i });
        rerender(<ShareDaySheet {...props} fecha={new Date(2026, 8, 23, 12)} />);
        await act(async () => {});
        expect(dibujarTarjetaDelDia).toHaveBeenCalledTimes(1);
    });

    it('con `diario` (el día tal cual del endpoint) comparte los totales del servidor', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        const diario = {
            meals: [{ meal_name: 'Mangú', calories: 510 }, { meal_name: 'Pollo', calories: 695 }, { meal_name: 'Tortilla', calories: 620 }],
            totals: { calories: 1825, protein: 113, carbs: 161, healthy_fats: 78, micros: null, micros_coverage: { con_datos: 0, total: 3 } },
        };
        render(<ShareDaySheet onClose={vi.fn()} diario={diario} metas={props.metas} fecha={new Date(2026, 8, 23, 12)} />);
        await screen.findByRole('img', { name: /mi día/i });
        const r = dibujarTarjetaDelDia.mock.calls[0][0];
        expect(r.calorias).toMatchObject({ valor: 1825, meta: 2050 });
        expect(r.macros.map((m) => m.valor)).toEqual([113, 161, 78]);
        expect(r.comidasRegistradas).toBe(3);
        expect(decodeURIComponent(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href'))).toMatch(/78 \/ 57 g/);
    });

    it('sin `fecha` (la tarjeta de hoy) es hoy y la cabecera queda como estaba', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await screen.findByRole('img', { name: /mi día/i });
        expect(fechaLarga(dibujarTarjetaDelDia.mock.calls[0][0].fecha)).toBe(fechaLarga(new Date()));
        expect(screen.getByRole('dialog', { name: 'Compartir tu día' }).hasAttribute('aria-describedby')).toBe(false);
        expect(document.getElementById('share-day-fecha')).toBeNull();
    });
});

describe('TrackingProgress · compartir', () => {
    it('la tarjeta ofrece compartir solo con comidas y carga la hoja bajo demanda', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'TrackingProgress.jsx'), 'utf8');
        expect(src).toContain("lazy(() => import('./ShareDaySheet'))");
        expect(src).toMatch(/_todaysMeals\.length > 0[\s\S]{0,200}aria-label=\{t\('Compartir mi día'\)\}/);
    });

    it('el botón de compartir es un cuadrado fijo con la piel de «Registrar comida», que sigue llenando la fila', () => {
        // P2-SCANBTN-PAIR-MOBILE pide re-anclar el reparto flex si vuelve un segundo botón a `.logButtons`: dos
        // botones que estiran desbordan la fila, y el `overflow: hidden` de la tarjeta decapita al segundo. Y como la
        // regla de `.scanBtn` es UNA (P1-SCAN-BTN-ACCENT), la piel de `.shareBtn` es una copia: que no se separe.
        const css = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'TrackingProgress.module.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), cuerpo: m[2] }));
        const primera = (sel) => reglas.find((r) => r.sel === sel)?.cuerpo ?? '';   // la de la base va antes que la del @media
        const decl = (cuerpo, prop) => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(cuerpo)?.[1].trim();

        const deCompartir = reglas.filter((r) => /\.shareBtn$/.test(r.sel)).map((r) => r.cuerpo);
        expect(deCompartir.length).toBeGreaterThan(0);
        for (const cuerpo of deCompartir) {
            expect(cuerpo).not.toMatch(/(?<!-)width\s*:\s*100%/);
            expect(cuerpo).not.toMatch(/(?<![\w-])flex(-grow)?\s*:\s*1\b/);
        }
        expect(decl(primera('.shareBtn'), 'width')).toBe('38px');

        const OSCURO = ':global(html[data-theme="dark"]) ';
        for (const [scan, share] of [
            ['.scanBtn', '.shareBtn'], ['.scanBtn svg', '.shareBtn svg'], ['.scanBtn:hover', '.shareBtn:hover'],
            [`${OSCURO}.scanBtn`, `${OSCURO}.shareBtn`], [`${OSCURO}.scanBtn svg`, `${OSCURO}.shareBtn svg`],
            [`${OSCURO}.scanBtn:hover`, `${OSCURO}.shareBtn:hover`],
        ]) {
            expect(primera(share), `falta la regla ${share}`).not.toBe('');
            for (const prop of ['border', 'border-color', 'border-radius', 'background', 'color']) {
                expect(decl(primera(share), prop), `${share} { ${prop} }`).toBe(decl(primera(scan), prop));
            }
        }
    });
});
