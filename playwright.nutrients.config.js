import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: './e2e', testMatch: 'micronutrients.visual.js', timeout: 30000, workers: 1,
    use: { baseURL: 'http://127.0.0.1:5177', locale: 'es-DO' },
    projects: ['chromium', 'firefox', 'webkit'].map((name) => ({ name, use: devices[name === 'chromium' ? 'Desktop Chrome' : name === 'webkit' ? 'Desktop Safari' : 'Desktop Firefox'] })),
    webServer: { command: 'node node_modules/vite/bin/vite.js --port 5177 --host 127.0.0.1', url: 'http://127.0.0.1:5177', reuseExistingServer: true },
});
