import Hero from '../components/home/Hero';
import HowItWorks from '../components/home/HowItWorks';
import DashboardShowcase from '../components/home/DashboardShowcase';
// [P3-BENCHMARK-SHOWCASE · 2026-06-19] Benchmarks del "modelo Mealfit vX" (precisión
// de macros real) debajo del showcase del dashboard.
import BenchmarkShowcase from '../components/home/BenchmarkShowcase';
import Pricing from '../components/home/Pricing';

function Home() {
    return (
        <>
            <Hero />
            <HowItWorks />
            <DashboardShowcase />
            <BenchmarkShowcase />
            <Pricing />
        </>
    );
}

export default Home;
