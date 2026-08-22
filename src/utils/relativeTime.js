// [P2-I18N-RELTIME-HISTORY-CRUDO · 2026-08-22] El tiempo relativo del panel forense.
//
// ═══════════════════════════════════════════════════════════════════════════
// QUÉ PASABA
// ═══════════════════════════════════════════════════════════════════════════
//
// `History.jsx` construía a mano «hace 2h 15m», «ahora», «hace <1m» — en español fijo — y
// después los INTERPOLABA DENTRO de un `t()`:
//
//     t('Escalado a no-recoverable el {fecha}', { fecha: _esc.iso })
//     …y el badge visible: «Escalated: hace 2h 15m»
//
// Media frase traducida y media en español, en el mismo `title`. Es el gemelo exacto de
// `shelfLife.js`, que `P1-I18N-TIEMPO-RELATIVO` cerró el 21-ago y que dejó a este atrás:
// el helper vivía DENTRO del componente, a 3.700 líneas de profundidad, así que ninguna
// búsqueda por «el fichero de utilidades de tiempo» lo alcanzaba.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ `tn()` Y NO `Intl.RelativeTimeFormat`
// ═══════════════════════════════════════════════════════════════════════════
//
// Es la misma razón que quedó escrita en `shelfLife.js`, con un motivo más:
// `RelativeTimeFormat` sabe decir «hace 2 horas» pero **no sabe componer** «hace 2 h 15 min».
// Este panel es forense —lo lee un operador reconstruyendo por qué un chunk escaló— y el
// resto de minutos es justo lo que hace falta para cruzarlo con un log. Colapsarlo a la
// unidad dominante sería perder el dato para ganar una API.
//
// Lo que sí hay que delegar al idioma es el PLURAL, y para eso está `tn()`: el francés mete
// el 0 en singular y el portugués tiene categoría `many`, así que un `n === 1` a mano da la
// forma equivocada en dos de los cuatro idiomas.
//
// Los parámetros se llaman `t` y `tn` A PROPÓSITO: el extractor de `i18n-check` es TEXTUAL y
// busca literalmente `t(` / `tn(`. Con `_t(` / `_tn(` las claves quedarían INVISIBLES para
// el gate — y en español no se notaría nada, que es lo que las haría permanentes.

/** Interpolación mínima, para que el módulo sea puro y sus tests no monten el motor. */
const _interp = (s, vars) =>
    String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));

// El fallback INTERPOLA. Un `(es) => es` pelado deja `{h}` crudo en pantalla — que es
// justo el defecto que este mismo repo cerró en la nota clínica del PDF el mismo día, y
// que aquí destapó el test de «idéntico a lo que había antes».
const _tFallback = (es, vars) => _interp(es, vars);
const _tnFallback = (n, one, other, vars) => _interp(n === 1 ? one : other, vars);

/**
 * `formatRelativeTime(iso, t, tn)` -> { rel, iso } | null
 *
 * `rel` es el texto relativo ya traducido; `iso` lo compone el llamador con `formatDate`,
 * que ya sigue el locale. Devuelve `null` con una entrada que no sea una fecha usable — el
 * llamador pinta el badge sólo si hay algo que pintar.
 *
 * Sin `t`/`tn` el módulo devuelve el español, idéntico a lo que había antes: así sus tests
 * miden la ARITMÉTICA sin montar el motor de i18n.
 */
export const formatRelativeTime = (iso, tFn, tnFn) => {
    if (!iso || typeof iso !== 'string') return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;

    const t = typeof tFn === 'function' ? tFn : _tFallback;
    const tn = typeof tnFn === 'function' ? tnFn : _tnFallback;

    const diffMs = Date.now() - d.getTime();
    // Marcas futuras (desfase de reloj, o un bug del backend): «ahora» y no «hace -5m».
    if (diffMs < 0) return { fecha: d, rel: t('ahora') };

    const seg = Math.floor(diffMs / 1000);
    const min = Math.floor(seg / 60);
    const horas = Math.floor(min / 60);
    const dias = Math.floor(horas / 24);

    if (seg < 60) return { fecha: d, rel: t('hace <1m') };
    // `min` y `h` van por `t()` y no por `tn()`: una unidad ABREVIADA no flexiona en
    // ninguno de los cinco idiomas («2 min», «1 min»), y las dos claves ya existían en los
    // catálogos como valor simple — declararlas plurales las habría vuelto INSERVIBLES,
    // que es exactamente lo que el gate cazó al escribir esto. El plural real es el de
    // «día», que sí flexiona, y ese sí va por `tn()`.
    if (min < 60) return { fecha: d, rel: t('hace {n} min', { n: min }) };

    if (horas < 24) {
        const restoMin = min - horas * 60;
        return {
            fecha: d,
            rel: restoMin > 0
                ? t('hace {h} h {m} min', { h: horas, m: restoMin })
                : t('hace {n} h', { n: horas }),
        };
    }

    const restoHoras = horas - dias * 24;
    return {
        fecha: d,
        rel: restoHoras > 0
            ? t('hace {d} d {h} h', { d: dias, h: restoHoras })
            : tn(dias, 'hace {n} día', 'hace {n} días', { n: dias }),
    };
};
