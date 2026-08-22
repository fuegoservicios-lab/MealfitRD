/**
 * [P1-I18N-UTILS-ETIQUETAS-INERTE · 2026-08-22] Los chips del Historial salían en español
 * en los cinco idiomas, y su arreglo llevaba un día PARECIENDO hecho.
 *
 * `P1-I18N-UTILS-ETIQUETAS` (commit 9130919) dice haber convertido cinco utils de rótulos.
 * A `chunkStatus.js` le dejó 16 líneas y las 16 eran el import de `t` y un comentario que
 * prometía «la tabla traducida de más abajo». Esa tabla no existía: el fichero terminaba
 * en los dos mapas españoles, la firma nunca recibió `t`, `_t` no se invocaba jamás y 6 de
 * las 7 etiquetas ni siquiera estaban en los catálogos. Y `chunkKinds.js`, que estaba en
 * la misma lista, no recibió absolutamente nada.
 *
 * Los dos se pintan en la MISMA línea del MISMO chip (`History.jsx`), así que un usuario
 * en inglés leía literalmente «Completado · Inicial» rodeado de interfaz traducida.
 *
 * POR QUÉ ESTE TEST MIDE CONDUCTA Y NO ESTRUCTURA: un guard que comprobara «existe una
 * tabla traducida» o «el fichero importa i18n» habría estado VERDE todo el tiempo — el
 * import estaba, y era exactamente lo único que estaba. Lo único que distingue un arreglo
 * de un arreglo aparente es cargar el catálogo y mirar qué sale.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { getChunkStatusLabel } from '../utils/chunkStatus';
import { getChunkKindLabel } from '../utils/chunkKinds';

afterAll(async () => {
    await loadLocale(DEFAULT_LOCALE);
});

describe('[P1-I18N-UTILS-ETIQUETAS-INERTE] los chips del Historial siguen el idioma', () => {
    beforeEach(async () => {
        await loadLocale(DEFAULT_LOCALE);
    });

    it('en es-DO los rótulos son los del mapa canónico', () => {
        expect(getChunkStatusLabel('completed')).toBe('Completado');
        expect(getChunkStatusLabel('pending')).toBe('En cola');
        expect(getChunkKindLabel('initial_plan')).toBe('Inicial');
        expect(getChunkKindLabel('catchup')).toBe('Recuperación');
    });

    it('con el catálogo en-US cargado, el estado se traduce', async () => {
        const ok = await loadLocale('en-US');
        expect(ok).toBe(true);
        // Testigo: si esto falla, es el catálogo el que no cargó, no el helper.
        expect(t('Guardar')).not.toBe('Guardar');

        expect(getChunkStatusLabel('completed')).toBe('Completed');
        expect(getChunkStatusLabel('pending')).toBe('Queued');
        expect(getChunkStatusLabel('processing')).toBe('Processing');
        expect(getChunkStatusLabel('stale')).toBe('Resuming');
        expect(getChunkStatusLabel('failed')).toBe('Failed');
        expect(getChunkStatusLabel('pending_user_action')).toBe('Awaiting action');
        expect(getChunkStatusLabel('cancelled')).toBe('Cancelled');
    });

    it('con el catálogo en-US cargado, el TIPO de bloque también se traduce', async () => {
        await loadLocale('en-US');
        expect(getChunkKindLabel('initial_plan')).toBe('Initial');
        expect(getChunkKindLabel('first_chunk')).toBe('Initial');
        expect(getChunkKindLabel('rolling_refill')).toBe('Refill');
        expect(getChunkKindLabel('catchup')).toBe('Catch-up');
    });

    it('la línea entera del chip deja de ser mestiza', async () => {
        await loadLocale('en-US');
        // Es como se compone en History.jsx: «<estado> · <tipo>».
        const linea = `${getChunkStatusLabel('completed')} · ${getChunkKindLabel('initial_plan')}`;
        expect(linea).toBe('Completed · Initial');
        expect(linea).not.toMatch(/Completado|Inicial/);
    });

    it.each(['pt-BR', 'fr-FR', 'it-IT'])('en %s ningún estado se queda en español', async (loc) => {
        await loadLocale(loc);
        const salidas = ['completed', 'pending', 'processing', 'stale', 'failed',
            'pending_user_action', 'cancelled'].map((s) => getChunkStatusLabel(s));
        // «Cancelado» es legítimamente idéntico en pt-BR; se compara contra el conjunto
        // español completo salvo ese caso, que es coincidencia real y no falta de traducción.
        const español = ['Completado', 'En cola', 'Procesando', 'Reanudando', 'Falló',
            'Esperando acción'];
        for (const s of salidas) {
            expect(español, `«${s}» salió en español con el catálogo ${loc} cargado`).not.toContain(s);
        }
    });

    it('acepta una `t` explícita del call site y le gana al default de módulo', async () => {
        await loadLocale(DEFAULT_LOCALE);
        const fake = (k) => (k === 'Completado' ? 'ZZTOP' : k);
        expect(getChunkStatusLabel('completed', fake)).toBe('ZZTOP');
        expect(getChunkKindLabel('initial_plan', (k) => `<${k}>`)).toBe('<Inicial>');
    });

    it('un code desconocido conserva su contrato: crudo en status, null en kind', () => {
        expect(getChunkStatusLabel('mystery_status')).toBe('mystery_status');
        expect(getChunkKindLabel('rolling_refill_v2')).toBeNull();
    });

    it('una `t` rota no tumba el chip: cae al español', () => {
        const rota = () => { throw new Error('catálogo corrupto'); };
        expect(getChunkStatusLabel('completed', rota)).toBe('Completado');
        expect(getChunkKindLabel('catchup', rota)).toBe('Recuperación');
    });

    it('las entradas no-string siguen devolviendo lo de siempre', () => {
        expect(getChunkStatusLabel(null)).toBe('');
        expect(getChunkStatusLabel('   ')).toBe('');
        expect(getChunkKindLabel(null)).toBeNull();
        expect(getChunkKindLabel('   ')).toBeNull();
    });
});
