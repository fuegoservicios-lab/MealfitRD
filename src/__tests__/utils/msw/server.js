/**
 * [P1-4 · MSW server] setupServer para vitest (node/jsdom). Se instancia con los
 * handlers default; los tests hacen server.use(...) para overridear por-caso.
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
