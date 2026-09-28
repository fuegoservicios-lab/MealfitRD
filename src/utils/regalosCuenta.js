// frontend/src/utils/regalosCuenta.js
// [P1-PLAN-LOTE-776 · 2026-09-28] Regalos de la cuenta en el cliente (spec 2026-09-28-admin-cuentas-regalos-design §5).
// El tope lo dice el servidor; lo de COBRO decide por el plan PAGADO (`plan_tier_pagado`); cada regalo se anuncia una
// vez por dispositivo.
import { TIER_CREDITS, tierDisplayName } from '../config/plans';
// [P2-FRONTEND-LOCALSTORAGE-LINT · 2026-05-23] wrapper fail-safe (iOS Private Mode / cuota) en vez
// de `localStorage.{get,set}Item` crudo — convención del repo, ya usada en AssessmentContext.jsx.
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

const CLAVE_VISTOS = 'mealfit_regalos_vistos';

/** Tope de créditos de planes. Manda el servidor (plan efectivo + regalos); sin él, `config/plans.js`. Antes vivía
 *  copiado a mano en AssessmentContext y a Ultra le decía «Ilimitado» cuando el servidor le pone 500. */
export function limiteDePlanes(tier, servidor) {
    if (tier === 'admin') return 'Ilimitado';
    if (servidor && typeof servidor.limit === 'number' && servidor.limit > 0) return servidor.limit;
    return TIER_CREDITS[tier] ?? TIER_CREDITS.gratis;
}

/** El plan que decide lo de cobro (cancelar, «Tu plan actual»): el que se paga. Las funciones premium siguen
 *  `plan_tier`, que trae la cortesía superpuesta. */
export function planPagado(perfil) {
    const p = perfil?.plan_tier_pagado;
    return typeof p === 'string' && p ? p : (perfil?.plan_tier || null);
}

export function esSuscriptorDePago(perfil) {
    return ['basic', 'plus', 'ultra'].includes(planPagado(perfil));
}

function leerVistos() {
    try {
        const v = JSON.parse(safeLocalStorageGet(CLAVE_VISTOS, '[]'));
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function guardarVistos(ids) {
    // safeLocalStorageSet nunca lanza; sin almacenamiento (iOS Private Mode /
    // cuota agotada) el aviso podría repetirse, nada más.
    safeLocalStorageSet(CLAVE_VISTOS, ids.slice(-50));
}

/** Los regalos que este dispositivo aún no anunció; quedan marcados como vistos al devolverlos. */
export function regalosPorAnunciar(regalos) {
    if (!Array.isArray(regalos) || regalos.length === 0) return [];
    const vistos = new Set(leerVistos());
    const nuevos = regalos.filter((r) => r && typeof r.id === 'string' && !vistos.has(r.id));
    if (nuevos.length) guardarVistos([...vistos, ...nuevos.map((r) => r.id)]);
    return nuevos;
}

/** Título y mensaje del aviso en el idioma de la persona. `fecha(iso)` formatea el último día que vale. */
export function textoDeRegalo(regalo, { t, tn, fecha }) {
    const title = t('Tienes un regalo 🎁');
    const hasta = regalo?.hasta ? fecha(regalo.hasta) : null;
    if (regalo?.tipo === 'plan') {
        const nombre = tierDisplayName(regalo.plan, t);
        return {
            title,
            message: hasta
                ? t('Tienes {nombre} de cortesía hasta el {fecha}.', { nombre, fecha: hasta })
                : t('Ahora tienes {nombre} de cortesía.', { nombre }),
        };
    }
    const n = Number(regalo?.cantidad) || 0;
    if (regalo?.tipo === 'creditos_coach') {
        return {
            title,
            message: tn(n, 'Te regalamos {n} mensaje más con tu coach, válido hasta el {fecha}.',
                'Te regalamos {n} mensajes más con tu coach, válidos hasta el {fecha}.', { n, fecha: hasta }),
        };
    }
    return {
        title,
        message: tn(n, 'Te regalamos {n} crédito para crear planes, válido hasta el {fecha}.',
            'Te regalamos {n} créditos para crear planes, válidos hasta el {fecha}.', { n, fecha: hasta }),
    };
}
