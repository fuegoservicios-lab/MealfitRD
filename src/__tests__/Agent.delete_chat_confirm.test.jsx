// [P2-CHAT-DELETE-CONFIRM · 2026-09-03] Borrar un chat de «Recientes» pide confirmación (hoja inferior
// en móvil, con el título del chat) y la papelera pasa de botón con borde rojo en cada fila a icono
// fantasma con la misma área táctil de 44px.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const AGENT = read('src/pages/AgentPage.jsx');
const SIDEBAR = read('src/components/agent/SidebarRecientes.jsx');

describe('confirmación antes de borrar', () => {
    it('el toque solo abre la hoja; el DELETE vive únicamente en la confirmación', () => {
        expect(AGENT).toContain('const [chatToDelete, setChatToDelete] = useState(null);');
        expect(AGENT).toContain("const handleDeleteChat = (sessionIdToDelete, e, title = '') => {");
        expect(AGENT).toContain('setChatToDelete({ id: sessionIdToDelete, title: title || \'\' });');
        expect(AGENT).toContain('const deleteChatConfirmed = async (sessionIdToDelete) => {');
        const deletes = AGENT.match(/fetchWithAuth\(`\/api\/chat\/session\/\$\{sessionIdToDelete\}`/g) || [];
        expect(deletes).toHaveLength(1);
        const iHandle = AGENT.indexOf('const handleDeleteChat = ');
        const iConfirmed = AGENT.indexOf('const deleteChatConfirmed = ');
        const iDelete = AGENT.indexOf('fetchWithAuth(`/api/chat/session/${sessionIdToDelete}`');
        expect(iDelete).toBeGreaterThan(iConfirmed);
        expect(iConfirmed).toBeGreaterThan(iHandle);
    });
    it('la hoja muestra el título del chat, es accesible y borra solo desde «Eliminar»', () => {
        expect(AGENT).toContain("import Modal from '../components/common/Modal';");
        const i = AGENT.indexOf('titleId="delete-chat-title"');
        expect(i).toBeGreaterThan(0);
        const block = AGENT.slice(i - 200, i + 3200);
        expect(block).toContain('isOpen={!!chatToDelete}');
        expect(block).toContain('isBottomSheetOnMobile={true}');
        expect(block).toContain("t('¿Eliminar esta conversación?')");
        expect(block).toContain('{chatToDelete.title}');
        expect(block).toContain("t('Se borrará de tus recientes y no se puede recuperar.')");
        expect(block).toContain('onClick={confirmDeleteChat}');
        // [P2-HOVER-NO-MOTION · 2026-09-03] relleno sólido por clase SSOT (--danger-fill), no --danger inline
        expect(block).toContain('className="ui-btn-danger"');
        expect(block).not.toContain("background: 'var(--danger)'");
    });
});

describe('papelera discreta en la lista', () => {
    it('icono fantasma, área táctil de 44px, separada del borde, y pasa el título a la confirmación', () => {
        const i = SIDEBAR.indexOf('className="chat-actions-hover chat-delete-btn"');
        expect(i).toBeGreaterThan(0);
        const block = SIDEBAR.slice(i, i + 1400);
        expect(block).toContain('onClick={(e) => handleDeleteChat(s.id, e, originalTitle)}');
        expect(block).toContain("background: 'transparent',");
        expect(block).toContain("border: 'none',");
        expect(block).toContain("right: '0.45rem',");
        expect(block).toContain("width: '44px',");
        expect(block).toContain("height: '44px',");
        expect(block).not.toContain("color: '#ef4444'");
        expect(SIDEBAR).not.toContain("onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, #ef4444 15%, transparent)'}");
        expect(AGENT).toContain('.chat-delete-btn:hover,');
    });
    it('catálogos: las dos claves nuevas en los 4 idiomas', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['¿Eliminar esta conversación?'], loc).toBeTruthy();
            expect(cat['Se borrará de tus recientes y no se puede recuperar.'], loc).toBeTruthy();
        }
    });
});
