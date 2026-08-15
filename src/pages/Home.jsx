import Hero from '../components/home/Hero';
import HowItWorks from '../components/home/HowItWorks';
import DashboardShowcase from '../components/home/DashboardShowcase';
// [P3-BENCHMARK-SHOWCASE · 2026-06-19] Benchmarks del "modelo Bioboros vX" (precisión
// de macros real) debajo del showcase del dashboard.
import BenchmarkShowcase from '../components/home/BenchmarkShowcase';
// [P3-NEWS-1 · 2026-07-01] La banda de precios del landing se reemplazó por la banda de
// "Novedades" (anuncios de Bioboros, estilo Anthropic/OpenAI). El detalle de planes sigue
// en /precios (link en la nav).
import NewsHighlight from '../components/home/NewsHighlight';
// [P1-PAPER-THEME · 2026-08-01] Banda de cierre: última hija del landing. Pide
// el clic una última vez antes del footer (componente propio, no vive en
// Footer.jsx — ver ClosingBand.jsx).
import ClosingBand from '../components/home/ClosingBand';
import { useEffect } from 'react';

function Home() {
    // [P1-LANDING-HEAD-PRELOAD · 2026-08-14] Avisa de que la portada YA está en el
    // DOM, para que el splash no se retire antes de tiempo.
    //
    // El splash se descartaba con `mealfit:app-ready`, que se emite cuando la
    // sesión resuelve. En el apex eso es SÍNCRONO —`isApexHost()` corta la sesión
    // en seco (P3-APEX-NO-SESSION)—, así que el splash desaparecía mientras el
    // chunk de Home todavía venía por la red: el usuario veía splash → hueco
    // vacío → contenido, y el hueco tenía además su propio spinner a los 250 ms.
    // Un splash que promete «ya casi» y entrega un vacío es peor que no tenerlo.
    //
    // Es una señal ADICIONAL, no un reemplazo: `main.jsx` sólo la espera en `/`
    // del apex y conserva su fallback de 2,5 s, así que si esta portada fallara
    // en montar el splash se retira igual.
    useEffect(() => {
        window.dispatchEvent(new Event('mealfit:landing-ready'));

        // [P3-1-PREFETCH-ASSESSMENT] Prefetch diferido en idle del chunk de onboarding (/assessment)
        // para que cuando el usuario haga clic en "Crear mi plan" la transición sea instantánea (0ms percibidos).
        const prefetchAssessment = () => {
            import('./Assessment').catch(() => {});
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(prefetchAssessment, { timeout: 3500 });
            return () => window.cancelIdleCallback(idleId);
        } else if (typeof window !== 'undefined') {
            const timer = setTimeout(prefetchAssessment, 2500);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, []);

    return (
        <>
            <Hero />
            <HowItWorks />
            <DashboardShowcase />
            <BenchmarkShowcase />
            <NewsHighlight />
            <ClosingBand />
        </>
    );
}

export default Home;
