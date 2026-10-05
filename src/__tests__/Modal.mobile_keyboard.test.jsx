import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Modal from '../components/common/Modal';

function Fixture({ adjust = true }) {
    const inputRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    return <div style={{ transform: 'translateY(0)' }}>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal isOpen={open} onClose={() => setOpen(false)} titleId="title" isBottomSheetOnMobile adjustToKeyboard={adjust} initialFocusRef={inputRef}>
            <h2 id="title">Confirm</h2>
            <label htmlFor="confirmation">Word</label>
            <input id="confirmation" ref={inputRef} value={text} onChange={e => setText(e.target.value)} />
            <button onClick={() => setOpen(false)}>Cancel</button>
        </Modal>
    </div>;
}

let viewport;
let original;
beforeEach(() => {
    original = window.visualViewport;
    viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
});
afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: original });
    document.body.style.overflow = '';
    vi.restoreAllMocks();
});
const open = async () => {
    fireEvent.click(screen.getByText('Open'));
    const field = screen.getByLabelText('Word');
    await waitFor(() => expect(field).toHaveFocus());
    return field;
};
const resize = (height, offsetTop = 0) => act(() => {
    Object.assign(viewport, { height, offsetTop });
    viewport.dispatchEvent(new Event('resize'));
});

describe('confirmation keyboard on its first opening', () => {
    it('follows the visible area through keyboard opening and panning without losing typed text or focus', async () => {
        render(<Fixture />);
        const field = await open();
        const panel = screen.getByRole('dialog');
        const overlay = panel.parentElement;
        expect(overlay.parentElement).toBe(document.body);
        expect(overlay.style.height).toBe('844px');
        resize(441);
        expect(overlay.style.height).toBe('441px');
        expect(overlay.style.top).toBe('0px');
        expect(panel.style.maxHeight).toBe('100%');
        expect(panel.style.overflowY).toBe('auto');
        fireEvent.change(field, { target: { value: 'ELI' } });
        resize(441, 70);
        expect(overlay.style.top).toBe('70px');
        expect(field).toHaveValue('ELI');
        expect(field).toHaveFocus();
        resize(844);
        expect(overlay.style.height).toBe('844px');
        expect(overlay.style.top).toBe('0px');
        expect(field).toHaveFocus();
    });
    it('scrolls only the panel when the keyboard would cover the focused field', async () => {
        render(<Fixture />);
        const field = await open();
        const panel = screen.getByRole('dialog');
        vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 441 });
        vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ top: 420, bottom: 466 });
        resize(441);
        await waitFor(() => expect(panel.scrollTop).toBe(41));
        expect(field).toHaveFocus();
    });
    it('reopens with fresh viewport geometry and keeps the parent scroll lock when canceled', async () => {
        document.body.style.overflow = 'hidden';
        render(<Fixture />);
        await open();
        resize(441, 30);
        fireEvent.click(screen.getByText('Cancel'));
        expect(document.body.style.overflow).toBe('hidden');
        resize(844);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await open();
        expect(screen.getByRole('dialog').parentElement.style.height).toBe('844px');
    });
    it('keeps ordinary modals in their original layout', async () => {
        render(<Fixture adjust={false} />);
        await open();
        const overlay = screen.getByRole('dialog').parentElement;
        resize(441, 70);
        expect(overlay.style.height).toBe('');
        expect(overlay.style.inset).toBe('0px');
    });
});
