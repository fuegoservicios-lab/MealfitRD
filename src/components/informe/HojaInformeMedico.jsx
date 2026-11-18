// [P1-PLAN-LOTE-1072 · 2026-11-17] El informe en una hoja que sube desde abajo, encima de donde estabas (el cajón del
// calendario o Ajustes): el dueño veía «raro» que el botón lo sacara a otra página. Va en un portal al <body>: el cajón
// del calendario se anima con `transform`, y un `position: fixed` dentro de él quedaría encerrado en el cajón.
import { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import Modal from '../common/Modal';
import styles from './HojaInformeMedico.module.css';

// Perezoso: el panel (y su PDF) no engorda el cajón del calendario ni Ajustes hasta que se abre la hoja.
const InformeMedicoPanel = lazy(() => import('./InformeMedicoPanel'));

export default function HojaInformeMedico({ abierta, onCerrar }) {
    if (!abierta || typeof document === 'undefined') return null;
    return createPortal(
        <div className={styles.capa}>
            <Modal isOpen={abierta} onClose={onCerrar} titleId="informe-hoja-titulo" isBottomSheetOnMobile maxWidth="520px">
                <div className={styles.hoja}>
                    <Suspense fallback={<div className={styles.cargando}><Loader2 size={22} className="spin-fast" aria-hidden="true" /></div>}>
                        <InformeMedicoPanel tituloId="informe-hoja-titulo" />
                    </Suspense>
                </div>
            </Modal>
        </div>,
        document.body,
    );
}

HojaInformeMedico.propTypes = { abierta: PropTypes.bool, onCerrar: PropTypes.func.isRequired };
