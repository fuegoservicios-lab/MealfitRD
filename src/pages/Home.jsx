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

function Home() {
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
