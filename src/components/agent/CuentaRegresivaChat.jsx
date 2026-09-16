// [P1-PLAN-LOTE-73 · 2026-09-16] Cuenta regresiva bajo «Nuevo chat»: cuánto falta para que el Agente abra
// solo el chat del día siguiente. Minutos, no segundos: informa sin meter prisa. Se actualiza al cambiar
// cada minuto y vive en su propio componente para no volver a pintar la página del Agente.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { msHastaMedianoche, textoCuentaRegresiva } from '../../utils/chatSessionDay';

const CuentaRegresivaChat = () => {
    const t = useT();
    const [ahora, setAhora] = useState(() => Date.now());

    useEffect(() => {
        let temporizador = null;
        const programar = () => {
            const alSiguienteMinuto = 60000 - (Date.now() % 60000) + 50;
            temporizador = setTimeout(() => {
                setAhora(Date.now());
                programar();
            }, alSiguienteMinuto);
        };
        programar();
        return () => clearTimeout(temporizador);
    }, []);

    return (
        <p
            className="chat-renovacion"
            title={t('El chat se renueva solo cada día a medianoche, si no estás escribiendo.')}
            style={{
                margin: 0,
                height: '1rem',
                lineHeight: '1rem',
                fontSize: '0.72rem',
                fontWeight: 500,
                color: 'var(--text-light)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontVariantNumeric: 'tabular-nums',
            }}
        >
            {textoCuentaRegresiva(msHastaMedianoche(new Date(ahora)), t)}
        </p>
    );
};

export default CuentaRegresivaChat;
