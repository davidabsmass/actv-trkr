import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, 
  Check, 
  Shield, 
  BarChart3, 
  Activity, 
  Layout, 
  MousePointer2, 
  FileCheck, 
  Target, 
  Layers,
  Eye,
  Globe,
  Link2,
  Lock,
  CalendarClock,
  Download,
  Share2,
  Sparkles,
  FileText,
  TrendingUp,
  Search,
  Wifi,
  Palette,
  ShoppingCart,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import logoActvTrkr2 from "@/assets/actv-trkr-logo-2.png";
import logoActvTrkrDark from "@/assets/actv-trkr-logo-dark-2.svg";
import logoMshnCtrl from "@/assets/logo-mshn-ctrl.svg";
import spaceboy from "@/assets/astroman-2.png";
import spaceBgd from "@/assets/space-bgd.jpg";
import newuniLogo from "@/assets/newuni-logo.png";
import SparkleCanvas from "@/components/SparkleCanvas";
import FaqSection from "@/components/FaqSection";
import { HomepageLanguageSwitcher } from "@/components/HomepageLanguageSwitcher";
import helmetImg from "@/assets/helmet.png";
import presentationBgImg from "@/assets/section-2-bgd.jpg";
import platformBg from "@/assets/section-3-space.jpg";
import platformInset from "@/assets/section-3-graphs.png";
import spaceManBack from "@/assets/space-man-back.png";
import conversionBgd from "@/assets/conversion-bgd.jpg";
import fourChart from "@/assets/four-chart.png";
import roverImg from "@/assets/rover.png";
import aiBgd from "@/assets/ai-bgd.jpg";
import aiGraphic from "@/assets/ai-graphic.png";
import pricingBgd from "@/assets/pricing-bgd.jpg";
import pricingAstronaut from "@/assets/pricing-astronaut.png";
import websiteHealthBgd from "@/assets/website-health-bgd.jpg";
import websiteHealthGraphic from "@/assets/website-health-graphic.png";
import satelliteBgd from "@/assets/satellite-bgd.jpg";
import satelliteChart from "@/assets/satellite-chart.png";
import satelliteChartTiny from "@/assets/satellite-chart-tiny.png";
import satelliteImg from "@/assets/satellite.png";
import accountabilityBg from "@/assets/accountability-bg-new.jpg";
import accountabilityInset from "@/assets/accountability-astronaut.png";
import visBehaviorBgd from "@/assets/vis-behavior-bgd.jpg";
import visBehaviorGraphic from "@/assets/vis-behavior-graphic-1.png";
import visBehaviorSmall from "@/assets/vis-behavior-graphic-small.png";
import everythingBgd from "@/assets/everything-bgd.jpg";
import faqsBgd from "@/assets/faqs-bgd.jpg";
import { ContactDialog } from "@/components/landing/ContactDialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const Index = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session, loading, signOut } = useAuth();
  const isLoggedIn = Boolean(session);
  const handleDashboard = () => navigate("/dashboard");
  const handleSignIn = () => navigate("/auth");
  const handleLogout = () => {
    void signOut("/");
  };
  const [scrollY, setScrollY] = useState(0);
  const [isAnnual, setIsAnnual] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const handleDirectCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/actv-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ plan: isAnnual ? "annual" : "monthly" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setCheckoutLoading(false);
    }
  };
  const logoRef = useRef<HTMLImageElement>(null);

  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY);
    if (logoRef.current) {
      const rect = logoRef.current.getBoundingClientRect();
      setShowNav(rect.top <= 0);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // If a password reset link lands on "/" (instead of "/auth"), forward it while preserving tokens.
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlParams = new URLSearchParams(window.location.search);
    const isRecovery = hashParams.get('type') === 'recovery' || urlParams.get('type') === 'recovery';
    const hasTokens = hashParams.has('access_token') || urlParams.has('code');
    if (isRecovery && hasTokens) {
      navigate(`/reset-password${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [navigate]);

  // Auto-redirect logged-in users straight to the dashboard.
  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) return;
    // Don't auto-redirect if the URL has a recovery token — let the recovery effect above handle it.
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlParams = new URLSearchParams(window.location.search);
    const isRecovery = hashParams.get('type') === 'recovery' || urlParams.get('type') === 'recovery';
    if (isRecovery) return;
    navigate("/dashboard", { replace: true });
  }, [loading, isLoggedIn, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 landing-page-fonts">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 1023px) { .prlx { transform: none !important; will-change: auto !important; } } @media (max-width: 767px) { .hero-astronaut-wrap { margin-left: -120px; margin-top: -20px !important; } .hero-space-bg { background-position: 70% top !important; } .landing-section { padding-top: 70px !important; padding-bottom: 70px !important; } } @media (min-width: 768px) and (max-width: 1023px) { .hero-astronaut-wrap { position: absolute !important; left: -402px !important; top: 0 !important; margin: 0 !important; z-index: 0 !important; } .hero-astronaut-wrap img { width: 40rem !important; max-width: none !important; } .hero-headline { font-size: 2.225rem !important; } .hero-content-row { position: relative; } .hero-copy-block { position: relative; z-index: 1; margin-left: auto !important; text-align: left !important; } .hero-copy-block .flex { justify-content: flex-start !important; } .section-copy-block { padding-left: 39px !important; } }` }} />
      <a id="main-content" tabIndex={-1} className="sr-only" aria-hidden="true" />
      {/* Navigation — hidden until scrolled past logo, then sticky */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-black transition-transform duration-300 ${showNav ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-16 flex items-center justify-center md:justify-between">
            <div className="flex items-center gap-2 flex-shrink-0">
              <img src={logoActvTrkr2} alt="ACTV TRKR" className="h-8 w-auto object-contain" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => document.getElementById('all-features-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
                style={{ textTransform: 'uppercase' }}
              >
                Features
              </button>
              <button 
                onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
                style={{ textTransform: 'uppercase' }}
              >
                Pricing
              </button>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <HomepageLanguageSwitcher />
              {!loading && isLoggedIn ? (
                <>
                  <Button className="text-primary-foreground hover:opacity-90" style={{ background: 'linear-gradient(to right, #ae51ff, #8a6ef9)' }} onClick={handleDashboard}>
                    Dashboard
                  </Button>
                  <Button variant="ghost" className="text-primary-foreground hover:bg-primary/10 hover:text-primary-foreground" onClick={handleLogout}>
                    Logout
                  </Button>
                </>
              ) : !loading ? (
                <>
                  <Button variant="ghost" className="text-primary-foreground hover:bg-primary/10 hover:text-primary-foreground" onClick={handleSignIn}>
                    Sign In
                  </Button>
                   <Button className="text-primary-foreground hover:opacity-90" style={{ background: 'linear-gradient(to right, #ae51ff, #8a6ef9)' }} onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
                     Start Your Free Trial
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </nav>

      {/* Floating language switcher — top-right of hero, visible before scroll */}
      <div className="absolute top-4 right-4 z-40">
        <HomepageLanguageSwitcher />
      </div>

      {/* Hero + space background */}
      <div className="relative overflow-hidden bg-black">
        <div
          className="absolute inset-0 w-full h-[120%] prlx hero-space-bg"
          style={{
            backgroundImage: `url(${spaceBgd})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            transform: `translateY(${scrollY * 0.3}px)`,
            willChange: 'transform',
          }}
        />
        {/* Dark gradient overlay for mobile readability — concentrated behind text, letting sky show behind astronaut */}
        <div className="absolute inset-0 md:hidden z-[1]" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 62%, rgba(0,0,0,0.0) 72%, rgba(0,0,0,0.3) 100%)' }} />
        <SparkleCanvas />

        <section className="relative px-6 pt-[10rem] pb-16 md:pt-[calc(10rem+10px)] md:pb-[calc(16px+80px)]">
          <div
            className="max-w-7xl mx-auto relative prlx"
            style={{ zIndex: 2, transform: `translateY(${scrollY * -0.15}px)`, willChange: 'transform' }}
          >
            <div className="flex justify-center mb-[60px] -mt-[80px]">
              <img ref={logoRef} src={logoActvTrkr2} alt="ACTV TRKR" className="h-11 md:h-16 lg:h-[72px] w-auto drop-shadow-lg" />
            </div>

            <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-12 hero-content-row relative">
              {/* Astronaut — below buttons on mobile, left on desktop */}
              <div className="w-full md:w-2/5 lg:w-1/2 flex justify-center md:justify-start mt-4 md:mt-[-60px] md:-ml-16 lg:-ml-24 order-2 md:order-1 hero-astronaut-wrap">
                <img
                  src={spaceboy}
                  alt="Floating astronaut"
                  className="w-[32rem] md:w-80 lg:w-[36rem] drop-shadow-2xl prlx"
                  style={{
                    transform: `translateY(${scrollY * -0.06}px)`,
                    willChange: 'transform',
                  }}
                />
              </div>

              <div className="w-full md:w-3/5 lg:w-1/2 text-center md:text-left order-1 md:order-2 hero-copy-block">
                <h1 className="hero-headline text-lg md:text-[1.6rem] lg:text-[3.05rem] font-normal text-white mb-4 tracking-normal drop-shadow-lg" style={{ lineHeight: '1.1', fontFamily: "'Funnel Display', sans-serif" }}>
                  WordPress Activity. Lead Tracking. Site Health.
                </h1>
                
                <p className="text-base md:text-lg text-white/90 mb-8 md:mb-12 leading-relaxed drop-shadow-md font-light max-w-[38ch] md:max-w-none lg:max-w-[42ch]">
                  ACTV TRKR brings together traffic, forms, lead attribution, visitor activity, and site health across your WordPress site—so you can see what's working, what's not, and what to do next.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3 pb-[30px]">
                  {!loading && (
                    <Button size="default" className="text-base px-6 py-2.5 bg-white text-primary hover:bg-white/90 shadow-xl" onClick={isLoggedIn ? handleDashboard : () => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
                      {isLoggedIn ? "Go to Dashboard" : "Start Your Free Trial"}
                    </Button>
                  )}
                  <Button 
                    size="default" 
                    variant="ghost" 
                    className="text-base px-6 py-2.5 border border-accent text-white hover:bg-accent/10 bg-transparent"
                    onClick={() => document.getElementById('all-features-section')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    View Features
                  </Button>
                  {!loading && (
                    <button
                      onClick={isLoggedIn ? handleLogout : handleSignIn}
                      className="text-base font-medium text-primary-foreground/80 hover:text-primary-foreground transition-colors inline-flex items-center gap-1"
                    >
                      {isLoggedIn ? "Logout" : "Sign In"} <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Section 1 — Dashboard Overview */}
      <section id="features-section" className="px-6 bg-surface/50 landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${presentationBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-2 lg:pl-[29px] section-copy-block">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Layout className="h-4 w-4" />
                Performance Snapshot
              </div>
              <h2 className="font-normal text-foreground mb-6" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                A Clear View of What's Driving Performance
              </h2>
              <p className="text-lg text-muted-foreground mb-4">
                ACTV TRKR brings your most important website data into one clear dashboard—so you can understand performance without jumping between tools.
              </p>
              <ul className="text-muted-foreground text-sm space-y-1.5 mb-4 list-none">
                {[
                  "Which traffic sources are driving results",
                  "Which forms are generating leads",
                  "How visitors move through your site",
                  "Which pages are underperforming",
                  "What issues need attention right now",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mb-6">
                Know what's working, catch what's not, and take action faster.
              </p>
              <a href="#pricing-section" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity" onClick={(e) => { e.preventDefault(); document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Start Your Free Trial <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="relative flex items-center justify-center lg:col-span-3 lg:-ml-16">
              <img 
                src={helmetImg}
                alt="ACTV TRKR dashboard preview"
                className="w-full max-w-2xl h-auto object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Lead Attribution */}
      <section className="relative px-6 overflow-visible landing-section" style={{ paddingTop: '120px', paddingBottom: '50px', backgroundImage: `url(${platformBg})`, backgroundSize: 'cover', backgroundPosition: 'center -40px' }}>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative">
            <div className="relative">
              <img
                src={platformInset}
                alt="Lead attribution analytics"
                 className="w-full lg:w-[85%] h-auto rounded-2xl shadow-2xl prlx"
                 style={{ transform: `translateY(${(scrollY - 800) * -0.08}px)`, willChange: 'transform' }}
              />
            </div>
            <div className="flex flex-col justify-center section-copy-block">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4 w-fit">
                <Target className="h-4 w-4" />
                Lead Attribution
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Know Exactly Where Your Leads Come From
              </h3>
              <p className="text-white/90 max-w-xl mb-2 font-medium text-sm">
                Stop guessing what's working.
              </p>
              <p className="text-white/90 max-w-xl mb-6">
                ACTV TRKR connects every form submission back to the traffic source, campaign, and pages that drove it—so you can clearly see what's generating real results.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-white/70 text-sm max-w-xl mb-6">
                {["Form activity logs", "Lead attribution", "Entries by form", "Source breakdowns", "Exportable lead data"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-white/80 text-sm italic">
                Finally understand what's actually driving leads.
              </p>
            </div>
          </div>
          <img
            src={spaceManBack}
            alt="Astronaut"
            className="absolute bottom-[-50px] left-[35%] h-[65%] w-auto object-contain pointer-events-none z-10 hidden lg:block"
          />
        </div>
      </section>

      {/* Section 3 — Visitor Behavior */}
      <section className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${aiBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 lg:pl-[29px]">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
                <Sparkles className="h-4 w-4" />
                Smart Insights
              </div>
              <h3 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Ask Your AI Agent Anything
              </h3>
              <p className="text-muted-foreground max-w-xl mb-4">
                ACTV TRKR includes an AI agent that analyzes your traffic, leads, and site activity—so you can get answers instantly instead of digging through reports.
              </p>
              <p className="text-sm font-semibold text-foreground mb-2">Ask questions like:</p>
              <ul className="text-muted-foreground text-sm space-y-1.5 mb-4 list-none max-w-xl">
                {[
                  '"Where are my leads coming from?"',
                  '"What changed this week?"',
                  '"Why did conversions drop?"',
                  '"What should I fix right now?"',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="italic">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-sm mb-4">
                Get clear, actionable answers based on your real website data.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-muted-foreground text-sm max-w-xl mb-4">
                {["Instant answers to real questions", "AI-powered insights and recommendations", "Weekly and monthly summaries", "Clear next steps, not just reports"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-foreground text-sm font-medium">
                👉 Know what's happening—and what to do next.
              </p>
            </div>
            <div className="relative flex items-center justify-center lg:col-span-7">
              <img src={aiGraphic} alt="ACTV TRKR AI assistant" className="w-full max-w-lg h-auto relative z-10 lg:-ml-8" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 — Form Monitoring */}
      <section className="px-6 overflow-hidden form-monitoring-section landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${satelliteBgd})`, backgroundSize: 'cover', backgroundPosition: 'right bottom' }}>
        <style dangerouslySetInnerHTML={{ __html: `@media (min-width: 768px) { .form-monitoring-section { background-position: left top !important; } } @media (max-width: 1023px) { .form-monitoring-section { padding-top: 0px !important; background-position: center bottom !important; } }` }} />
        <div className="max-w-7xl mx-auto" style={{ transform: 'translateY(40px)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="relative lg:col-span-7 flex items-end justify-start min-h-0 lg:min-h-[460px]">
               <img src={satelliteChart} alt="Form performance dashboard" className="w-full lg:w-[90%] h-auto rounded-2xl relative z-10 prlx" style={{ transform: `translateY(${(scrollY - 1800) * -0.06}px)`, willChange: 'transform' }} />
               <img src={satelliteChartTiny} alt="Total Submissions" className="absolute top-[92px] right-[10px] lg:top-[90px] lg:right-[2%] w-[130px] lg:w-[150px] h-auto z-20 rounded-xl prlx" style={{ transform: `translateY(${(scrollY - 1800) * -0.12}px)`, willChange: 'transform' }} />
               <img src={satelliteImg} alt="Satellite" className="absolute bottom-[-30px] right-[-15px] lg:bottom-[110px] lg:right-[2%] w-[130px] lg:w-[180px] h-auto z-20 pointer-events-none prlx" style={{ transform: `translateY(${(scrollY - 1800) * 0.05}px) rotate(-10deg)`, willChange: 'transform' }} />
            </div>
            <div className="lg:col-span-5 section-copy-block">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4">
                <FileCheck className="h-4 w-4" />
                Form Monitoring
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Track Performance on Every Form
              </h3>
              <p className="text-white/90 max-w-xl mb-4">
                Your forms are one of the most important parts of your website—and one of the easiest places for problems to go unnoticed.
              </p>
              <p className="text-white/70 max-w-xl mb-4">
                ACTV TRKR tracks submissions, failures, trends, and activity across your WordPress forms so you can see what's converting, what's underperforming, and when something needs attention.
              </p>
              <p className="text-white/70 text-sm max-w-xl mb-4">
                Works across Gravity Forms, WPForms, Contact Form 7, Ninja Forms, Formidable, and more.
              </p>
              <p className="text-white/80 text-sm italic">
                Don't lose leads because something broke.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5 — Website Health */}
      <section className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${websiteHealthBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 lg:pl-[29px] section-copy-block">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
                <Shield className="h-4 w-4" />
                Website Health
              </div>
              <h3 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Catch Problems Before They Cost You
              </h3>
              <p className="text-muted-foreground max-w-xl mb-6">
                ACTV TRKR helps you monitor the health of your website so you can catch broken forms, broken links, SSL issues, uptime problems, and domain-related risks before they affect leads and performance.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-muted-foreground text-sm max-w-xl mb-4">
                {["Site health alerts", "Broken form checks", "Broken link detection", "SSL expiry alerts", "Domain expiry alerts", "Uptime monitoring"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-sm italic">
                Know what needs attention before it starts costing you.
              </p>
            </div>
            <div className="relative flex items-end justify-center lg:col-span-7 pt-0 lg:pt-12">
              <img src={websiteHealthGraphic} alt="Website health monitoring" className="w-full max-w-md lg:max-w-none lg:w-[85%] h-auto relative z-10 prlx" style={{ transform: `translateY(${(scrollY - 2400) * -0.02}px)`, willChange: 'transform' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Section 5b — Visitor Behavior (mirrors Form Monitoring layout) */}
      <section className="relative px-6 overflow-hidden visitor-behavior-section landing-section" style={{ paddingTop: '120px', paddingBottom: '85px', backgroundImage: `url(${visBehaviorBgd})`, backgroundSize: 'cover', backgroundPosition: 'right bottom' }}>
        <SparkleCanvas />
        <style dangerouslySetInnerHTML={{ __html: `@media (min-width: 768px) { .visitor-behavior-section { background-position: left top !important; } } @media (max-width: 1023px) { .visitor-behavior-section { padding-top: 150px !important; background-position: center bottom !important; } }` }} />
        <div className="max-w-7xl mx-auto" style={{ transform: 'translateY(-20px)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="relative lg:col-span-7 flex items-end justify-start min-h-0 lg:min-h-[460px]">
               <img src={visBehaviorGraphic} alt="Session timeline view" className="w-full lg:w-[90%] h-auto rounded-2xl relative z-10 prlx" style={{ transform: `translateY(${(scrollY - 2600) * -0.06 + 60}px)`, willChange: 'transform' }} />
               <img src={visBehaviorSmall} alt="Rocket launch pad" className="absolute bottom-[-105px] right-[-5px] lg:bottom-[-105px] lg:right-[calc(2%-15px)] w-[130px] lg:w-[150px] h-auto z-20 rounded-xl prlx" style={{ transform: `translateY(${(scrollY - 2600) * -0.12 + 60}px)`, willChange: 'transform' }} />
            </div>
            <div className="lg:col-span-5 section-copy-block flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4 w-fit">
                <Eye className="h-4 w-4" />
                Visitor Behavior
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Follow Every Visit From First Click to Conversion
              </h3>
              <p className="text-white/90 max-w-xl mb-6">
                ACTV TRKR ties traffic source, page visits, clicks, and form submissions together into one session timeline—so you can see how users move through your site before they convert.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-white/70 text-sm max-w-xl mb-4">
                {["Session timelines", "Meaningful click tracking", "Page-by-page journeys", "Conversion paths"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-white/80 text-sm italic">
                See how visitors get from first visit to final action.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="all-features-section" className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${everythingBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
              Everything in One Place
            </div>
            <h2 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Everything You Need. One Dashboard.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              From traffic insights to site health alerts, ACTV TRKR brings together the parts of website performance that usually live across multiple tools.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-[10px] pb-[20px]">
            {([
              { icon: TrendingUp, label: "Lead Attribution" },
              { icon: Activity, label: "Real-Time Visitor Activity" },
              { icon: FileCheck, label: "Form Capture" },
              { icon: Search, label: "AI-Powered Insights" },
              { icon: Sparkles, label: "SEO Signals" },
              { icon: Shield, label: "Site Health Monitoring" },
              { icon: Download, label: "PDF Reports" },
              { icon: Activity, label: "Uptime Monitoring" },
              { icon: CalendarClock, label: "Weekly & Monthly Summaries" },
              { icon: Globe, label: "Traffic Source Breakdown" },
              { icon: Target, label: "Conversion Tracking" },
              { icon: BarChart3, label: "Top Page Insights" },
              { icon: Link2, label: "Broken Link Detection" },
              { icon: Lock, label: "SSL & Domain Alerts" },
              { icon: Share2, label: "Shareable Reports" },
            ] as { icon: LucideIcon; label: string }[]).map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/80 border border-border/30 shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-200 backdrop-blur-sm">
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-foreground text-center">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground text-sm mt-6">
            No bloated analytics stack. No scattered reports. Just clear visibility into what your website is doing.
          </p>
        </div>
      </section>


      <section id="pricing-section" className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '120px', paddingBottom: '100px', backgroundImage: `url(${visBehaviorBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <SparkleCanvas />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-6">
            <h2 className="font-normal text-white mb-2" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Simple Pricing
            </h2>
            <p className="text-white/70 max-w-3xl mx-auto" style={{ fontFamily: "'BR Omega', sans-serif" }}>
              ACTV TRKR
            </p>

          </div>

          <div className="max-w-4xl mx-auto" style={{ paddingTop: '20px', paddingBottom: '40px' }}>
            <div className="p-8 rounded-2xl bg-white border border-border/20 shadow-lg flex flex-col items-center text-center">
              <span className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wide">
                14-day free trial
              </span>
              <div className="flex items-center gap-2 mb-4 bg-muted/60 rounded-full px-1 py-1">
                <button
                  onClick={() => setIsAnnual(false)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${!isAnnual ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  style={{ fontFamily: "'BR Omega', sans-serif" }}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setIsAnnual(true)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${isAnnual ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  style={{ fontFamily: "'BR Omega', sans-serif" }}
                >
                  Yearly
                </button>
              </div>

              <div className="mb-1 flex items-end justify-center gap-2">
                <span className="text-4xl font-bold text-primary" style={{ fontFamily: "'Funnel Display', sans-serif" }}>{isAnnual ? '$495' : '$45'}</span>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-muted-foreground text-base">{isAnnual ? '/year' : '/mo'}</span>
                  {isAnnual && (
                    <span className="inline-block text-xs font-bold text-green-600 border border-green-600 rounded-full px-2 py-0.5">🎉 Save $45/yr</span>
                  )}
                </div>
              </div>
              {!isAnnual && (
                <button onClick={() => setIsAnnual(true)} className="text-xs text-green-600 hover:text-green-500 transition-colors mb-4 underline underline-offset-2 decoration-dashed">
                  Switch to yearly &amp; save $45
                </button>
              )}
              
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                Everything you need to track website activity, leads, site health, and reporting in one streamlined dashboard.
              </p>
              
              <p className="text-xs font-semibold text-foreground mb-3">What's included:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 flex-1 w-full">
                {[
                  "1 Website",
                  "Site Health Monitoring",
                  "Weekly & Monthly Summaries",
                  "Traffic Source Tracking",
                  "Broken Form Checks",
                  "Custom Date Range Reports",
                  "UTM Capture",
                  "Broken Link Detection",
                  "Ongoing Reporting History",
                  "Form Tracking",
                  "SSL & Domain Alerts",
                  "60 Days of Recent Detailed Activity",
                  "Lead Attribution",
                  "AI Suggestions",
                  "PDF Exports",
                  "Conversion Tracking",
                  "Top Page Insights",
                  "Shareable Snapshots",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm min-h-7 text-left">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>



              <Button onClick={handleDirectCheckout} className="w-full mt-3" size="lg" disabled={checkoutLoading}>
                {checkoutLoading ? "Redirecting to payment…" : <>Start 14-day free trial <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <p className="text-center text-sm text-muted-foreground mt-3" style={{ fontFamily: "'BR Omega', sans-serif" }}>
                14 days free, then {isAnnual ? '$495/year' : '$45/mo'}. Credit card required. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${faqsBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-10">
            <h2 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              How ACTV TRKR compares to other tools and what you need to know before getting started.
            </p>
          </div>
          <FaqSection variant="landing" />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-border">
        <div className="px-6 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <img src={logoActvTrkrDark} alt="ACTV TRKR" className="h-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                © 2026 ACTV TRKR. All rights reserved.
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <a href="/privacy" className="cursor-pointer hover:text-foreground transition-colors">Privacy</a>
                <a href="/terms" className="cursor-pointer hover:text-foreground transition-colors">Terms</a>
                <a href="/accessibility" className="cursor-pointer hover:text-foreground transition-colors">Accessibility</a>
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="cursor-pointer hover:text-foreground transition-colors bg-transparent border-0 p-0 text-inherit"
                >
                  Contact
                </button>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-border flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">Need help? We build websites, software and provide maintenance.</span>
              <a href="https://newuniformdesign.com" target="_blank" rel="noopener noreferrer">
                <img src={newuniLogo} alt="New Uniform Design" className="h-5 opacity-60 hover:opacity-100 transition-opacity" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </div>
  );
};

export default Index;
