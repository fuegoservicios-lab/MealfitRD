// [P1-PLAN-LOTE-290 · 2026-09-25] El grupo «Suplementos» arriba de la Alacena: cada pote con sus porciones, su
// etiqueta por porción y, si el plan de hoy lo incluye, cuándo y cuánto. Lo que el plan pide sin pote sale como
// «Del plan». Antes vivían en una tarjeta del Dashboard que no decía cuánto quedaba ni de dónde salían las cifras.
// [P1-PLAN-LOTE-627 · 2026-09-27] Lo que escribe el PLAN (nombre, dosis, momento) sale en el idioma del usuario por la
// traducción de textos libres; el nombre del pote que escribió el usuario, tal cual.
// [P1-PLAN-LOTE-766 · 2026-09-29] El dueño, con su ganador de peso recién guardado por el coach: «mejora el diseño
// cuando el suplemento está agregado, está feo». Eran renglones grises sueltos, un campo sin rótulo («Porcione:») y un
// «Guardar» sin contexto. Ahora es una categoría más de la Alacena (cabecera con icono y cuenta) y cada pote una
// tarjeta: nombre y marca, chips de estado (la etiqueta por porción, o «Sin etiqueta» en ámbar con cómo completarla) y
// las porciones con − / + (o, si no se saben, la pregunta con su campo). Sin `onCambiarPorciones` (solo lectura) las
// porciones van en un chip, como antes.
import React, { useState } from 'react';
import { Camera, Globe, Minus, Pill, Plus, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { lineaEtiqueta, unidadTexto } from '../../utils/suplementosAlacena';
import { useTextosTraducidos } from '../../hooks/useTextosTraducidos';
import s from './GrupoSuplementos.module.css';

// [P1-PLAN-LOTE-767 · 2026-09-29] De dónde salen las cifras cuando NO son de la tabla del pote: la Alacena lo dice, y
// cómo dejarlas exactas. Sin tabla, el coach usa las del frente del envase (carbohidratos y grasa estimados) o las busca
// en internet; «estimado» son las típicas de ese tipo de suplemento.
// (Cada rama con su `t()` literal: el extractor de i18n no ve un `t(variable)`.)
function origenDe(fuente, t) {
    switch (fuente) {
        case 'web':
            return { chip: t('De internet'), pista: t('Cifras encontradas en internet: si tu pote dice otra cosa, mándale al coach una foto de la tabla.') };
        case 'frente':
            return { chip: t('Del frente del pote'), pista: t('Carbohidratos y grasa estimados: con una foto de la tabla quedan exactos.') };
        case 'estimado':
            return { chip: t('Estimado'), pista: t('Cifras típicas de este tipo de suplemento: con una foto de la tabla quedan exactas.') };
        default:
            return null;
    }
}

// El borrador de un campo de porciones → número válido, o null.
const porcionesValidas = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : null;
};

function Porciones({ pote, n, onCambiar, t }) {
    const [borrador, setBorrador] = useState(null);   // null = sin tocar (se ve lo guardado)
    const valor = borrador ?? (n > 0 ? String(n) : '');
    const nuevo = porcionesValidas(valor);
    const cambiado = borrador !== null && nuevo !== null && nuevo !== n;
    const guardar = () => {
        if (!cambiado) return;
        onCambiar(pote.id, nuevo);
        setBorrador(null);
    };
    const paso = (d) => {
        const base = porcionesValidas(valor) ?? n;
        const siguiente = Math.max(0, Math.min(9999, base + d));
        setBorrador(null);
        if (siguiente !== n) onCambiar(pote.id, siguiente);
    };
    const campo = {
        'aria-label': t('Porciones de {nombre}', { nombre: pote.nombre }),
        type: 'number', min: '0', max: '9999', inputMode: 'numeric', value: valor,
        onChange: (e) => setBorrador(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } },
    };
    const botonGuardar = (
        <button type="button" className={s.guardar} disabled={!cambiado} onClick={guardar}
            aria-label={t('Guardar porciones de {nombre}', { nombre: pote.nombre })}>
            {t('Guardar')}
        </button>
    );
    if (n <= 0) {
        // No se sabe cuántas trae: la pregunta, con su campo (el coach no siempre lee el envase).
        return (
            <div className={`${s.porciones} ${s.pregunta}`}>
                <span className={s.rotulo}>{t('¿Cuántas porciones trae el pote?')}</span>
                <input className={s.campo} {...campo} />
                {botonGuardar}
            </div>
        );
    }
    return (
        <div className={s.porciones}>
            <span className={s.rotulo}>{t('Te quedan')}</span>
            <div className={s.stepper}>
                <button type="button" className={s.paso} onClick={() => paso(-1)} disabled={n <= 0}
                    aria-label={t('Disminuir {alimento}', { alimento: pote.nombre })}>
                    <Minus size={15} strokeWidth={2.5} aria-hidden="true" />
                </button>
                <input className={s.numero} {...campo} />
                <button type="button" className={s.paso} onClick={() => paso(1)}
                    aria-label={t('Aumentar {alimento}', { alimento: pote.nombre })}>
                    <Plus size={15} strokeWidth={3} aria-hidden="true" />
                </button>
            </div>
            <span className={s.unidad}>{unidadTexto(pote.unidad, n, t)}</span>
            {cambiado && botonGuardar}
        </div>
    );
}

export default function GrupoSuplementos({ potes = [], soloDelPlan = [], onCambiarPorciones = null, onBorrar = null }) {
    const t = useT();
    const tr = useTextosTraducidos([
        ...potes.flatMap((p) => [p.delPlan?.dose, p.delPlan?.timing]),
        ...soloDelPlan.flatMap((x) => [x.name, x.dose, x.timing]),
    ]);
    if (!potes.length && !soloDelPlan.length) return null;
    return (
        <section className={s.grupo} aria-label={t('Suplementos')}>
            <h4 className={s.cabecera}>
                <span className={s.icono}><Pill size={15} aria-hidden="true" /></span>
                <span>{t('Suplementos')}</span>
                <span className={s.cuenta}>{potes.length + soloDelPlan.length}</span>
            </h4>
            <ul className={s.lista}>
                {potes.map((p) => {
                    const n = Math.round(p.porciones);
                    const incompleto = !p.etiqueta || n <= 0;
                    const origen = origenDe(p.fuente, t);   // [P1-PLAN-LOTE-767]
                    return (
                        <li key={p.id} className={incompleto ? `${s.pote} ${s.incompleto}` : s.pote}>
                            <div className={s.arriba}>
                                <span className={s.foto} aria-hidden="true"><Pill size={18} /></span>
                                <div className={s.nombres}>
                                    <span className={s.nombre}>{p.nombre}</span>
                                    {p.marca && <span className={s.marca}>{p.marca}</span>}
                                </div>
                                {onBorrar && (
                                    <button type="button" className={s.quitar} onClick={() => onBorrar(p.id)}
                                        aria-label={t('Quitar {nombre}', { nombre: p.nombre })}
                                        title={t('Quitar {nombre}', { nombre: p.nombre })}>
                                        <Trash2 size={15} aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            <div className={s.chips}>
                                {!onCambiarPorciones && (n > 0
                                    ? <span className={s.chip}>{t('~{n} {unidad}', { n, unidad: unidadTexto(p.unidad, n, t) })}</span>
                                    : <span className={s.aviso}>{t('Porciones por confirmar — díselas al coach')}</span>)}
                                {p.etiqueta
                                    ? <span className={s.chip}>{lineaEtiqueta(p.etiqueta, p.unidad, t)}</span>
                                    : <span className={s.aviso}>{t('Sin etiqueta')}</span>}
                                {p.etiqueta && origen && <span className={s.origen}>{origen.chip}</span>}
                            </div>
                            {p.delPlan && (
                                <span className={s.plan}>{t('Plan: {dosis} · {cuando}', { dosis: tr(p.delPlan.dose || ''), cuando: tr(p.delPlan.timing || '') })}</span>
                            )}
                            {!p.etiqueta && (
                                <p className={s.pista}>
                                    <Camera size={15} aria-hidden="true" />
                                    <span>{t('Mándale al coach una foto de la tabla nutricional para completar sus cifras.')}</span>
                                </p>
                            )}
                            {p.etiqueta && origen && (
                                <p className={s.pista}>
                                    {p.fuente === 'web' ? <Globe size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
                                    <span>{origen.pista}</span>
                                </p>
                            )}
                            {onCambiarPorciones && <Porciones pote={p} n={n} onCambiar={onCambiarPorciones} t={t} />}
                        </li>
                    );
                })}
                {soloDelPlan.map((x) => (
                    <li key={`plan-${x.name}`} className={s.pote}>
                        <div className={s.arriba}>
                            <span className={s.foto} aria-hidden="true"><Pill size={18} /></span>
                            <div className={s.nombres}>
                                <span className={s.nombre}>{tr(x.name)}<span className={s.delPlan}>{t('Del plan')}</span></span>
                            </div>
                        </div>
                        <span className={s.plan}>{t('Plan: {dosis} · {cuando}', { dosis: tr(x.dose || ''), cuando: tr(x.timing || '') })}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
