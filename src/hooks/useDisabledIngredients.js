// [P2-15 · disabledIngredients single-source · 2026-07-09] Store compartido de
// la "Nevera Virtual" (ingredientes marcados agotados). Antes vivía en TRES
// copias sincronizadas a mano: localStorage ('mealfit_disabled_ingredients'),
// useState local de Dashboard (hydrate DB→state con dep [userProfile?.id] —
// bug latente: un cambio de contenido con id igual NO re-mergeaba) y useState
// local de Pantry (solo evento 'storage', que NO dispara en la misma pestaña
// → drift Dashboard↔Pantry hasta reload).
//
// Diseño: store module-level respaldado por localStorage, expuesto con
// useSyncExternalStore. Un solo escritor de localStorage (el store); los
// consumidores (Dashboard, Pantry) ven el mismo valor en la misma pestaña
// (suscripción in-memory) y entre pestañas (evento 'storage'). La
// sincronización a DB (health_profile.disabled_ingredients, debounced) sigue
// siendo responsabilidad de Dashboard — el store es la fuente client-side.
//
// PII/logout: el teardown SSOT (_clearUserScopedCaches en AssessmentContext)
// debe llamar clearDisabledIngredientsStore() además de borrar la key de
// localStorage — sin eso la lista del usuario A quedaría residente en memoria
// tras un logout SPA (misma clase que P3-HIST-MODAL-CACHE-XUSER).
import { useSyncExternalStore } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
import { safeJSONParse } from '../utils/safeJSONParse';

const LS_KEY = 'mealfit_disabled_ingredients';
const EMPTY = [];

// Validator estricto heredado de Dashboard (P2-A · 2026-05-08): array DE
// STRINGS. Un payload legacy/corrupto degrada a [] en vez de romper
// .includes/.map en los consumidores (P4-PANTRY-ARRAY-GUARD).
const _isValid = (v) => Array.isArray(v) && v.every((i) => typeof i === 'string');

const _read = () => {
    const raw = safeLocalStorageGet(LS_KEY, null);
    return safeJSONParse(raw, EMPTY, { validator: _isValid });
};

let _list; // undefined = aún no hidratado (lazy, fuera del critical path del boot)
const _listeners = new Set();

const _getSnapshot = () => {
    if (_list === undefined) _list = _read();
    return _list;
};
const _getServerSnapshot = () => EMPTY;

const _notify = () => { for (const cb of _listeners) cb(); };

const _subscribe = (callback) => {
    _listeners.add(callback);
    // Cross-tab: 'storage' solo dispara en OTRAS pestañas; re-leemos y
    // notificamos. key === null significa localStorage.clear().
    const onStorage = (e) => {
        if (e.key === LS_KEY || e.key === null) {
            _list = _read();
            callback();
        }
    };
    window.addEventListener('storage', onStorage);
    return () => {
        _listeners.delete(callback);
        window.removeEventListener('storage', onStorage);
    };
};

/**
 * Setter global (usable también fuera de componentes). Acepta valor o
 * updater funcional, como setState. Escribe localStorage y notifica a todos
 * los consumidores de la misma pestaña.
 */
export function setDisabledIngredientsGlobal(next) {
    const prev = _getSnapshot();
    const value = typeof next === 'function' ? next(prev) : next;
    const clean = _isValid(value) ? value : EMPTY;
    if (clean === prev) return;
    _list = clean;
    if (clean.length > 0) {
        safeLocalStorageSet(LS_KEY, JSON.stringify(clean));
    } else {
        safeLocalStorageRemove(LS_KEY);
    }
    _notify();
}

/**
 * Teardown de logout/user-switch: borra la copia in-memory Y la key de
 * localStorage. Invocado desde _clearUserScopedCaches (AssessmentContext).
 */
export function clearDisabledIngredientsStore() {
    _list = EMPTY;
    safeLocalStorageRemove(LS_KEY);
    _notify();
}

/**
 * @returns {[string[], typeof setDisabledIngredientsGlobal]} tupla estilo useState.
 */
export function useDisabledIngredients() {
    const list = useSyncExternalStore(_subscribe, _getSnapshot, _getServerSnapshot);
    return [list, setDisabledIngredientsGlobal];
}

// Helper de testing: resetea el store al estado no-hidratado.
export const _resetDisabledIngredientsForTests = () => {
    _list = undefined;
    _listeners.clear();
};
