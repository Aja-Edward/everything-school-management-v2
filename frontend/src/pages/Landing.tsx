import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from '@/components/home/HeroSection';
import Problems from '@/components/home/landing/Problems';
import Features from '@/components/home/landing/Features';
import HowItWorksSteps from '@/components/home/landing/HowItWorksSteps';
import Pricing from '@/components/home/landing/Pricing';
import Faq from '@/components/home/landing/Faq';
import FinalCta from '@/components/home/landing/FinalCta';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';

const Landing = () => {
  const { isDarkMode } = useGlobalTheme();
  const { hash } = useLocation();

  // The nav links to /#features, /#pricing and so on from other pages. The
  // sections only exist once this lazy page has rendered, so the browser's
  // own jump to the anchor has already missed them.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <main className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      <Hero />
      <Problems />
      <Features />
      <HowItWorksSteps />
      <Pricing />
      <Faq />
      <FinalCta />
    </main>
  );
};

export default Landing;
