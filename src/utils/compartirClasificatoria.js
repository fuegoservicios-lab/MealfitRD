// Historia 9:16 y texto para compartir tu posición en la Clasificatoria de Bioboros.
// Cero datos clínicos o calóricos: solo alias público, rango, liga semanal, puntos y racha.
import { formatNumber, t, tn } from '../i18n';
import { BRAND } from '../data/routeMeta';
import { compartir, SITIO } from './compartirDia';
import { PINCEL } from './historiaConFoto';
import { nombreDelRango } from './juegoPuntos';

const ANCHO = 1080;
const ALTO = 1920;

export function resumenDeClasificatoria(datos, yo) {
    const me = yo || datos?.mi_perfil || {};
    const pos = Number(me?.posicion) || 1;
    const totalJugadores = Math.max(pos, Number(datos?.temporada?.total_jugadores) || 1);
    const ptsSemana = Math.max(0, Number(me?.puntos_semana) || 0);
    const ptsTotales = Math.max(0, Number(me?.puntos_total) || 0);
    const racha = Math.max(0, Number(me?.racha) || 0);
    const alias = String(me?.alias || t('Tú')).trim();
    const rangoClave = String(me?.rank_key || 'bronce');
    const division = me?.rank_division ?? 1;
    const rangoNombre = nombreDelRango(rangoClave, division, t);
    const orden = String(datos?.tab || 'semanal');
    const ambito = String(datos?.scope || 'global');
    return {
        alias,
        posicion: pos,
        totalJugadores,
        ptsSemana,
        ptsTotales,
        racha,
        rangoClave,
        rangoNombre,
        orden,
        ambito,
        enPodio: orden === 'semanal' && pos >= 1 && pos <= 3,
    };
}

export function textoDeClasificatoria(r) {
    const lineas = [
        t('🏆 #{pos} en la clasificatoria de {app}', { pos: r.posicion, app: BRAND }),
        '',
        t('⚡ {n} pts esta semana · {total} pts totales', {
            n: formatNumber(r.ptsSemana),
            total: formatNumber(r.ptsTotales),
        }),
        t('🏅 Rango {rango}', { rango: r.rangoNombre }),
    ];
    if (r.racha >= 2) {
        lineas.push(tn(r.racha, '🔥 Racha de {n} día', '🔥 Racha de {n} días', { n: formatNumber(r.racha) }));
    }
    lineas.push('', t('¿A qué puesto llegas tú esta semana?'), SITIO);
    return lineas.join('\n');
}

function dibujarTarjetaCanvas(r) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = ANCHO;
    canvas.height = ALTO;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
    grad.addColorStop(0, 'rgb(15, 23, 42)');
    grad.addColorStop(0.5, 'rgb(49, 46, 129)');
    grad.addColorStop(1, 'rgb(15, 23, 42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ANCHO, ALTO);

    // Aura superior sutil
    const aura = ctx.createRadialGradient(ANCHO / 2, 460, 40, ANCHO / 2, 460, 480);
    aura.addColorStop(0, r.enPodio ? 'rgba(251, 191, 36, 0.28)' : 'rgba(129, 140, 248, 0.28)');
    aura.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, ANCHO, ALTO);

    const { M, BLANCO, CLARO, TENUE, COLOR } = PINCEL;
    PINCEL.rotulo(ctx, BRAND.toUpperCase(), ANCHO / 2, 270, {
        tam: 30,
        aire: 0.35,
        alinear: 'center',
        color: COLOR.calories[0],
        sombra: false,
    });
    PINCEL.texto(ctx, t('Clasificatoria'), ANCHO / 2, 345, {
        tam: 58,
        peso: 800,
        alinear: 'center',
        color: BLANCO,
    });

    // Tarjeta central esmerilada
    const x = M;
    const y = 460;
    const w = ANCHO - M * 2;
    const h = 920;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    PINCEL.rect(ctx, x, y, w, h, 44);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    PINCEL.rect(ctx, x + 1, y + 1, w - 2, h - 2, 44);
    ctx.stroke();
    ctx.restore();

    if (r.enPodio) {
        PINCEL.insignia(ctx, ANCHO / 2, y + 96, 'center', t('Top {n} semanal', { n: r.posicion }));
    }

    PINCEL.texto(ctx, `#${r.posicion}`, ANCHO / 2, y + 330, {
        tam: 184,
        peso: 800,
        alinear: 'center',
        color: r.enPodio ? COLOR.calories[0] : BLANCO,
    });
    PINCEL.rotulo(
        ctx,
        t('de {total} jugadores', { total: formatNumber(r.totalJugadores) }),
        ANCHO / 2,
        y + 402,
        { tam: 26, alinear: 'center', color: TENUE, sombra: false },
    );

    PINCEL.texto(ctx, r.alias, ANCHO / 2, y + 520, {
        tam: 52,
        peso: 700,
        alinear: 'center',
        color: BLANCO,
        max: w - 96,
    });
    PINCEL.texto(ctx, r.rangoNombre, ANCHO / 2, y + 585, {
        tam: 34,
        peso: 600,
        alinear: 'center',
        color: COLOR.calories[0],
        max: w - 96,
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x + 64, y + 655, w - 128, 2);

    const colW = (w - 96) / 3;
    const cols = [
        { rotulo: t('Esta semana'), valor: `${formatNumber(r.ptsSemana)} pts` },
        { rotulo: t('Totales'), valor: `${formatNumber(r.ptsTotales)} pts` },
        { rotulo: t('Racha'), valor: tn(r.racha, '{n} día', '{n} días', { n: formatNumber(r.racha) }) },
    ];
    cols.forEach((c, idx) => {
        const cx = x + 48 + colW * idx + colW / 2;
        PINCEL.texto(ctx, c.valor, cx, y + 775, {
            tam: 38,
            peso: 800,
            alinear: 'center',
            color: BLANCO,
            max: colW - 12,
        });
        PINCEL.rotulo(ctx, c.rotulo, cx, y + 825, {
            tam: 22,
            alinear: 'center',
            color: CLARO,
            sombra: false,
            max: colW - 12,
        });
    });

    PINCEL.texto(ctx, t('¿A qué puesto llegas tú esta semana?'), ANCHO / 2, ALTO - 290, {
        tam: 32,
        peso: 600,
        alinear: 'center',
        color: CLARO,
    });
    PINCEL.rotulo(ctx, SITIO, ANCHO / 2, ALTO - 230, {
        tam: 24,
        alinear: 'center',
        color: TENUE,
        aire: 0.2,
        sombra: false,
    });

    return canvas;
}

export async function compartirClasificatoria(datos, yo) {
    const r = resumenDeClasificatoria(datos, yo);
    const texto = textoDeClasificatoria(r);
    const canvas = dibujarTarjetaCanvas(r);
    let archivo = null;
    if (canvas && typeof canvas.toBlob === 'function') {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob && typeof File === 'function') {
            archivo = new File([blob], 'clasificatoria-bioboros.png', { type: 'image/png' });
        }
    }
    const estado = await compartir({
        archivo,
        texto,
        titulo: t('Clasificatoria'),
        tituloHoja: t('Compartir clasificatoria'),
    });
    if (estado !== 'fallo') return estado;

    // Fallback en navegadores sin Web Share: descarga PNG (si existe) y copia el texto.
    if (archivo && typeof URL?.createObjectURL === 'function') {
        const url = URL.createObjectURL(archivo);
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = archivo.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }
    try {
        if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(texto);
        return 'descargado';
    } catch {
        return archivo ? 'descargado' : 'fallo';
    }
}
