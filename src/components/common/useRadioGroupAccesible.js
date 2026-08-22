// [P3-I18N-RADIOGROUP-TECLADO · 2026-08-21] Teclado y roving tabindex para los cuatro
// `role="radiogroup"` del repo: tema, idioma, país y EvaluarDeNuevo.
//
// EL DEFECTO: los cuatro pintan `role="radiogroup"` con hijos `role="radio"` y ahí se
// acaba. Sin flechas y sin roving tabindex, quien navega con teclado se encuentra:
//
//   · N paradas de tabulador en vez de 1 — el selector de idioma son cinco, así que
//     llegar al siguiente ajuste cuesta cinco pulsaciones de más;
//   · las flechas no hacen nada, que es justo lo que un lector de pantalla ANUNCIA que
//     harán al entrar en un grupo de radio. Prometemos un contrato y no lo cumplimos, y
//     eso es peor que no declarar el rol: el usuario se queda esperando.
//
// POR QUÉ UN HOOK Y NO UN COMPONENTE. La tarea pedía extraer `RadioGroupAccesible.jsx`,
// y los cuatro sitios tienen marcado completamente distinto —uno pinta iconos con fondo
// de color, otro banderas, otro tarjetas con descripción—. Un componente obligaría a
// pasar render-props y a reescribir los cuatro; un hook da el mismo comportamiento
// dejando cada marcado como está. Lo que se comparte es la CONDUCTA, no el aspecto.
//
// La conducta es la de WAI-ARIA para radiogroup: la flecha mueve foco Y selección (no
// solo foco — en un grupo de radio son la misma cosa), envuelve por los extremos, y
// Home/End van al primero y al último.

import { useCallback, useRef } from 'react';

/**
 * @param {Array<string>} valores  los valores en el ORDEN en que se pintan
 * @param {string} activo         el valor seleccionado ahora
 * @param {(v: string) => void} onSelect
 * @returns {{propsGrupo: object, propsRadio: (v: string) => object}}
 */
export function useRadioGroupAccesible(valores, activo, onSelect) {
    // Un ref por valor para poder mover el foco sin consultar el DOM por selector.
    const refs = useRef(new Map());

    const enfocar = useCallback((valor) => {
        const el = refs.current.get(valor);
        if (el && typeof el.focus === 'function') el.focus();
    }, []);

    const mover = useCallback((desde, delta) => {
        const lista = Array.isArray(valores) ? valores : [];
        if (!lista.length) return;
        const i = lista.indexOf(desde);
        // Envuelve por los dos extremos: en un grupo de radio no hay «final» — un
        // usuario que llega al último y pulsa abajo espera volver al primero, no
        // quedarse clavado sin saber si la tecla llegó.
        const siguiente = lista[(((i === -1 ? 0 : i) + delta) % lista.length + lista.length) % lista.length];
        onSelect(siguiente);
        enfocar(siguiente);
    }, [valores, onSelect, enfocar]);

    const onKeyDown = useCallback((e) => {
        const lista = Array.isArray(valores) ? valores : [];
        if (!lista.length) return;
        // El valor del radio que tiene el foco, no el seleccionado: son distintos
        // mientras el usuario se mueve con Tab desde fuera.
        const enfocado = lista.find((v) => refs.current.get(v) === document.activeElement) ?? activo;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                mover(enfocado, 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                mover(enfocado, -1);
                break;
            case 'Home':
                e.preventDefault();
                onSelect(lista[0]);
                enfocar(lista[0]);
                break;
            case 'End':
                e.preventDefault();
                onSelect(lista[lista.length - 1]);
                enfocar(lista[lista.length - 1]);
                break;
            default:
                break;
        }
    }, [valores, activo, mover, onSelect, enfocar]);

    const propsGrupo = { role: 'radiogroup', onKeyDown };

    const propsRadio = useCallback((valor) => {
        const lista = Array.isArray(valores) ? valores : [];
        const seleccionado = valor === activo;
        // Roving tabindex: UNA sola parada de tabulador para todo el grupo. Si no hay
        // nada seleccionado, la parada es el primero — sin esto el grupo entero queda
        // inalcanzable con Tab, que es peor que las N paradas de partida.
        const esLaParada = seleccionado || (!lista.includes(activo) && valor === lista[0]);
        return {
            role: 'radio',
            'aria-checked': seleccionado,
            tabIndex: esLaParada ? 0 : -1,
            ref: (el) => {
                if (el) refs.current.set(valor, el);
                else refs.current.delete(valor);
            },
        };
    }, [valores, activo]);

    return { propsGrupo, propsRadio };
}
