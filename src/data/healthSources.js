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
    const ids = new Set(context === 'chat' ? [] : ['energy', 'foods', 'dri', 'diet']);
    if (context === 'tracking') ids.add('amdr');
    if (/calori|kcal|energ|metabol|tdee|deficit|peso|weight|poids/.test(words)) ids.add('energy');
    if (/comid|alimen|food|meal|kcal|carbo|gras|fat|nutri|portion/.test(words)) ids.add('foods');
    if (/vitamin|mineral|fibra|fiber|fibre|agua|water|eau|hidrat|hydrat|hierro|iron|ferro|potas|calci|micronutr/.test(words)) ids.add('dri');
    if (/sodio|sodium|sal\b|salt|sugar|azucar|acucar|sucre|verdura|veget|fruta|fruit|dieta|diet|salud|health|sante/.test(words)) ids.add('diet');
    if (/prote[iy]n|muscul|muscle|fuerza|strength/.test(words)) ids.add('protein');
    if (/diabet|gluc|insulin/.test(words)) ids.add('diabetes');
    if (/renal|rinon|kidney|nefr|dial[iy]s|rein\b/.test(words)) ids.add('kidney');
    if (/hiperten|presion|tension|blood pressure|dash|cardio/.test(words)) ids.add('heart');
    return HEALTH_SOURCES.filter(source => ids.has(source.id));
}
