/**
 * [P1-PLAN-LOTE-300 · 2026-09-25] En la app nativa la IMAGEN del día se comparte de verdad: se escribe en la caché
 * (`@capacitor/filesystem`) y va a la hoja del sistema (`@capacitor/share`) con el texto. Sin plugins: la Web Share.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const plataforma = { nativa: true, plugins: true };
const escritos = [];
const compartidos = [];
let fallarShare = null;

vi.mock('../config/platform', () => ({
    isNativeApp: () => plataforma.nativa,
    nativePluginAvailable: () => plataforma.plugins,
}));
vi.mock('@capacitor/filesystem', () => ({
    Directory: { Cache: 'CACHE' },
    Filesystem: { writeFile: vi.fn(async (o) => { escritos.push(o); return { uri: 'file:///cache/'+o.path }; }) },
}));
vi.mock('@capacitor/share', () => ({
    Share: { share: vi.fn(async (o) => { if (fallarShare) throw fallarShare; compartidos.push(o); }) },
}));

import { compartir, puedeCompartirNativo, archivoDeImagen } from '../utils/compartirDia';

const png = () => archivoDeImagen(new Blob(['PNGDATA'], { type: 'image/png' }));

beforeEach(() => {
    escritos.length = 0;
    compartidos.length = 0;
    fallarShare = null;
    plataforma.nativa = true;
    plataforma.plugins = true;
});

describe('[300] compartir la imagen en la app nativa', () => {
    it('escribe el PNG en la caché y lo comparte SOLO (sin texto, lote 386)', async () => {
        expect(puedeCompartirNativo()).toBe(true);
        expect(await compartir({ archivo: png(), texto: 'Mi día en Bioboros' })).toBe('compartido');
        expect(escritos[0]).toMatchObject({ path: 'mi-dia-bioboros.png', directory: 'CACHE' });
        expect(escritos[0].data.length).toBeGreaterThan(0);                      // base64, sin el prefijo data:
        expect(escritos[0].data.startsWith('data:')).toBe(false);
        expect(compartidos[0]).toMatchObject({ files: ['file:///cache/mi-dia-bioboros.png'] });
        expect(compartidos[0].text).toBeUndefined();
    });

    it('si el usuario cierra la hoja, es «cancelado», no un error', async () => {
        fallarShare = new Error('Share canceled');
        expect(await compartir({ archivo: png(), texto: 'x' })).toBe('cancelado');
    });

    it('sin los plugins (APK anterior) no intenta la vía nativa', () => {
        plataforma.plugins = false;
        expect(puedeCompartirNativo()).toBe(false);
    });
    it('comparte todas las páginas de la lista en una sola hoja, con sus nombres y orden', async () => {
        const archivos = [1,2,3].map(n=>archivoDeImagen(new Blob(['PNG'+n],{type:'image/png'}),`lista-${n}.png`));
        expect(await compartir({archivos,texto:'',titulo:'Lista de compras'})).toBe('compartido');
        expect(escritos.map(x=>x.path)).toEqual(['lista-1.png','lista-2.png','lista-3.png']);
        expect(compartidos).toHaveLength(1);
        expect(compartidos[0].files).toEqual(['file:///cache/lista-1.png','file:///cache/lista-2.png','file:///cache/lista-3.png']);
        expect(compartidos[0].text).toBeUndefined();
    });
});
