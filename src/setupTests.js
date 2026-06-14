import '@testing-library/jest-dom';
import { vi } from 'vitest';

// [P1-NEON-AUTH-MIGRATION · 2026-06-13] src/authClient.js throwea si
// VITE_NEON_AUTH_URL falta. Lo stubeamos para que cualquier test que importe
// el módulo real (no mockeado) no aborte al cargar.
vi.stubEnv('VITE_NEON_AUTH_URL', 'https://test-ep.neonauth.local/neondb/auth');

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
