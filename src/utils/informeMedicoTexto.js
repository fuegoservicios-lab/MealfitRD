// [P1-PLAN-LOTE-1034 · 2026-11-17] El informe para el médico, en bloques de texto ya traducidos. La pantalla y el PDF
// leen los MISMOS bloques: lo que el médico ve impreso es lo que la persona vio en la app. Aquí no se calcula nada:
// todas las cifras llegan redondeadas del servidor (`informe_medico.py`). Una sección ausente en `data` no se pinta.

const nutrientes = (t) => ({
    fiber: t('Fibra'), sodium: t('Sodio'), potassium: t('Potasio'), calcium: t('Calcio'), iron: t('Hierro'),
    vit_c: t('Vitamina C'), vit_a: t('Vitamina A'), vit_d: t('Vitamina D'), magnesium: t('Magnesio'), zinc: t('Zinc'),
    b12: t('Vitamina B12'), folate: t('Folato'), vit_e: t('Vitamina E'), vit_k: t('Vitamina K'), selenium: t('Selenio'),
    vit_b6: t('Vitamina B6'), iodine: t('Yodo'),
});
const objetivos = (t) => ({
    lose_fat: t('Perder grasa'), gain_muscle: t('Ganar músculo'), maintenance: t('Mantener el peso'),
    maintain: t('Mantener el peso'), performance: t('Rendimiento'), health: t('Salud general'),
});
const sexos = (t) => ({ male: t('Hombre'), female: t('Mujer') });

/** @param {(s: string, v?: object) => string} t */
export function nombreDeNutriente(clave, t) {
    return nutrientes(t)[clave] || String(clave || '');
}

const lista = (xs, t) => (Array.isArray(xs) && xs.length ? xs.join(', ') : t('Ninguno declarado'));

/**
 * @param {object} data  `informe.data` del servidor
 * @param {{t: Function, fmt: (n: number) => string}} deps  `fmt` formatea un número en el idioma activo
 * @returns {Array<{id: string, titulo: string, lineas: string[]}>}
 */
export function bloquesDelInforme(data, { t, fmt = (n) => String(n) }) {
    if (!data || typeof data !== 'object') return [];
    const b = [];
    const p = data.persona;
    if (p) {
        const l = [];
        if (p.edad != null) l.push(t('Edad: {n} años', { n: fmt(p.edad) }));
        if (p.sexo) l.push(t('Sexo: {s}', { s: sexos(t)[p.sexo] || p.sexo }));
        if (p.talla_cm != null) l.push(t('Talla: {n} cm', { n: fmt(p.talla_cm) }));
        if (p.peso_declarado_kg != null) l.push(t('Peso declarado: {n} kg', { n: fmt(p.peso_declarado_kg) }));
        if (p.objetivo) l.push(t('Objetivo en la app: {o}', { o: objetivos(t)[p.objetivo] || p.objetivo }));
        if (p.actividad) l.push(t('Actividad declarada: {a}', { a: p.actividad }));
        if (l.length) b.push({ id: 'persona', titulo: t('Datos de la persona'), lineas: l });
    }
    const d = data.declarado_por_el_paciente;
    if (d) {
        const l = [
            t('Condiciones: {x}', { x: lista(d.condiciones, t) }),
            t('Alergias: {x}', { x: lista(d.alergias, t) }),
            t('Medicamentos: {x}', { x: lista(d.medicamentos, t) }),
            t('Suplementos: {x}', { x: lista(d.suplementos, t) }),
        ];
        const h = d.habitos || {};
        if (h.alcohol) l.push(t('Alcohol: {x}', { x: h.alcohol }));
        if (h.tabaco) l.push(t('Tabaco: {x}', { x: h.tabaco }));
        if (h.cafeina) l.push(t('Cafeína: {x}', { x: h.cafeina }));
        if (h.sueno_h != null) l.push(t('Sueño: {n} h', { n: fmt(h.sueno_h) }));
        b.push({ id: 'declarado', titulo: t('Declarado por la persona'), lineas: l });
    }
    const a = data.adherencia;
    if (a) {
        const l = [t('Días con registro: {n} de {total}', { n: fmt(a.dias_con_registro), total: fmt(a.dias_del_periodo) })];
        if (a.dias_en_meta != null) {
            l.push(t('Días dentro de su meta de energía: {n}', { n: fmt(a.dias_en_meta) }));
            l.push(t('Días por debajo: {n} · por encima: {m}', { n: fmt(a.dias_bajo), m: fmt(a.dias_sobre) }));
        }
        if (a.pct_en_meta_entre_semana != null && a.pct_en_meta_fin_de_semana != null) {
            l.push(t('En meta entre semana: {a} % · fin de semana: {b} %', { a: fmt(a.pct_en_meta_entre_semana), b: fmt(a.pct_en_meta_fin_de_semana) }));
        }
        b.push({ id: 'adherencia', titulo: t('Registro y adherencia'), lineas: l });
    }
    const e = data.energia;
    if (e) {
        const l = [t('Media diaria: {n} kcal', { n: fmt(e.kcal_media) })];
        if (e.meta_media != null) l.push(t('Meta media: {n} kcal ({p} % de la meta)', { n: fmt(e.meta_media), p: fmt(e.pct_de_la_meta) }));
        l.push(t('Rango: {a} a {b} kcal · desviación típica {d} kcal', { a: fmt(e.kcal_min), b: fmt(e.kcal_max), d: fmt(e.desviacion) }));
        if (e.tendencia) {
            l.push(t('Tendencia: primera mitad {a} kcal · segunda mitad {b} kcal', {
                a: fmt(e.tendencia.primera_mitad_kcal), b: fmt(e.tendencia.segunda_mitad_kcal),
            }));
            if (e.tendencia.primera_mitad_pct_en_meta != null && e.tendencia.segunda_mitad_pct_en_meta != null) {
                l.push(t('Adherencia: primera mitad {a} % · segunda mitad {b} % en meta', {
                    a: fmt(e.tendencia.primera_mitad_pct_en_meta), b: fmt(e.tendencia.segunda_mitad_pct_en_meta),
                }));
            }
        }
        b.push({ id: 'energia', titulo: t('Energía'), lineas: l });
    }
    const m = data.macros;
    if (m) {
        const l = [t('Proteína {p} g · carbohidratos {c} g · grasas {g} g (media diaria)', { p: fmt(m.proteina_g), c: fmt(m.carbos_g), g: fmt(m.grasas_g) })];
        if (m.pct_kcal) l.push(t('Reparto de la energía: proteína {p} % · carbohidratos {c} % · grasas {g} %', { p: fmt(m.pct_kcal.proteina), c: fmt(m.pct_kcal.carbos), g: fmt(m.pct_kcal.grasas) }));
        if (m.proteina_g_por_kg != null) l.push(t('Proteína por kg de peso: {n} g/kg', { n: fmt(m.proteina_g_por_kg) }));
        if (m.proteina_por_franja_g) {
            const etiquetasFranja = {
                desayuno: t('Desayuno'), almuerzo: t('Almuerzo'), merienda: t('Merienda'), cena: t('Cena'),
            };
            const partes = Object.entries(m.proteina_por_franja_g)
                .map(([k, v]) => `${etiquetasFranja[k] || k} ${fmt(v)} g`);
            if (partes.length) l.push(t('Proteína media por comida: {x}', { x: partes.join(' · ') }));
        }
        b.push({ id: 'macros', titulo: t('Macronutrientes'), lineas: l });
    }
    const mi = data.micronutrientes;
    if (mi) {
        const l = [t('Días con datos de micronutrientes: {n} de {total}', { n: fmt(mi.dias_con_datos), total: fmt(mi.dias_con_registro) })];
        for (const x of mi.bajo_la_meta || []) l.push(t('{nutriente}: {p} % de su referencia (media)', { nutriente: nombreDeNutriente(x.nutriente, t), p: fmt(x.media_pct_de_la_meta) }));
        for (const x of mi.sobre_el_limite || []) l.push(t('{nutriente}: {p} % del límite recomendado (media)', { nutriente: nombreDeNutriente(x.nutriente, t), p: fmt(x.media_pct_del_limite) }));
        b.push({ id: 'micros', titulo: t('Micronutrientes fuera de su referencia'), lineas: l });
    }
    if (data.hidratacion) {
        b.push({ id: 'agua', titulo: t('Hidratación'), lineas: [t('Media: {n} vasos al día ({d} días con dato)', { n: fmt(data.hidratacion.vasos_media), d: fmt(data.hidratacion.dias_con_dato) })] });
    }
    if (data.peso) {
        const w = data.peso;
        b.push({ id: 'peso', titulo: t('Peso'), lineas: [t('{n} mediciones: de {a} kg a {b} kg (cambio {c} kg)', { n: fmt(w.mediciones), a: fmt(w.primera_kg), b: fmt(w.ultima_kg), c: fmt(w.cambio_kg) })] });
    }
    const pa = data.patrones;
    if (pa) {
        const l = [
            t('Comidas por día: {n}', { n: fmt(pa.comidas_por_dia) }),
            t('Días con desayuno: {p} %', { p: fmt(pa.pct_dias_con_desayuno) }),
        ];
        if (pa.hora_primera_comida && pa.hora_ultima_comida) {
            l.push(t('Primera comida (mediana): {h} · última: {u}', { h: pa.hora_primera_comida, u: pa.hora_ultima_comida }));
        }
        if (pa.pct_cenas_despues_de_las_22 != null) l.push(t('Cenas después de las 22:00: {p} %', { p: fmt(pa.pct_cenas_despues_de_las_22) }));
        if (pa.entre_semana_kcal != null) l.push(t('Entre semana {a} kcal · fin de semana {b} kcal (media)', { a: fmt(pa.entre_semana_kcal), b: fmt(pa.fin_de_semana_kcal) }));
        b.push({ id: 'patrones', titulo: t('Horarios y patrones'), lineas: l });
    }
    if (Array.isArray(data.alimentos_frecuentes) && data.alimentos_frecuentes.length) {
        b.push({ id: 'alimentos', titulo: t('Alimentos más frecuentes'), lineas: data.alimentos_frecuentes.map((x) => t('{nombre}: {n} veces', { nombre: x.nombre, n: fmt(x.veces) })) });
    }
    const lim = (data.limitaciones || []).map((x) => {
        if (x === 'datos_autorreportados') return t('Datos registrados por la propia persona.');
        if (x === 'porciones_estimadas') return t('Porciones estimadas (a menudo por foto).');
        if (x === 'micronutrientes_parciales') return t('Los micronutrientes solo cuentan los días con datos completos.');
        const m2 = /^dias_sin_registro:\s*(\d+)$/.exec(String(x));
        if (m2) return t('Días sin registro en el periodo: {n}', { n: fmt(Number(m2[1])) });
        return null;
    }).filter(Boolean);
    if (lim.length) b.push({ id: 'limitaciones', titulo: t('Limitaciones'), lineas: lim });
    return b;
}

/** Bloques de la redacción (si la hay): resumen, hallazgos y preguntas. */
export function bloquesDeLaRedaccion(narrative, { t }) {
    if (!narrative || typeof narrative !== 'object') return [];
    const b = [];
    if (narrative.resumen) b.push({ id: 'resumen', titulo: t('Resumen'), lineas: [narrative.resumen] });
    const h = (narrative.hallazgos || []).map((x) => x && x.texto).filter(Boolean);
    if (h.length) b.push({ id: 'hallazgos', titulo: t('Hallazgos'), lineas: h.map((x) => `• ${x}`) });
    const q = (narrative.preguntas_para_la_consulta || []).filter(Boolean);
    if (q.length) b.push({ id: 'preguntas', titulo: t('Preguntas para la consulta'), lineas: q.map((x) => `• ${x}`) });
    return b;
}
