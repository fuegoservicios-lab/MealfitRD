// [P1-PLAN-LOTE-1064 · 2026-11-17] El botón de la app (decisión del dueño, auditoría de diseño nº 2).
// Cuatro variantes y dos tamaños; la principal es ÍNDIGO SÓLIDO (`--primary-fill`), sin degradados propios.
// Al pasar el ratón cambia el color, nunca se mueve; al pulsar encoge a 0,97 como el resto de la app.
// Migración: pantalla a pantalla; no escribas un botón nuevo con estilos en línea (ver docs/diseno/ESTILO.md).
import { forwardRef } from 'react';
import styles from './Button.module.css';

const VARIANTES = new Set(['primary', 'secondary', 'text', 'danger']);
const TAMANOS = new Set(['sm', 'md']);

export const Button = forwardRef(function Button(
    { variant = 'primary', size = 'md', iconOnly = false, block = false, className = '', type = 'button', children, ...resto },
    ref,
) {
    const v = VARIANTES.has(variant) ? variant : 'primary';
    const s = TAMANOS.has(size) ? size : 'md';
    const clases = [
        styles.btn, styles[v], styles[s],
        iconOnly ? styles.iconOnly : '', block ? styles.block : '', className,
    ].filter(Boolean).join(' ');
    return (
        <button ref={ref} type={type} className={clases} data-variant={v} {...resto}>
            {children}
        </button>
    );
});

export default Button;
