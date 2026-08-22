#!/usr/bin/env node
// [P2-I18N-MANIFEST-MONOLINGUE · 2026-08-21] Un manifiesto por idioma.
//
// EL DEFECTO: `public/manifest.json` trae `name`, `description` y los seis literales de
// los tres `shortcuts` en español, con `lang: "es-DO"`. Un francés instala la PWA desde
// una app que ya está en francés y el icono de su escritorio dice «Nutrición con IA»,
// con atajos «Nuevo Chat» y «Lista del Súper».
//
// No es cosmético: el manifiesto es lo ÚNICO que el sistema operativo recuerda de la
// app. El usuario ve ese nombre cada vez que abre el móvil, mucho después de haber
// olvidado en qué idioma configuró nada.
//
// CÓMO. Se generan `dist/manifest.<locale>.json` en build (mismo patrón que
// `generate-og-image.mjs`) y el boot síncrono de `index.html` —que YA resuelve el
// locale antes del primer paint— reescribe el `href` del `<link rel="manifest">`.
//
// POR QUÉ NO UN MANIFIESTO ÚNICO CON `lang` DINÁMICO: el manifiesto se descarga y se
// cachea POR URL. Un solo fichero significa un solo idioma para todos los que ya lo
// tengan cacheado, y el navegador no lo re-pide al cambiar de idioma. Un fichero por
// idioma hace que cambiar de idioma cambie la URL, que es lo único que el navegador
// entiende como «esto es otra cosa».
//
// EL ESPAÑOL NO SE GENERA: `manifest.json` sigue siendo el de es-DO tal cual, y el boot
// solo reescribe el href cuando el locale NO es el base. Así, si este script no corre
// —o falla— la conducta es exactamente la de hoy.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, '..');
const ORIGEN = join(RAIZ, 'public', 'manifest.json');
const DESTINO = existsSync(join(RAIZ, 'dist')) ? join(RAIZ, 'dist') : join(RAIZ, 'public');

// Las cadenas del manifiesto NO viven en los catálogos de la app: son ocho literales que
// nadie más usa, y meterlas en `locales/*.json` las haría aparecer como claves huérfanas
// (el extractor solo ve `t('…')` en `src/`). Van aquí, al lado de lo que las consume.
const TRADUCCIONES = {
    'en-US': {
        name: 'Bioboros | AI Nutrition',
        description: 'Personalized meal plans powered by advanced AI.',
        shortcuts: [
            { name: 'New Chat', short_name: 'Chat', description: 'Start a new consultation with your AI agent' },
            { name: 'My Plan', short_name: 'Plan', description: 'View my current meal plan' },
            { name: 'Shopping List', short_name: 'Shopping', description: 'View the ingredients to buy' },
        ],
    },
    'pt-BR': {
        name: 'Bioboros | Nutrição com IA',
        description: 'Planos alimentares personalizados com IA avançada.',
        shortcuts: [
            { name: 'Novo Chat', short_name: 'Chat', description: 'Inicie uma nova consulta com seu agente de IA' },
            { name: 'Meu Plano', short_name: 'Plano', description: 'Ver meu plano alimentar atual' },
            { name: 'Lista de Compras', short_name: 'Compras', description: 'Ver os ingredientes para comprar' },
        ],
    },
    'fr-FR': {
        name: 'Bioboros | Nutrition par IA',
        description: 'Des plans alimentaires personnalisés grâce à une IA avancée.',
        shortcuts: [
            { name: 'Nouveau chat', short_name: 'Chat', description: 'Démarre une nouvelle consultation avec ton agent IA' },
            { name: 'Mon plan', short_name: 'Plan', description: 'Voir mon plan alimentaire actuel' },
            { name: 'Liste de courses', short_name: 'Courses', description: 'Voir les ingrédients à acheter' },
        ],
    },
    'it-IT': {
        name: 'Bioboros | Nutrizione con IA',
        description: 'Piani alimentari personalizzati con IA avanzata.',
        shortcuts: [
            { name: 'Nuova chat', short_name: 'Chat', description: 'Avvia una nuova consulenza con il tuo agente IA' },
            { name: 'Il mio piano', short_name: 'Piano', description: 'Vedi il mio piano alimentare attuale' },
            { name: 'Lista della spesa', short_name: 'Spesa', description: 'Vedi gli ingredienti da comprare' },
        ],
    },
};

const base = JSON.parse(readFileSync(ORIGEN, 'utf8'));

for (const [code, tr] of Object.entries(TRADUCCIONES)) {
    const salida = { ...base, name: tr.name, description: tr.description, lang: code };

    // Los atajos se traducen POR POSICIÓN, igual que `_display` espeja los arrays del
    // plan. Si alguien añade un cuarto atajo al manifiesto base y no aquí, el bucle lo
    // deja en español en vez de perderlo — degradación, no pérdida.
    if (Array.isArray(base.shortcuts)) {
        salida.shortcuts = base.shortcuts.map((sc, i) => {
            const t = tr.shortcuts[i];
            return t ? { ...sc, name: t.name, short_name: t.short_name, description: t.description } : sc;
        });
        const faltan = base.shortcuts.length - tr.shortcuts.length;
        if (faltan > 0) {
            console.warn(`  ⚠ ${code}: ${faltan} atajo(s) sin traducir, se quedan en español`);
        }
    }

    // `short_name` de la app NO se traduce: es la marca. «Bioboros» es lo que el usuario
    // busca en su lanzador, y traducirlo sería cambiarle el nombre al producto.
    writeFileSync(join(DESTINO, `manifest.${code}.json`), JSON.stringify(salida, null, 2) + '\n', 'utf8');
}

console.log(
    `[manifest-i18n] ${Object.keys(TRADUCCIONES).length} manifiestos escritos en ${DESTINO} `
    + '(es-DO usa manifest.json tal cual).',
);
