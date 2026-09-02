/**
 * [P1-DASHBOARD-PLAN-SELFHEAL + P1-SW-AUTO-APPLY-SAFE · 2026-07-25]
 * "Sigo teniendo que refrescar el dashboard" — cuarta vez reportado.
 *
 * Las tres correcciones anteriores parcheaban CAMINOS (el recuperador, y dos sitios de
 * `Plan.jsx`) y siempre aparecía otro. Peor: **ninguna llegó al navegador del usuario.**
 *
 * Evidencia del 25/07 — el navegador pidió TRES hashes distintos de `Plan-*.js` en dos horas y
 * sólo uno existía en el servidor; los otros los servía el service worker desde caché. El PWA
 * usa `registerType: 'prompt'`, así que el bundle nuevo espera a que el usuario pulse un toast.
 * Si no lo pulsa, se queda con el viejo **indefinidamente**. Para él, el bug seguía intacto — y
 * con razón.
 *
 * Dos cambios, uno por cada mitad del problema:
 *
 *  1. **Que el arreglo llegue** (`P1-SW-AUTO-APPLY-SAFE`): el SW nuevo se aplica solo cuando es
 *     seguro — pestaña oculta y sin generación en vuelo. Preserva la razón de 'prompt' (no
 *     recargar a mitad de un formulario) sin su coste (quedarse en una versión vieja para
 *     siempre).
 *
 *  2. **Que no dependa del camino** (`P1-DASHBOARD-PLAN-SELFHEAL`): la comprobación va en el
 *     DESTINO. Al montar el dashboard se pregunta al backend si hay un plan que el usuario aún
 *     no ve, se adopta, y **sólo entonces** se ackea.
 *
 * La clave del diseño: **el ack es el recibo de que el usuario recibió el plan, no de que
 * navegamos.** Mientras no se adopte, el KV sigue vivo y cualquier montaje posterior reintenta.
 * Eso es lo que lo hace auto-sanante en vez de un cuarto parche.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _read = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf-8');

const DASH = _read('pages', 'Dashboard.jsx');
const MAIN = _read('main.jsx');


describe('[P1-DASHBOARD-PLAN-SELFHEAL] la comprobación vive en el destino', () => {
    it('el dashboard consulta pending-status al montar', () => {
        // [P1-PAUSED-BANNER-NO-FLASH] el bloque de estado del banner pausado vive entre el marker y el efecto: ventana 6000
        const i = DASH.indexOf('P1-DASHBOARD-PLAN-SELFHEAL');
        expect(i).toBeGreaterThan(-1);
        const body = DASH.slice(i, i + 6000);
        expect(body).toMatch(/fetchWithAuth\('\/api\/plans\/pending-status'\)/);
    });

    it('adopta con expectPlanId (no el camino conservador)', () => {
        const i = DASH.indexOf('P1-DASHBOARD-PLAN-SELFHEAL');
        const body = DASH.slice(i, i + 6000);
        expect(body).toMatch(/expectPlanId:\s*st\.plan_id_final/);
        expect(body).toMatch(/src:\s*'dashboard-selfheal'/);
    });

    it('ACKEA DESPUÉS de adoptar, nunca antes', () => {
        // El corazón del diseño: si se ackea primero y la adopción falla, el KV se pierde y el
        // usuario se queda sin plan hasta refrescar — que es exactamente el bug reportado.
        const i = DASH.indexOf('P1-DASHBOARD-PLAN-SELFHEAL');
        const body = DASH.slice(i, i + 6000);
        const iHydrate = body.indexOf('hydrateLatestPlan');
        const iAck = body.indexOf('pending-status/ack');
        expect(iHydrate).toBeGreaterThan(-1);
        expect(iAck).toBeGreaterThan(iHydrate);
    });

    it('no hace nada si el plan local YA es el del backend', () => {
        const i = DASH.indexOf('P1-DASHBOARD-PLAN-SELFHEAL');
        const body = DASH.slice(i, i + 6000);
        expect(body).toMatch(/planData\?\.id === st\.plan_id_final|planData\.id === st\.plan_id_final/);
    });

    it('no compara por fecha — rompería restaurar del Historial', () => {
        const i = DASH.indexOf('P1-DASHBOARD-PLAN-SELFHEAL');
        const body = DASH.slice(i, i + 6000);
        expect(body).not.toMatch(/created_at/);
    });
});


describe('[P1-SW-AUTO-APPLY-SAFE] el arreglo tiene que llegar al navegador', () => {
    it('se auto-aplica cuando es seguro, sin esperar al toast', () => {
        const i = MAIN.indexOf('P1-SW-AUTO-APPLY-SAFE');
        expect(i).toBeGreaterThan(-1);
        const body = MAIN.slice(i, i + 2200);
        expect(body).toMatch(/updateSW\(true\)/);
        expect(body).toMatch(/visibilityState !== 'hidden'/);
    });

    it('NO se aplica con una generación en vuelo', () => {
        const i = MAIN.indexOf('P1-SW-AUTO-APPLY-SAFE');
        const body = MAIN.slice(i, i + 2200);
        expect(body).toMatch(/mealfit_plan_in_progress/);
    });

    it('conserva el toast como salida manual', () => {
        // [P2-I18N-PWA-UPDATE-TOAST · 2026-08-22] La ventana se acota por ESTRUCTURA
        // (hasta el siguiente marcador del fichero) y los rotulos se comprueban dentro de
        // `t()`. Antes eran 2600 BYTES desde el marcador, y tres lineas de import nuevas
        // dejaron el toast fuera: el guard medía el TAMAÑO del codigo, no su estructura.
        // El ancla es el CALLBACK, no el marcador: `P1-SW-AUTO-APPLY-SAFE` aparece también
        // en la lista de markers del comentario de cabecera, y anclar ahí recortaba la
        // ventana a 26 caracteres — un guard que "encuentra" el sitio equivocado y falla
        // por eso cuesta más que el que no existe.
        const i = MAIN.indexOf('onNeedRefresh() {');
        const _fin = MAIN.indexOf('P2-PWA-UPDATE-POLL', i + 10);
        const body = MAIN.slice(i, _fin > i ? _fin : i + 4000);
        expect(body).toMatch(/t\(\s*'Nueva versión disponible'\s*\)/);
        expect(body).toMatch(/label:\s*t\(\s*'Actualizar'\s*\)/);
    });

    it('limpia su listener al aplicar (sin fugas)', () => {
        const i = MAIN.indexOf('P1-SW-AUTO-APPLY-SAFE');
        const body = MAIN.slice(i, i + 2600);
        expect(body).toMatch(/removeEventListener\('visibilitychange'/);
    });
});
