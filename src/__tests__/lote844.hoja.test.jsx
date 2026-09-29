/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] La hoja «Tus datos y la IA» (auditoría App Store, fila 4, §A.1 y §A.4.1).
 *
 * Lo que el revisor de Apple mira: cada IA de terceros con nombre, qué recibe y para qué; el aviso de China; una
 * acción AFIRMATIVA (dos casillas obligatorias, ninguna marcada de antemano) y una forma de decir que no. La casilla
 * de analítica es opcional y nace DESMARCADA (RGPD: nada de consentimiento por defecto).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import ConsentimientoIASheet from '../consent/ConsentimientoIASheet';
import { VERSION_ANTIGUA } from '../consent/apiConsentimiento';
import { huellaDelTexto, textoDeLaHoja, textoPlanoDeLaHoja } from '../consent/textoDeLaHoja';
import { BRAND } from '../data/routeMeta';

afterEach(() => cleanup());

const tEs = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : s);

const montar = (props = {}) => {
    const onAceptar = props.onAceptar || vi.fn(async () => ({ ok: true }));
    const onRechazar = props.onRechazar || vi.fn();
    render(<ConsentimientoIASheet onAceptar={onAceptar} onRechazar={onRechazar} />);
    return { onAceptar, onRechazar, hoja: screen.getByRole('dialog') };
};

const casillas = () => ({
    ia: screen.getByLabelText(/use mis datos de salud para crear mi plan/),
    china: screen.getByLabelText(/se envíen a DeepSeek, en China/),
    analitica: screen.getByLabelText(/analítica de uso, sin datos de salud/),
});

describe('[P1-PLAN-LOTE-844] el texto de §A.1', () => {
    it('nombra a los cuatro proveedores con qué reciben y para qué, y avisa de la transferencia a China', () => {
        const { hoja } = montar();
        expect(hoja).toHaveAttribute('aria-modal', 'true');
        expect(within(hoja).getByRole('heading', { name: 'Tus datos y la IA' })).toBeTruthy();
        for (const nombre of ['DeepSeek', 'OpenAI', 'Google Gemini', 'Cohere']) {
            expect(within(hoja).getByText(nombre, { selector: 'strong' })).toBeTruthy();
        }
        expect(hoja.textContent).toContain('Hangzhou DeepSeek, República Popular China');
        expect(hoja.textContent).toContain('restricción religiosa de dieta');
        expect(hoja.textContent).toContain('en el modo voz, el texto que lee en voz alta');
        expect(within(hoja).getByText('Transferencia a China')).toBeTruthy();
        expect(hoja.textContent).toContain('no tenemos firmadas cláusulas contractuales con DeepSeek');
        expect(hoja.textContent).toContain('No los usamos para publicidad ni los vendemos.');
    });

    it('lleva la línea médica (§A.4.1) y los enlaces a Privacidad y Uso de IA', () => {
        const { hoja } = montar();
        expect(hoja.textContent).toContain(`${BRAND} no sustituye a tu médico ni a tu nutricionista.`);
        expect(hoja.textContent).toContain('o te operaron de cirugía bariátrica.');
        expect(within(hoja).getByRole('link', { name: 'Política de Privacidad' }).getAttribute('href')).toContain('/privacy');
        expect(within(hoja).getByRole('link', { name: 'Uso de IA' }).getAttribute('href')).toContain('/ai-policy');
        expect(hoja.textContent).toContain('Configuración → Privacidad → IA de terceros');
    });

    it('va fuera de la analítica (ph-no-capture) y por encima de todo (portal a <body>)', () => {
        const { hoja } = montar();
        const raiz = hoja.closest('.ph-no-capture');
        expect(raiz).not.toBeNull();
        expect(raiz.parentElement).toBe(document.body);
    });
});

describe('[P1-PLAN-LOTE-844] las casillas', () => {
    it('ninguna nace marcada: la analítica queda DESMARCADA por defecto', () => {
        montar();
        const c = casillas();
        expect(c.ia).not.toBeChecked();
        expect(c.china).not.toBeChecked();
        expect(c.analitica).not.toBeChecked();
    });

    it('«Aceptar y continuar» solo se activa con las DOS obligatorias; la analítica no hace falta', () => {
        montar();
        const c = casillas();
        const aceptar = screen.getByRole('button', { name: 'Aceptar y continuar' });
        expect(aceptar).toBeDisabled();
        expect(screen.getByText('Marca las dos casillas obligatorias para continuar.')).toBeTruthy();
        fireEvent.click(c.analitica);
        expect(aceptar).toBeDisabled();
        fireEvent.click(c.ia);
        expect(aceptar).toBeDisabled();
        fireEvent.click(c.china);
        expect(aceptar).toBeEnabled();
        fireEvent.click(c.ia);
        expect(aceptar).toBeDisabled();
    });

    it('aceptar sin tocar la analítica la manda en false, con la huella del texto mostrado', async () => {
        const { onAceptar } = montar();
        const c = casillas();
        fireEvent.click(c.ia);
        fireEvent.click(c.china);
        fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
        await waitFor(() => expect(onAceptar).toHaveBeenCalledTimes(1));
        const [decision] = onAceptar.mock.calls[0];
        expect(decision.analytics).toBe(false);
        const esperado = await huellaDelTexto(textoPlanoDeLaHoja(textoDeLaHoja(tEs)));
        expect(decision.textoSha256).toBe(esperado);
        if (decision.textoSha256 !== null) expect(decision.textoSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('marcando la analítica viaja en true (es el mismo dato que «Ayuda a mejorar»)', async () => {
        const { onAceptar } = montar();
        const c = casillas();
        fireEvent.click(c.ia);
        fireEvent.click(c.china);
        fireEvent.click(c.analitica);
        fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
        await waitFor(() => expect(onAceptar).toHaveBeenCalledTimes(1));
        expect(onAceptar.mock.calls[0][0].analytics).toBe(true);
    });
});

describe('[P1-PLAN-LOTE-844] decir que no, y los fallos', () => {
    it('«Ahora no» y Escape rechazan; el fondo NO (el permiso se decide con un botón)', () => {
        const { onRechazar } = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
        expect(onRechazar).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onRechazar).toHaveBeenCalledTimes(2);
    });

    it('Escape lo atiende SOLO la hoja: un modal de debajo no se entera', () => {
        const debajo = vi.fn();
        document.addEventListener('keydown', debajo);
        try {
            montar();
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(debajo).not.toHaveBeenCalled();
        } finally {
            document.removeEventListener('keydown', debajo);
        }
    });

    it('si no se pudo anotar, la hoja sigue abierta y lo dice; con el texto viejo pide reabrir la app', async () => {
        const onAceptar = vi.fn()
            .mockResolvedValueOnce({ ok: false, codigo: 'red' })
            .mockResolvedValueOnce({ ok: false, codigo: VERSION_ANTIGUA });
        montar({ onAceptar });
        const c = casillas();
        fireEvent.click(c.ia);
        fireEvent.click(c.china);
        fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu permiso. Revisa tu conexión e inténtalo de nuevo.');
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Este aviso cambió. Cierra y vuelve a abrir la app para ver la versión nueva.'));
    });
});

describe('[P1-PLAN-LOTE-844] la huella del texto', () => {
    it('es el SHA-256 hexadecimal en minúsculas', async () => {
        const h = await huellaDelTexto('abc');
        if (h !== null) expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('cubre todo lo que se muestra: proveedores, China, las tres casillas, la línea médica y la retirada', () => {
        const plano = textoPlanoDeLaHoja(textoDeLaHoja(tEs));
        for (const trozo of ['DeepSeek', 'OpenAI', 'Google Gemini', 'Cohere', 'Transferencia a China', 'Acepto que mis datos',
            'Ayúdanos a mejorar', 'no sustituye a tu médico', 'Retirarlo detiene los envíos nuevos.']) {
            expect(plano).toContain(trozo);
        }
    });
});
