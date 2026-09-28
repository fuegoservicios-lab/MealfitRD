// frontend/src/components/dashboard/AvisoRegalos.jsx
// [P1-PLAN-LOTE-776 · 2026-09-28] Anuncia UNA vez por dispositivo cada regalo de la cuenta (créditos o plan de
// cortesía): un toast y una entrada en el centro de notificaciones. No pinta nada.
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAssessment } from '../../context/AssessmentContext';
import { formatDate, useT, useTn } from '../../i18n';
import { addNotification } from '../../utils/notifications';
import { regalosPorAnunciar, textoDeRegalo } from '../../utils/regalosCuenta';

export default function AvisoRegalos() {
    const { regalosRecientes } = useAssessment();
    const t = useT();
    const tn = useTn();
    useEffect(() => {
        // El fin es EXCLUSIVO (1-oct 00:00 ⇒ vale hasta el 30-sep): se enseña el último día que vale.
        const fecha = (iso) => formatDate(new Date(Date.parse(iso) - 1), { day: 'numeric', month: 'long' });
        for (const regalo of regalosPorAnunciar(regalosRecientes)) {
            const { title, message } = textoDeRegalo(regalo, { t, tn, fecha });
            addNotification({ id: `regalo-${regalo.id}`, kind: 'regalo', title, message });
            toast.success(title, { description: message });
        }
    }, [regalosRecientes, t, tn]);
    return null;
}
