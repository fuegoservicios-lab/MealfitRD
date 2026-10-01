import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight, Download, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../i18n';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { compartirPaginasLista, puedeCompartirLista, descargarPaginaLista } from '../../utils/listaComoImagen';
import styles from './ListaImagenPreview.module.css';

export default function ListaImagenPreview({ imagenes, onClose }) {
    const t = useT();
    const [indice, setIndice] = useState(0);
    const [guardando, setGuardando] = useState(false);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });
    const cuerpo = useRef(null);
    const toque = useRef(null);
    const urls = useMemo(() => imagenes.map(({ blob }) => URL.createObjectURL(blob)), [imagenes]);
    useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
    const mover = (delta) => {
        setIndice((i) => Math.max(0, Math.min(imagenes.length - 1, i + delta)));
        cuerpo.current?.scrollTo?.({ top: 0 });
    };
    const guardar = async () => {
        if (guardando) return;
        setGuardando(true);
        try {
            const resultado = await compartirPaginasLista(imagenes);
            if (resultado === 'fallo') toast.error(t('No se pudo compartir la lista. Puedes descargar cada imagen.'));
        } catch { toast.error(t('Error al generar la lista de compras.')); }
        finally { setGuardando(false); }
    };
    return createPortal(<div className={styles.fondo}>
        <section ref={containerRef} className={styles.hoja} role="dialog" aria-modal="true" aria-labelledby="lista-imagen-titulo" tabIndex={-1}>
            <header className={styles.cabecera}>
                <div><h2 id="lista-imagen-titulo">{t('Lista de compras')}</h2><span>{t('Páginas')} · {indice + 1} / {imagenes.length}</span></div>
                <button type="button" onClick={onClose} aria-label={t('Cerrar')}><X size={22} /></button>
            </header>
            <div ref={cuerpo} className={styles.cuerpo}
                onTouchStart={(e) => { const p = e.touches[0]; toque.current = { x: p.clientX, y: p.clientY }; }}
                onTouchEnd={(e) => {
                    const p = e.changedTouches[0]; const inicio = toque.current; toque.current = null;
                    if (!inicio) return;
                    const dx = p.clientX - inicio.x; const dy = p.clientY - inicio.y;
                    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) mover(dx < 0 ? 1 : -1);
                }}>
                <img src={urls[indice]} alt={`${t('Lista de compras')} ${indice + 1} / ${imagenes.length}`} />
            </div>
            <footer className={styles.pie}>
                {imagenes.length > 1 && <nav className={styles.paginas} aria-label={t('Páginas')}>
                    <button type="button" disabled={indice === 0} onClick={() => mover(-1)} aria-label={t('Imagen anterior')}><ChevronLeft size={22} /></button>
                    <span aria-live="polite">{indice + 1} / {imagenes.length}</span>
                    <button type="button" disabled={indice === imagenes.length - 1} onClick={() => mover(1)} aria-label={t('Imagen siguiente')}><ChevronRight size={22} /></button>
                </nav>}
                <div className={styles.acciones}>
                    <button type="button" className={styles.descargar} onClick={() => {
                        descargarPaginaLista(imagenes[indice]); toast.success(t('Tu lista de compras se guardó como imagen'));
                    }}><Download size={18} />{t('Descargar imagen')}</button>
                    {puedeCompartirLista(imagenes) && <button type="button" className={styles.guardar} disabled={guardando} onClick={guardar}><Share2 size={18} />{t('Compartir lista completa')}</button>}
                </div>
            </footer>
        </section>
    </div>, document.body);
}
ListaImagenPreview.propTypes = { imagenes: PropTypes.arrayOf(PropTypes.shape({ blob: PropTypes.object.isRequired, nombre: PropTypes.string.isRequired })).isRequired, onClose: PropTypes.func.isRequired };
