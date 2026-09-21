// [P1-PLAN-LOTE-144 · 2026-09-20] Aviso de ESTADO del plan: una sola pieza para los avisos que el Dashboard
// apilaba con tres lenguajes distintos (una nota subrayada con el enlace en rojo de error, un recuadro con
// emoji y colores clavados para el tema oscuro, y un panel entero para decir «aún no hay nada»).
//
// Dos pesos, porque no pesan lo mismo:
//   · `accion`  — el usuario TIENE algo que hacer (plan congelado): tarjeta con insignia, título y botón lleno.
//   · `calma`   — no hay nada que hacer (el sondeo descansa): una fila baja, sin título, con botón fantasma.
// El color sale de `--sn-tone` (relleno) y `--sn-ink` (texto), los dos papeles de P1-LIGHT-INK-CONTRACT.
import styles from './StatusNotice.module.css';

export default function StatusNotice({ peso = 'calma', tono = 'hielo', icono, titulo, children, accion, iconoAccion, onAccion }) {
    return (
        <div className={`${styles.aviso} ${styles[peso]} ${styles[tono]}`} role={peso === 'accion' ? 'status' : undefined}>
            {icono && <span className={styles.insignia} aria-hidden="true">{icono}</span>}
            <div className={styles.texto}>
                {titulo && <div className={styles.titulo}>{titulo}</div>}
                <div className={styles.cuerpo}>{children}</div>
            </div>
            {accion && (
                <button type="button" className={styles.boton} onClick={onAccion}>
                    {iconoAccion}
                    {accion}
                </button>
            )}
        </div>
    );
}
