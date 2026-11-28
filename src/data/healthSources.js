import { i18nKey } from '../i18n';

// Curated references, never URLs invented by the assistant. Scope is explicit:
// these explain the calculations and general guidance, not a medical diagnosis.
export const HEALTH_SOURCES = [
    { id: 'amdr', title: i18nKey('Rangos orientativos de macronutrientes en adultos (AMDR)'), publisher: 'National Academies (2024)', url: 'https://www.nationalacademies.org/read/27957/chapter/5' },
    { id: 'energy', title: i18nKey('Energía estimada: Mifflin–St Jeor'), publisher: 'Mifflin et al., American Journal of Clinical Nutrition (1990)', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
    { id: 'foods', title: i18nKey('Composición de los alimentos'), publisher: 'USDA FoodData Central', url: 'https://fdc.nal.usda.gov/' },
    { id: 'dri', title: i18nKey('Vitaminas, minerales, fibra y agua: referencias DRI'), publisher: 'NIH Office of Dietary Supplements / National Academies', url: 'https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx' },
    { id: 'diet', title: i18nKey('Alimentación saludable y límites de sodio y azúcares'), publisher: 'Organización Mundial de la Salud (OMS)', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
    { id: 'protein', title: i18nKey('Proteína y entrenamiento de fuerza en adultos sanos'), publisher: 'Morton et al., British Journal of Sports Medicine (2018)', url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/' },
    { id: 'diabetes', title: i18nKey('Alimentación y actividad física con diabetes'), publisher: 'NIH / NIDDK', url: 'https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes' },
    { id: 'kidney', title: i18nKey('Alimentación con enfermedad renal: necesidades individuales'), publisher: 'NIH / NIDDK', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/healthy-eating-adults-chronic-kidney-disease' },
    { id: 'heart', title: i18nKey('Patrón DASH y presión arterial'), publisher: 'NIH / NHLBI', url: 'https://www.nhlbi.nih.gov/health/dash-eating-plan' },
];

export function healthSourcesFor(context, text = '') {
    if (context === 'all') return HEALTH_SOURCES;
    const words = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (context === 'chat') {
        const cleanLead = words.replace(/^[\s*_`•\-–—]+/, '');
        const trimmedLead = cleanLead.trim();
        const isSimpleLog = /^(?:anote|sume|corregi|elimine|borre|registre|actualice|guarde|tu\s+(?:desayuno|almuerzo|cena|merienda|snack|suplemento|complemento)\s+quedo\s+anotad|logged|added|updated|deleted|anotei|somei|corrigi|j'ai\s+note|ho\s+annotato)\b/.test(cleanLead);
        const isIdentityOrMeta = /^(?:soy\s+(?:el|tu|un)\s+(?:coach|asistente)\b|i\s*(?:'m|am)\s+(?:the|your|a)\s+(?:bioboros|nutrition|ai)\b|sou\s+(?:o|seu|um)\b|je\s+suis\b|sono\s+il\b)/.test(cleanLead);
        const isPureClarifyingQuestion = (
            trimmedLead.length <= 180
            && trimmedLead.endsWith('?')
            && !/[.!]\s+\S/.test(trimmedLead)
            && /^(?:¿|te refieres|quieres|prefieres|hablas de|dime|cual|que\s+|do you mean|would you like|are you asking|did you mean|voce quer|est-ce que|intendi)/.test(trimmedLead)
        );
        const hasClinicalCue = /\b(?:diabet\w*|gluc\w*|insulin\w*|renal\w*|rinon\w*|kidney\w*|nefr\w*|dial[iy]s\w*|hiperten\w*|presion\w*|tension|blood pressure|dash|cardio\w*|sodio|sodium|colesterol|triglicerid\w*|alergi\w*|intoleran\w*|embaraz\w*|lactan\w*|medicament\w*|interacc\w*|sintom\w*|mareo\w*|hipogluc\w*|medic[oa]\b|doctor\b|oms\b|who\b|nih\b|usda\b|fuente\b|evidencia|estudio\w*)\b/.test(words);
        if ((isSimpleLog || isIdentityOrMeta || isPureClarifyingQuestion) && !hasClinicalCue) return [];
    }
    const ids = new Set(context === 'chat' ? [] : ['energy', 'foods', 'dri', 'diet']);
    if (context === 'tracking') ids.add('amdr');
    if (/\b(?:calori\w*|kcal\w*|energ\w*|metabol\w*|tdee|deficit\w*|peso\w*|weight\w*|poids)\b/.test(words)) ids.add('energy');
    const foodsPattern = context === 'chat'
        ? /\b(?:kcal\w*|carbo\w*|grasa\w*|grasos?|fat\w*|portion\w*|porcion\w*|gramo\w*)\b/
        : /\b(?:comid\w*|alimen\w*|food\w*|meal\w*|kcal\w*|carbo\w*|grasa\w*|grasos?|fat\w*|nutri\w*|portion\w*)\b/;
    if (foodsPattern.test(words)) ids.add('foods');
    if (/\b(?:vitamin\w*|mineral\w*|fibra\w*|fiber\w*|fibre\w*|agua|aguas|water|eau|hidrat\w*|hydrat\w*|hierro|iron|ferro|potas\w*|calci\w*|micronutr\w*|magnes\w*|zinc|folat\w*|selen\w*|iodine|yodo|iode)\b/.test(words)) ids.add('dri');
    if (/\b(?:sodio|sodium|sal|sales|salt|sugar\w*|azucar\w*|acucar|sucre|verdura\w*|veget\w*|fruta\w*|fruit\w*|dieta\w*|diet\w*|salud\w*|health\w*|sante)\b/.test(words)) ids.add('diet');
    if (/\b(?:prote[iy]n\w*|muscul\w*|muscle\w*|fuerza|strength)\b/.test(words)) ids.add('protein');
    if (/\b(?:diabet\w*|gluc\w*|insulin\w*)\b/.test(words)) ids.add('diabetes');
    if (/\b(?:renal\w*|rinon\w*|kidney\w*|nefr\w*|dial[iy]s\w*|rein)\b/.test(words)) ids.add('kidney');
    if (/\b(?:hiperten\w*|presion\w*|tension|blood pressure|dash|cardio\w*)\b/.test(words)) ids.add('heart');
    return HEALTH_SOURCES.filter(source => ids.has(source.id));
}
