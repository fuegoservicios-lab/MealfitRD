// [P3-SCAN-MACRO-INPUT-EMPTY · movido aquí por P1-MANUAL-FOOD-LOG · 2026-08-11]
// El input numérico que tolera el vacío transitorio mientras se edita.
//
// EL DEFECTO QUE RESUELVE, y que una copia reintroduciría: con `value={number}`
// controlado y clamp en el padre, `Number('')` es 0 — al BORRAR el campo para teclear
// otro valor (350 → 80) el input saltaba a "0" al instante y el usuario tecleaba
// encima del cero ("080"). El buffer local permite el vacío mientras se edita; el
// padre recibe el raw y clampea en su state; al perder foco se re-sincroniza el texto
// con el valor clampeado ("08"→"8", ""→"0", sobre-tope→tope).
//
// Vivía dentro de ScanMealModal; se EXTRAE porque el componedor manual necesita el
// mismo input para los alimentos personalizados, y duplicarlo garantiza que el
// próximo fix entre en una copia y la otra conserve el bug (precedente:
// CameraViewfinder / P1-SCANNER-SHARED).
//
// `classes` INYECTABLES a propósito: la lógica es una, la piel es de cada modal. Un
// CSS propio aquí sería la tercera hoja compitiendo con las de los dos modales.
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const MacroInput = ({ label, unit, value, onChange, classes }) => {
    const [text, setText] = useState(() => String(value));
    // Sincroniza cambios EXTERNOS del valor (presets de porción, resultado del
    // escaneo, línea recalculada) — solo si difiere numéricamente, para no pisar un
    // "" o un valor a medio teclear cuando el cambio vino del propio input.
    useEffect(() => {
        setText((prev) => (Number(prev) === value ? prev : String(value)));
    }, [value]);
    return (
        <label className={classes.field}>
            <span className={classes.label}>{label}</span>
            <div className={classes.wrap}>
                <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={text}
                    onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
                    onBlur={() => setText(String(value))}
                    className={classes.input}
                />
                <span className={classes.unit}>{unit}</span>
            </div>
        </label>
    );
};

MacroInput.propTypes = {
    label: PropTypes.string.isRequired,
    unit: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
    classes: PropTypes.shape({
        field: PropTypes.string,
        label: PropTypes.string,
        wrap: PropTypes.string,
        input: PropTypes.string,
        unit: PropTypes.string,
    }).isRequired,
};

export default MacroInput;
