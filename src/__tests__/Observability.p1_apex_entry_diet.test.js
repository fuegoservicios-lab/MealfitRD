/**
 * [P1-APEX-ENTRY-DIET · 2026-08-14] La fachada de observabilidad.
 *
 * Diferir `Sentry.init` sacó 427.010 B de fuente (37,2%) del entry síncrono, que
 * es el recurso #1 del critical path del apex. El precio es una ventana en la que
 * el SDK no existe todavía — y el arranque es justo donde se rompen las cosas.
 *
 * Estos tests cubren esa ventana. No comprueban que la fachada «funcione»:
 * comprueban que NO SE PIERDE NADA mientras Sentry no está, que es la única razón
 * por la que el diferido es aceptable. Si alguno cae, la optimización se convirtió
 * en ceguera y hay que revertirla, no relajar el test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    captureException,
    addBreadcrumb,
    registrarSentry,
    registrarArranqueSentry,
    _tamanoColaParaTests,
    _reiniciarParaTests,
} from '../utils/observability';

const sentryFalso = () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
});

/**
 * Despacha un `error` global marcándolo como manejado.
 *
 * Sin el `preventDefault`, jsdom lo reporta como excepción no capturada y Vitest
 * lo cuenta como «unhandled error» del run entero — ruido que además avisa de
 * posibles falsos positivos en OTROS ficheros. El listener capturador se registra
 * antes que nada y se retira solo.
 */
const lanzarErrorGlobal = (mensaje) => {
    const marcarManejado = (e) => e.preventDefault();
    window.addEventListener('error', marcarManejado, { capture: true });
    try {
        window.dispatchEvent(new ErrorEvent('error', {
            error: new Error(mensaje), message: mensaje, cancelable: true,
        }));
    } finally {
        window.removeEventListener('error', marcarManejado, { capture: true });
    }
};

describe('P1-APEX-ENTRY-DIET · fachada de observabilidad', () => {
    beforeEach(() => {
        _reiniciarParaTests();
        vi.useRealTimers();
    });

    it('encola los errores previos al init y los entrega al registrar Sentry', () => {
        const err = new Error('rompió antes de que Sentry existiera');
        captureException(err, { tags: { donde: 'boot' } });

        expect(_tamanoColaParaTests()).toBe(1);

        const sentry = sentryFalso();
        registrarSentry(sentry);

        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { donde: 'boot' } });
        expect(_tamanoColaParaTests()).toBe(0);
    });

    it('encola breadcrumbs previos al init en vez de tirarlos', () => {
        // El comentario de analytics.js daba por bueno que `addBreadcrumb` fuera
        // no-op sin init. Con el init diferido eso pasaría de "raro" a "el trail
        // de acciones del usuario empieza cuando el idle quiera".
        addBreadcrumb({ message: 'click en Crear mi plan' });
        const sentry = sentryFalso();
        registrarSentry(sentry);
        expect(sentry.addBreadcrumb).toHaveBeenCalledWith({ message: 'click en Crear mi plan' });
    });

    it('captura un error global lanzado antes del init', () => {
        lanzarErrorGlobal('fallo temprano');

        const sentry = sentryFalso();
        registrarSentry(sentry);

        expect(sentry.captureException).toHaveBeenCalledTimes(1);
        const [err, ctx] = sentry.captureException.mock.calls[0];
        expect(err.message).toBe('fallo temprano');
        expect(ctx.tags.fase).toBe('pre-sentry-init');
    });

    it('retira sus handlers al registrar Sentry (si no, todo se reportaría dos veces)', () => {
        const sentry = sentryFalso();
        registrarSentry(sentry);

        // A partir de aquí manda el globalHandlersIntegration del SDK. Si la
        // fachada siguiera escuchando, cada error viajaría duplicado.
        lanzarErrorGlobal('posterior al init');

        expect(sentry.captureException).not.toHaveBeenCalled();
        expect(_tamanoColaParaTests()).toBe(0);
    });

    it('acota la cola: un arranque que falla en bucle no se come la memoria', () => {
        for (let i = 0; i < 200; i++) addBreadcrumb({ message: `crumb ${i}` });
        expect(_tamanoColaParaTests()).toBeLessThanOrEqual(25);
    });

    it('el primer ERROR dispara el arranque del SDK sin esperar al idle', async () => {
        // Esta es la propiedad que hace aceptable el diferido: si no pasa nada,
        // Sentry espera al idle y no compite con el primer paint; si algo falla,
        // el SDK arranca en el turno siguiente del event loop.
        const arrancar = vi.fn();
        registrarArranqueSentry(arrancar);

        captureException(new Error('urgente'));
        await new Promise((r) => setTimeout(r, 0));

        expect(arrancar).toHaveBeenCalledTimes(1);
    });

    it('un breadcrumb NO dispara el arranque temprano (no es una urgencia)', async () => {
        const arrancar = vi.fn();
        registrarArranqueSentry(arrancar);

        addBreadcrumb({ message: 'sólo telemetría' });
        await new Promise((r) => setTimeout(r, 0));

        expect(arrancar).not.toHaveBeenCalled();
    });

    it('registrarSentry es idempotente: idle y error temprano pueden llegar los dos', () => {
        const primero = sentryFalso();
        const segundo = sentryFalso();
        registrarSentry(primero);
        registrarSentry(segundo);

        captureException(new Error('x'));
        expect(primero.captureException).toHaveBeenCalledTimes(1);
        expect(segundo.captureException).not.toHaveBeenCalled();
    });

    it('un SDK que explota al reportar no tumba a quien llamó', () => {
        const roto = {
            captureException: () => { throw new Error('el SDK explotó'); },
            addBreadcrumb: () => { throw new Error('el SDK explotó'); },
        };
        registrarSentry(roto);
        expect(() => captureException(new Error('y'))).not.toThrow();
        expect(() => addBreadcrumb({ message: 'z' })).not.toThrow();
    });
});
