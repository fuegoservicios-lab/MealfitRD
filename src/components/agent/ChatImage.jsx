// [P1-PLAN-LOTE-117] `<img>` de las fotos del chat: la carga (directa o autenticada) vive en hooks/useChatImageSrc.js.
import { useEffect } from 'react';
import { useChatImageSrc } from '../../hooks/useChatImageSrc';

/** `<img>` del chat. `onBroken` avisa cuando la foto se da por perdida (para pintar «Imagen no disponible»). */
export function ChatImage({ url, alt, onBroken, ...rest }) {
    const { src, onError, definitivo } = useChatImageSrc(url);
    useEffect(() => { if (definitivo) onBroken?.(); }, [definitivo, onBroken]);
    if (!src) return <span className="message-media-loading" aria-hidden="true" />;
    return <img src={src} alt={alt} onError={onError} {...rest} />;
}
