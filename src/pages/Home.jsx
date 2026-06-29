import Hero from '../components/home/Hero';
import HowItWorks from '../components/home/HowItWorks';
import DashboardShowcase from '../components/home/DashboardShowcase';
// [P3-BENCHMARK-SHOWCASE · 2026-06-19] Benchmarks del "modelo Mealfit vX" (precisión
// de macros real) debajo del showcase del dashboard.
import BenchmarkShowcase from '../components/home/BenchmarkShowcase';
// [P3-PRICING-SEPARATE-PAGE · 2026-06-29] El detalle de planes se movió a /precios
// (estilo Anthropic/OpenAI). El landing solo muestra una banda CTA hacia esa página.
import PricingCta from '../components/home/PricingCta';

function Home() {
    return (
        <>
            <Hero />
            <HowItWorks />
            <DashboardShowcase />
            <BenchmarkShowcase />
            <PricingCta />
        </>
    );
}

export default Home;
