// [P1-PLAN-LOTE-89 · 2026-09-17] El «muelle» de la campana de notificaciones.
//
// En teléfono y tableta la campana deja de ser un tirador pegado al borde derecho (chocaba con
// las tarjetas, y más desde que el contador va a todo el ancho) y atraca DENTRO de la cabecera,
// junto al menú. Hay dos cabeceras (la de DashboardLayout y la propia del chat del Agente), así
// que la campana no sabe de antemano dónde atracar: la cabecera que esté montada registra aquí su
// hueco (`NotificationSlot`) y `NotificationCenter` se portaliza a él.
//
// Un almacén mínimo y no un `getElementById`: al cambiar de ruta una cabecera se desmonta y la otra
// se monta, y un id consultado una vez se queda apuntando a un nodo muerto.
let _node = null;
const _subs = new Set();

const _emit = () => {
    _subs.forEach((fn) => {
        try { fn(); } catch { /* un suscriptor roto no deja a los demás sin aviso */ }
    });
};

export const registerNotifSlot = (node) => {
    if (!node || _node === node) return;
    _node = node;
    _emit();
};

// Solo suelta el hueco quien lo tiene: si la cabecera nueva ya se registró, el desmontaje tardío
// de la vieja no debe borrarla.
export const unregisterNotifSlot = (node) => {
    if (_node !== node) return;
    _node = null;
    _emit();
};

export const subscribeNotifSlot = (fn) => {
    _subs.add(fn);
    return () => { _subs.delete(fn); };
};

export const getNotifSlot = () => _node;
