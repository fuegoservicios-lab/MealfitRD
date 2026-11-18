// [P1-PLAN-LOTE-1034 · 2026-11-17] «Informe para tu médico». El dueño: «debe darme algo para mi médico, eso es para
// ahorrar trabajo a médicos». La app NO diagnostica: resume lo que la persona registró para que su médico lo lea en dos
// minutos, impreso o en PDF.
//
// [P1-PLAN-LOTE-1072] Desde la app se abre en una HOJA (`components/informe/HojaInformeMedico`); esta ruta queda para el
// enlace del coach (`?id=` = el informe que acaba de preparar) y comparte el mismo contenido (`InformeMedicoPanel`).
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';
import Button from '../components/ui/Button';
import InformeMedicoPanel from '../components/informe/InformeMedicoPanel';
import styles from './InformeMedico.module.css';

export default function InformeMedico() {
    const t = useT();
    const navigate = useNavigate();
    const location = useLocation();
    const id = new URLSearchParams(location.search).get('id');
    return (
        <main className={styles.pagina} aria-labelledby="informe-titulo">
            <Button variant="secondary" size="sm" iconOnly className={styles.volver} onClick={() => navigate(-1)} aria-label={t('Volver')}>
                <ArrowLeft size={20} aria-hidden="true" />
            </Button>
            <InformeMedicoPanel idInicial={id} tituloId="informe-titulo" nivelTitulo={1} />
        </main>
    );
}
