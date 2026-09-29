// frontend/src/components/dashboard/AvisoRegalos.jsx
// [P1-PLAN-LOTE-776 · 2026-09-28] Anuncia UNA vez por dispositivo cada regalo de la cuenta (créditos o plan de
// cortesía): un toast y una entrada en el centro de notificaciones. No pinta nada.
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { formatDate, useT, useTn } from '../../i18n';
import { addNotification } from '../../utils/notifications';
import { regalosPorAnunciar, textoDeRegalo, ultimoDiaDeRegalo } from '../../utils/regalosCuenta';

export default function AvisoRegalos() {
    const { regalosRecientes } = useAssessment();
    const t = useT();
    const tn = useTn();
    useEffect(() => {
        // [fix-ronda-1] El fin es EXCLUSIVO (1-oct 00:00 ⇒ vale hasta el 30-sep) y fijo a RD: NO el
        // huso del dispositivo (Europa leía 1-oct en vez de 30-sep para un regalo de créditos).
        const fecha = (iso) => ultimoDiaDeRegalo(iso, formatDate);
        for (const regalo of regalosPorAnunciar(regalosRecientes)) {
            const { title, message } = textoDeRegalo(regalo, { t, tn, fecha });
            addNotification({ id: `regalo-${regalo.id}`, kind: 'regalo', title, message });
            toast.success(title, { description: message });
        }
    }, [regalosRecientes, t, tn]);
    return null;
}
