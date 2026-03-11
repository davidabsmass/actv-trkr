import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import logoActvTrkr2 from "@/assets/actv-trkr-logo-2.png";
import logoActvTrkrDark from "@/assets/actv-trkr-logo-dark-2.svg";
import logoMshnCtrl from "@/assets/logo-mshn-ctrl.svg";
import spaceboy from "@/assets/astroman-2.png";
import spaceBgd from "@/assets/space-bgd.jpg";
import SparkleCanvas from "@/components/SparkleCanvas";
import helmetImg from "@/assets/helmet.png";
import presentationBgImg from "@/assets/section-2-bgd.jpg";
import platformBg from "@/assets/section-3-space.jpg";
import platformInset from "@/assets/section-3-graphs.png";
import spaceManBack from "@/assets/space-man-back.png";
import conversionBgd from "@/assets/conversion-bgd.jpg";
import fourChart from "@/assets/four-chart.png";
import roverImg from "@/assets/rover.png";
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

const Index = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const handleSignIn = () => navigate(session ? "/dashboard" : "/auth");
  const [scrollY, setScrollY] = useState(0);
  const [isAnnual, setIsAnnual] = useState(false);
  const [showNav, setShowNav] = useState(false);
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
      navigate(`/auth${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 landing-page-fonts">
      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 1023px) { .prlx { transform: none !important; will-change: auto !important; } } @media (max-width: 767px) { .hero-astronaut-wrap { margin-left: -120px; } .hero-space-bg { background-position: 70% top !important; } .landing-section { padding-top: 70px !important; padding-bottom: 70px !important; } } @media (min-width: 768px) and (max-width: 1023px) { .hero-astronaut-wrap { position: absolute !important; left: -402px !important; top: 0 !important; margin: 0 !important; z-index: 0 !important; } .hero-astronaut-wrap img { width: 40rem !important; max-width: none !important; } .hero-headline { font-size: 2.225rem !important; } .hero-content-row { position: relative; } .hero-copy-block { position: relative; z-index: 1; margin-left: auto !important; text-align: left !important; } .hero-copy-block .flex { justify-content: flex-start !important; } .section-copy-block { padding-left: 39px !important; } }` }} />
      {/* Navigation — hidden until scrolled past logo, then sticky */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-black transition-transform duration-300 ${showNav ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-16 flex items-center justify-center md:justify-between">
            <div className="flex items-center gap-2 flex-shrink-0">
              <img src={logoActvTrkr2} alt="ACTV TRKR" className="h-8 w-auto object-contain" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' })}
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
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10" onClick={() => navigate("/auth")}>
                Sign In
              </Button>
              <Button className="text-primary-foreground hover:opacity-90" style={{ background: 'linear-gradient(to right, #ae51ff, #8a6ef9)' }} onClick={() => navigate("/auth")}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

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
                  One Dashboard for<br />WordPress Insights
                </h1>
                
                <p className="text-base md:text-lg text-white/90 mb-8 md:mb-12 leading-relaxed drop-shadow-md font-light max-w-[38ch] md:max-w-none lg:max-w-[42ch]">
                  ACTV TRKR is an all-in-one WordPress intelligence platform that tracks visitor behavior, lead activity, form performance, and website health from one clean dashboard, giving you a clear view of what is working, where leads are coming from, and what needs attention before it costs you opportunities.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3 pb-[30px]">
                  <Button size="default" className="text-base px-6 py-2.5 bg-white text-primary hover:bg-white/90 shadow-xl" onClick={() => navigate("/auth")}>
                    Get Started
                  </Button>
                  <Button 
                    size="default" 
                    variant="ghost" 
                    className="text-base px-6 py-2.5 border border-accent text-white hover:bg-accent/10 bg-transparent"
                    onClick={() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    View Features
                  </Button>
                  <button
                    onClick={() => navigate("/auth")}
                    className="text-base font-medium text-white/80 hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    Sign In <ArrowRight className="h-4 w-4" />
                  </button>
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
                Dashboard Overview
              </div>
              <h2 className="font-normal text-foreground mb-6" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                A Dashboard Built for Action
              </h2>
              <p className="text-lg text-muted-foreground mb-4">
                ACTV TRKR gives you an immediate view of the metrics that matter most: sessions, leads, conversion rate, visitor activity, and overall website health.
              </p>
              <p className="text-lg text-muted-foreground">
                See week-over-week trends, identify performance changes quickly, and spot problems before they affect your business. Instead of digging through multiple tools, you get a clear picture of how your website is performing in one place.
              </p>
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
        <div style={{ opacity: 0.8 }}><SparkleCanvas /></div>
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
                Know Where Your Leads Actually Come From
              </h3>
              <p className="text-white/90 max-w-xl mb-4">
                Traffic is useful. Leads are what matter.
              </p>
              <p className="text-white/70 max-w-xl">
                ACTV TRKR connects form submissions with the pages, campaigns, and traffic sources that drove them, so you can see which marketing efforts are producing real results. Understand which channels generate inquiries, which pages support conversions, and where your best opportunities are coming from.
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
      <section className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${conversionBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 lg:pl-[29px]">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
                <Eye className="h-4 w-4" />
                Visitor Behavior
              </div>
              <h3 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                See What Visitors Do Before They Convert
              </h3>
              <p className="text-muted-foreground max-w-xl mb-4">
                ACTV TRKR tracks meaningful visitor activity so you can better understand how people move through your website.
              </p>
              <p className="text-muted-foreground max-w-xl">
                Measure time on page, key clicks, downloads, and navigation paths. For every lead, view an activity timeline showing what they looked at before submitting a form. That gives you a clearer picture of how conversions happen — and where your website may be losing them.
              </p>
            </div>
            <div className="relative flex items-center justify-end lg:col-span-7">
              <img src={fourChart} alt="Visitor behavior analytics" className="w-[85%] h-auto rounded-2xl relative z-10" />
              <img src={roverImg} alt="Space rover" className="absolute bottom-[-30px] left-[-40px] w-[220px] h-auto z-20 pointer-events-none" />
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
               <img src={satelliteChartTiny} alt="Total Submissions" className="absolute top-[92px] right-[10px] lg:top-[90px] lg:right-[2%] w-[130px] lg:w-[150px] h-auto z-20 rounded-xl shadow-lg prlx" style={{ transform: `translateY(${(scrollY - 1800) * -0.12}px)`, willChange: 'transform' }} />
               <img src={satelliteImg} alt="Satellite" className="absolute bottom-[-30px] right-[-15px] lg:bottom-[110px] lg:right-[2%] w-[130px] lg:w-[180px] h-auto z-20 pointer-events-none prlx" style={{ transform: `translateY(${(scrollY - 1800) * 0.05}px) rotate(-10deg)`, willChange: 'transform' }} />
            </div>
            <div className="lg:col-span-5 section-copy-block">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4">
                <FileCheck className="h-4 w-4" />
                Form Monitoring
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Track the Performance of Every Form
              </h3>
              <p className="text-white/90 max-w-xl mb-4">
                Your forms are often the most important part of your website — and one of the easiest places for problems to go unnoticed.
              </p>
              <p className="text-white/70 max-w-xl">
                ACTV TRKR monitors WordPress forms for submissions, drop-offs, failures, and trends over time. See which forms are performing, which ones are underdelivering, and when something breaks so you can respond fast.
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
                Catch Website Issues Before Your Visitors Do
              </h3>
              <p className="text-muted-foreground max-w-xl mb-4">
                ACTV TRKR continuously monitors key website health signals so you always know when something needs attention.
              </p>
              <p className="text-muted-foreground max-w-xl">
                Track uptime, broken links, SSL status, and domain expiration from the same dashboard you use to monitor traffic and leads. No more discovering website issues after they start affecting user experience or conversions.
              </p>
            </div>
            <div className="relative flex items-end justify-center lg:col-span-7 pt-12">
              <img src={websiteHealthGraphic} alt="Website health monitoring" className="w-[85%] h-auto relative z-10 prlx" style={{ transform: `translateY(${(scrollY - 2400) * -0.02}px)`, willChange: 'transform' }} />
            </div>
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section id="pricing-section" className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${pricingBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0.8 }}><SparkleCanvas /></div>
        
        <img 
          src={pricingAstronaut} 
          alt="" 
          className="absolute left-[calc(8%+30px)] w-[154px] h-auto z-30 pointer-events-none hidden lg:block"
          style={{ bottom: `${180 + (scrollY - 3600) * -0.08}px`, willChange: 'bottom' }}
        />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="font-normal text-white mb-4" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Simple Pricing
            </h2>
            <p className="text-white/70 max-w-3xl mx-auto" style={{ fontFamily: "'BR Omega', sans-serif" }}>
              Choose the plan that fits your website footprint and reporting needs.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-white' : 'text-white/50'}`}>Monthly</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${isAnnual ? 'bg-primary' : 'bg-white/20'}`}
              >
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${isAnnual ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-white' : 'text-white/50'}`}>
                Annual
                <span className="ml-1.5 inline-block px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold">Save 2 months</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
            {/* Starter */}
            <div className="p-8 rounded-2xl bg-white border border-border/20 shadow-lg flex flex-col">
              <h3 className="font-normal text-foreground mb-1" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
                Starter
              </h3>
              <p className="text-sm text-muted-foreground mb-4">For single-site businesses and small agencies</p>
              
              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground">${isAnnual ? '24.17' : '29'}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              {isAnnual ? (
                <p className="text-xs text-primary mb-4">$290/year — <span className="font-bold">save 2 months</span></p>
              ) : (
                <p className="text-xs text-muted-foreground mb-4">$348/year billed monthly</p>
              )}
              
              <p className="text-sm text-muted-foreground mb-6">
                A streamlined way to monitor website performance, visitor behavior, forms, and lead activity for one WordPress website.
              </p>
              
              <div className="space-y-3 flex-1">
                {[
                  "Full ACTV TRKR dashboard",
                  "Visitor behavior tracking",
                  "Time-on-page analytics",
                  "WordPress form monitoring",
                  "Lead activity insights",
                  "Website health monitoring",
                  "1 website",
                  "90 days of data retention",
                  "Standard support",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button onClick={() => navigate('/signup')} className="w-full mt-8" size="lg">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Pro */}
            <div className="p-8 rounded-2xl bg-white shadow-lg flex flex-col" style={{ border: '2px solid transparent', backgroundClip: 'padding-box', outline: '2px solid', outlineColor: '#ac5bfc', outlineOffset: '2px', borderRadius: '1rem' }}>
              <h3 className="font-normal text-foreground mb-1" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
                Pro
              </h3>
              <p className="text-sm text-muted-foreground mb-4">For growing agencies and multi-site teams</p>
              
              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground">${isAnnual ? '40.83' : '49'}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              {isAnnual ? (
                <p className="text-xs text-primary mb-4">$490/year — <span className="font-bold">save 2 months</span></p>
              ) : (
                <p className="text-xs text-muted-foreground mb-4">$588/year billed monthly</p>
              )}
              
              <p className="text-sm text-muted-foreground mb-6">
                Everything in Starter, plus deeper reporting and multi-site visibility for teams managing several WordPress websites.
              </p>
              
              <p className="text-xs font-semibold text-foreground mb-3">Includes everything in Starter, plus:</p>
              <div className="space-y-3 flex-1">
                {[
                  "Up to 10 websites",
                  "12 months of data retention",
                  "Scheduled reports",
                  "Advanced alerts and notifications",
                  "Lead export tools",
                  "Priority support",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button onClick={() => navigate('/signup')} className="w-full mt-8" size="lg">
                Start Pro <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
              <div className="flex items-center gap-6 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <span className="cursor-pointer hover:text-foreground">Privacy</span>
                <span className="cursor-pointer hover:text-foreground">Terms</span>
                <span className="cursor-pointer hover:text-foreground">Contact</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
