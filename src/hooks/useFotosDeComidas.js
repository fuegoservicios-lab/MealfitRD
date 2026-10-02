// [P1-PLAN-LOTE-721 · 2026-09-28] Las fotos de los platos registrados (solo en este dispositivo), para pintar.
//
// El almacén (`utils/fotosDeComidas.js`) se importa DINÁMICO a propósito: la tarjeta del contador vive en el trozo
// del panel, que `precache-guard` limita y el precache del apex descarga siempre. Las miniaturas pueden llegar unos
// milisegundos después que la fila; la fila no espera por ellas.
import { useEffect, useState } from 'react';

const cargarAlmacen = () => import('../utils/fotosDeComidas');
const EVENTO = 'mealfit:fotos-de-comidas';   // = EVENTO_FOTOS_DE_COMIDAS del almacén (su test lo ancla)
const VACIO = new Set();

const _conUsuario = (userId) => typeof userId === 'string' && userId.length > 0 && userId !== 'guest';

export function useFotosDeComida(userId, mealId) {
    const [estado, setEstado] = useState({ clave: null, fotos: [] });
    const clave = _conUsuario(userId) && mealId ? `${userId}:${mealId}` : null;
    useEffect(() => {
        if (!clave) return undefined;
        let vivo = true, version = 0, urls = [];
        const soltar = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
        const cargar = async (evento) => {
            if (evento?.detail?.userId && evento.detail.userId !== userId) return;
            const turno = ++version;
            try {
                const almacen = await cargarAlmacen();
                const fotos = await almacen.leerFotosDeComida(userId, mealId);
                if (!vivo || turno !== version) return;
                soltar();
                const nuevas = fotos.map((f) => ({ id: f.id, url: URL.createObjectURL(f.blob) }));
                urls = nuevas.map((f) => f.url);
                setEstado({ clave, fotos: nuevas });
            } catch { /* retain the current pictures if a transient read fails */ }
        };
        cargar();
        window.addEventListener(EVENTO, cargar);
        return () => { vivo = false; window.removeEventListener(EVENTO, cargar); soltar(); };
    }, [clave, userId, mealId]);
    return estado.clave === clave ? estado.fotos : [];
}

/** Los `mealId` de este usuario con foto en el dispositivo. Se refresca al guardar o borrar una foto. */
export function useIdsConFoto(userId) {
    const [estado, setEstado] = useState({ userId: null, ids: VACIO });
    useEffect(() => {
        if (!_conUsuario(userId)) return undefined;
        let vivo = true;
        const cargar = () => {
            cargarAlmacen()
                .then((m) => m.idsConFoto(userId))
                .then((ids) => { if (vivo) setEstado({ userId, ids }); })
                .catch(() => { /* sin fotos: la fila sale sin miniatura */ });
        };
        cargar();
        window.addEventListener(EVENTO, cargar);
        return () => {
            vivo = false;
            window.removeEventListener(EVENTO, cargar);
        };
    }, [userId]);
    return estado.userId === userId ? estado.ids : VACIO;
}

/** Una URL `blob:` de la foto (`'foto'`) o miniatura (`'mini'`) de la comida; `null` si este dispositivo no la tiene y
 *  `undefined` MIENTRAS se mira (la ficha distingue «no hay foto» de «todavía no sé»: si no, su aviso de «sin foto»
 *  parpadearía antes de la foto real). Se suelta al desmontar. */
export function useFotoDeComida(userId, mealId, tipo = 'foto', activa = true) {
    const [estado, setEstado] = useState({ clave: null, url: undefined });
    const clave = activa && _conUsuario(userId) && mealId ? `${userId}:${mealId}:${tipo}` : null;
    useEffect(() => {
        if (!clave) return undefined;
        let vivo = true;
        let url = null;
        const soltar = () => {
            if (url) {
                try { URL.revokeObjectURL(url); } catch { /* ya soltada */ }
                url = null;
            }
        };
        const cargar = () => {
            cargarAlmacen()
                .then((m) => m.leerFotoDeComida(userId, mealId, tipo))
                .then((blob) => {
                    if (!vivo) return;
                    soltar();
                    url = blob ? URL.createObjectURL(blob) : null;
                    setEstado({ clave, url });
                })
                .catch(() => { if (vivo) setEstado({ clave, url: null }); });
        };
        cargar();
        window.addEventListener(EVENTO, cargar);
        return () => {
            vivo = false;
            window.removeEventListener(EVENTO, cargar);
            soltar();
        };
    }, [clave, userId, mealId, tipo]);
    if (!clave) return null;
    return estado.clave === clave ? estado.url : undefined;
}

/** [P1-PLAN-LOTE-727] Enlaza las fotos del chat que falten al abrir el panel y al volver a primer plano: si saliste del
 *  chat antes de que terminara el turno, el coach lo terminó igual (760) pero este teléfono nunca vio su `done`. Sin
 *  fotos pendientes no toca la red. */
export function useEnlazarFotosDelChat(userId) {
    useEffect(() => {
        if (!_conUsuario(userId)) return undefined;
        const enlazar = () => {
            if (document.visibilityState === 'hidden') return;
            import('../utils/fotosDelChat').then((m) => m.vincularFotosDelChat(userId)).catch(() => {});
        };
        enlazar();
        document.addEventListener('visibilitychange', enlazar);
        return () => document.removeEventListener('visibilitychange', enlazar);
    }, [userId]);
}

/** Borra la foto de una comida (fuego y olvido: la comida ya se borró; la foto no puede tumbar nada). */
export function borrarFotoDeComidaEnSegundoPlano(userId, mealId) {
    if (!_conUsuario(userId) || !mealId) return;
    cargarAlmacen().then((m) => m.borrarFotoDeComida(userId, mealId)).catch(() => {});
}
