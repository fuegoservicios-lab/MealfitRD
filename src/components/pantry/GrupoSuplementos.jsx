// [P1-PLAN-LOTE-290 · 2026-09-25] El grupo «Suplementos» arriba de la Alacena: cada pote con sus porciones, su
// etiqueta por porción y, si el plan de hoy lo incluye, cuándo y cuánto. Lo que el plan pide sin pote sale como
// «Del plan». Antes vivían en una tarjeta del Dashboard que no decía cuánto quedaba ni de dónde salían las cifras.
import React, { useState } from 'react';
import { Pill, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { lineaEtiqueta, unidadTexto } from '../../utils/suplementosAlacena';

const estilos = {
    grupo: { border: '1px solid var(--border)', borderRadius: '0.9rem', background: 'var(--bg-card)', padding: '0.85rem 1rem', marginBottom: '0.9rem' },
    titulo: { display: 'flex', alignItems: 'center', gap: '0.45rem', margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' },
    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' },
    pote: { display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 },
    nombre: { fontWeight: 600, color: 'var(--text-main)', overflowWrap: 'anywhere' },
    fino: { fontSize: '0.82rem', color: 'var(--text-muted)' },
    plan: { fontSize: '0.82rem', color: 'var(--primary)' },
    acciones: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' },
    input: { width: '4.5rem', padding: '0.3rem 0.45rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: '0.82rem' },
    boton: { padding: '0.3rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '0.78rem', cursor: 'pointer' },
    quitar: { padding: '0.3rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' },
    chip: { marginLeft: '0.4rem', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', border: '1px solid var(--border)', color: 'var(--text-muted)' },
};

export default function GrupoSuplementos({ potes = [], soloDelPlan = [], onCambiarPorciones = null, onBorrar = null }) {
    const t = useT();
    // [P1-PLAN-LOTE-300] Editar porciones y quitar un pote (detalle pedido por el dueño): borrador por pote.
    const [borrador, setBorrador] = useState({});
    if (!potes.length && !soloDelPlan.length) return null;
    return (
        <section style={estilos.grupo} aria-label={t('Suplementos')}>
            <h4 style={estilos.titulo}><Pill size={16} aria-hidden="true" />{t('Suplementos')}</h4>
            <ul style={estilos.lista}>
                {potes.map((p) => {
                    const n = Math.round(p.porciones);
                    return (
                        <li key={p.id} style={estilos.pote}>
                            <span style={estilos.nombre}>{p.nombre}{p.marca ? ` · ${p.marca}` : ''}</span>
                            <span style={estilos.fino}>
                                {n > 0
                                    ? t('~{n} {unidad}', { n, unidad: unidadTexto(p.unidad, n, t) })
                                    : t('Porciones por confirmar — díselas al coach')}
                            </span>
                            <span style={estilos.fino}>{lineaEtiqueta(p.etiqueta, p.unidad, t)}</span>
                            {p.delPlan && (
                                <span style={estilos.plan}>{t('Plan: {dosis} · {cuando}', { dosis: p.delPlan.dose || '', cuando: p.delPlan.timing || '' })}</span>
                            )}
                            {(onCambiarPorciones || onBorrar) && (
                                <div style={estilos.acciones}>
                                    {onCambiarPorciones && (
                                        <>
                                            <input
                                                type="number" min="0" max="9999" inputMode="numeric" style={estilos.input}
                                                aria-label={t('Porciones de {nombre}', { nombre: p.nombre })}
                                                value={borrador[p.id] ?? (n > 0 ? String(n) : '')}
                                                placeholder={t('Porciones')}
                                                onChange={(e) => setBorrador((b) => ({ ...b, [p.id]: e.target.value }))}
                                            />
                                            <button
                                                type="button" style={estilos.boton}
                                                aria-label={t('Guardar porciones de {nombre}', { nombre: p.nombre })}
                                                onClick={() => {
                                                    const v = Number(borrador[p.id]);
                                                    if (Number.isFinite(v) && v >= 0) onCambiarPorciones(p.id, v);
                                                }}
                                            >
                                                {t('Guardar')}
                                            </button>
                                        </>
                                    )}
                                    {onBorrar && (
                                        <button
                                            type="button" style={estilos.quitar}
                                            aria-label={t('Quitar {nombre}', { nombre: p.nombre })}
                                            title={t('Quitar {nombre}', { nombre: p.nombre })}
                                            onClick={() => onBorrar(p.id)}
                                        >
                                            <Trash2 size={14} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
                {soloDelPlan.map((s) => (
                    <li key={`plan-${s.name}`} style={estilos.pote}>
                        <span style={estilos.nombre}>{s.name}<span style={estilos.chip}>{t('Del plan')}</span></span>
                        <span style={estilos.plan}>{t('Plan: {dosis} · {cuando}', { dosis: s.dose || '', cuando: s.timing || '' })}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
