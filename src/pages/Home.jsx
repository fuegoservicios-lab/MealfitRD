import Hero from '../components/home/Hero';
import HowItWorks from '../components/home/HowItWorks';
import DashboardShowcase from '../components/home/DashboardShowcase';
// [P3-BENCHMARK-SHOWCASE · 2026-06-19] Benchmarks del "modelo Mealfit vX" (precisión
// de macros real) debajo del showcase del dashboard.
import BenchmarkShowcase from '../components/home/BenchmarkShowcase';
// [P3-NEWS-1 · 2026-07-01] La banda de precios del landing se reemplazó por la banda de
// "Novedades" (anuncios de MealfitRD, estilo Anthropic/OpenAI). El detalle de planes sigue
// en /precios (link en la nav).
import NewsHighlight from '../components/home/NewsHighlight';

function Home() {
    return (
        <>
            <Hero />
            <HowItWorks />
            <DashboardShowcase />
            <BenchmarkShowcase />
            <NewsHighlight />
        </>
    );
}

export default Home;
