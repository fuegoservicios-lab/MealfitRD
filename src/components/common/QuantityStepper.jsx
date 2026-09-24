// [P1-PLAN-LOTE-221 · 2026-09-24] La cantidad de un ingrediente: «−  [campo]  +».
//
// EL DEFECTO QUE RESUELVE (un tester de Android, con captura): el campo era `type="number"` controlado con el número
// del estado, y `Number('')` es 0. Al borrar para escribir otra cantidad el 0 volvía al instante y lo que se tecleaba
// quedaba detrás: «010». Es el mismo defecto que `MacroInput` ya había cerrado para las macros
// (P3-SCAN-MACRO-INPUT-EMPTY) y que nunca llegó a la cantidad. Aquí el TEXTO y el NÚMERO van por separado: el campo
// puede quedar vacío mientras se escribe, el padre solo recibe cantidades válidas y, al salir del campo vacío, vuelve la
// última cantidad buena.
//
// `type="text"` + `inputMode="decimal"`, no `type="number"`: con un teclado que pone coma (España, Francia, Italia,
// Brasil) el navegador rechazaba «1,5» en silencio — el mismo arreglo que el componedor (P1-PLAN-LOTE-166).
//
// Al tocar el campo se selecciona lo escrito: lo siguiente que se teclea lo REEMPLAZA, que es lo que la gente espera
// de una cantidad. Y los botones −/+ son el camino cómodo en el teléfono: pasos con sentido para la unidad (media taza,
// un huevo, 10 g) sin abrir el teclado.
//
// `classes` inyectables, como `MacroInput`: la lógica es una y la piel es del modal que lo usa.
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Minus, Plus } from 'lucide-react';
import { useT } from '../../i18n';
import {
    leerCantidad,
    esCantidadEnCurso,
    formatearCantidad,
    pasoDeCantidad,
    minimoDeCantidad,
    topeDeCantidad,
} from '../../utils/cantidadIngrediente';

const QuantityStepper = ({ value, unit, nombre, onChange, disabled = false, classes }) => {
    const t = useT();
    const [texto, setTexto] = useState(() => formatearCantidad(value));
    // Un cambio que viene de FUERA (una porción, los botones) se pinta; uno que salió de este mismo campo no pisa lo que
    // se está escribiendo («1,» sigue siendo «1,» aunque el padre ya tenga 1). Se ajusta durante el render al ver el
    // valor nuevo (el patrón de React para estado derivado de una prop), sin un efecto que pinte dos veces.
    const [valorAntes, setValorAntes] = useState(value);
    if (value !== valorAntes) {
        setValorAntes(value);
        if (leerCantidad(texto) !== value) setTexto(formatearCantidad(value));
    }

    const tope = topeDeCantidad(unit);
    const minimo = minimoDeCantidad(unit);

    const escribir = (e) => {
        const nuevo = e.target.value;
        if (!esCantidadEnCurso(nuevo)) return;
        setTexto(nuevo);
        const n = leerCantidad(nuevo);
        if (n !== null) onChange(Math.min(n, tope));
    };
    const mover = (dir) => {
        const n = pasoDeCantidad(value, unit, dir);
        setTexto(formatearCantidad(n));
        onChange(n);
    };

    return (
        <div className={classes.wrap}>
            <button
                type="button"
                className={classes.btn}
                onClick={() => mover(-1)}
                disabled={disabled || !(value > minimo)}
                aria-label={t('Menos {nombre}', { nombre })}
            >
                <Minus size={16} strokeWidth={2.5} aria-hidden="true" />
            </button>
            <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                className={classes.input}
                value={texto}
                disabled={disabled}
                onChange={escribir}
                onFocus={(e) => {
                    const el = e.target;
                    setTimeout(() => { try { el.select(); } catch { /* ya no está en pantalla */ } }, 0);
                }}
                onBlur={() => setTexto(formatearCantidad(value))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                aria-label={t('Cantidad de {nombre}', { nombre })}
            />
            <button
                type="button"
                className={classes.btn}
                onClick={() => mover(1)}
                disabled={disabled || !(value < tope)}
                aria-label={t('Más {nombre}', { nombre })}
            >
                <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            </button>
        </div>
    );
};

QuantityStepper.propTypes = {
    value: PropTypes.number.isRequired,
    unit: PropTypes.string,
    nombre: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    classes: PropTypes.shape({
        wrap: PropTypes.string,
        btn: PropTypes.string,
        input: PropTypes.string,
    }).isRequired,
};

export default QuantityStepper;
