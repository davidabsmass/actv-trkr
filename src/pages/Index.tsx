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
      navigate(`/reset-password${window.location.search}${window.location.hash}`, { replace: true });
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
              <Button className="text-primary-foreground hover:opacity-90" style={{ background: 'linear-gradient(to right, #ae51ff, #8a6ef9)' }} onClick={handleSignIn}>
                {session ? "Dashboard" : "Get Started"}
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
                  WordPress Activity. Lead Tracking. Site Health.
                </h1>
                
                <p className="text-base md:text-lg text-white/90 mb-8 md:mb-12 leading-relaxed drop-shadow-md font-light max-w-[38ch] md:max-w-none lg:max-w-[42ch]">
                  ACTV TRKR gives you one clear dashboard for traffic, forms, lead attribution, reporting, and website health — so you can see what's working, what needs attention, and where your leads are really coming from.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3 pb-[30px]">
                  <Button size="default" className="text-base px-6 py-2.5 bg-white text-primary hover:bg-white/90 shadow-xl" onClick={handleSignIn}>
                    {session ? "Go to Dashboard" : "Get Started"}
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
                    onClick={handleSignIn}
                    className="text-base font-medium text-white/80 hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    {session ? "Dashboard" : "Sign In"} <ArrowRight className="h-4 w-4" />
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
                Performance Snapshot
              </div>
              <h2 className="font-normal text-foreground mb-6" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                See What Needs Attention
              </h2>
              <p className="text-lg text-muted-foreground mb-4">
                ACTV TRKR brings your most important website metrics into one clear dashboard, so you can quickly see traffic, leads, conversions, visitor activity, and site health.
              </p>
              <p className="text-lg text-muted-foreground">
                Track week-over-week changes, spot performance shifts early, and catch issues before they cost you opportunities.
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
                See Where Your Leads Come From
              </h3>
              <p className="text-white/90 max-w-xl mb-6">
                Track form submissions, review lead activity, and connect conversions back to the pages, campaigns, and sources driving them. ACTV TRKR gives you clearer visibility into form performance without making you dig through multiple tools.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-white/70 text-sm max-w-xl">
                {["Form activity logs", "Lead attribution", "Entries by form", "Source breakdowns", "Exportable lead data"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
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
                <Sparkles className="h-4 w-4" />
                Smart Insights
              </div>
              <h3 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Built-In Suggestions, Without the Noise
              </h3>
              <p className="text-muted-foreground max-w-xl mb-6">
                ACTV TRKR includes automated suggestions based on your activity, lead trends, and site health signals. It is designed to help you spot opportunities and issues quickly — without turning your dashboard into an overcomplicated AI tool.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-muted-foreground text-sm max-w-xl">
                {["AI-powered suggestions", "Weekly insights", "Monthly summaries", "Recommended actions", "Clear performance signals"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
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
                Catch Problems Before They Cost You
              </h3>
              <p className="text-muted-foreground max-w-xl mb-6">
                ACTV TRKR does more than track traffic. It helps you monitor the health of your website so you can catch broken forms, broken links, SSL issues, and domain-related problems before they impact leads and performance.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-muted-foreground text-sm max-w-xl">
                {["Site health alerts", "Broken form checks", "Broken link detection", "SSL expiry alerts", "Domain expiry alerts"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative flex items-end justify-center lg:col-span-7 pt-12">
              <img src={websiteHealthGraphic} alt="Website health monitoring" className="w-[85%] h-auto relative z-10 prlx" style={{ transform: `translateY(${(scrollY - 2400) * -0.02}px)`, willChange: 'transform' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${pricingBgd})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0.8 }}><SparkleCanvas /></div>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Everything You Need in One Place
            </h2>
            <p className="text-white/70 max-w-2xl mx-auto">
              From traffic insights to site health alerts, ACTV TRKR covers every angle of your WordPress performance.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {([
              { icon: Globe, label: "Traffic Sources" },
              { icon: Target, label: "UTM Tracking" },
              { icon: TrendingUp, label: "Lead Attribution" },
              { icon: FileCheck, label: "Form Tracking" },
              { icon: MousePointer2, label: "Conversion Tracking" },
              { icon: BarChart3, label: "Top Pages" },
              { icon: FileText, label: "Activity Reports" },
              { icon: Sparkles, label: "AI Suggestions" },
              { icon: Shield, label: "Site Health" },
              { icon: Search, label: "Form Checks" },
              { icon: Link2, label: "Broken Links" },
              { icon: Lock, label: "SSL Alerts" },
              { icon: CalendarClock, label: "Domain Alerts" },
              { icon: Download, label: "CSV Exports" },
              { icon: Share2, label: "Shareable Snapshots" },
            ] as { icon: LucideIcon; label: string }[]).map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/10 border border-white/10 shadow-sm hover:bg-white/15 hover:border-accent/40 transition-all duration-200">
                <Icon className="h-6 w-6 text-accent" />
                <span className="text-sm font-medium text-white text-center">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section id="pricing-section" className="relative px-6 overflow-hidden landing-section" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${presentationBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        
        <img 
          src={pricingAstronaut} 
          alt="" 
          className="absolute left-[calc(8%+30px)] w-[154px] h-auto z-30 pointer-events-none hidden lg:block"
          style={{ bottom: `${380 + (scrollY - 3600) * -0.08}px`, willChange: 'bottom' }}
        />

        <div className="max-w-3xl mx-auto relative z-10">
          <div className="text-center mb-6">
            <h2 className="font-normal text-foreground mb-2" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '2.2em', lineHeight: '1.2em' }}>
              Simple Pricing
            </h2>
            <p className="text-muted-foreground max-w-3xl mx-auto" style={{ fontFamily: "'BR Omega', sans-serif" }}>
              ACTV TRKR
            </p>

            <div className="flex items-center justify-center gap-3 mt-4">
              <span className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`} style={{ fontFamily: "'BR Omega', sans-serif" }}>Monthly</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className={`relative w-11 h-6 rounded-full transition-colors ${isAnnual ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-5' : ''}`} />
              </button>
              <span className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`} style={{ fontFamily: "'BR Omega', sans-serif" }}>Yearly <span className="text-foreground text-xs font-semibold">Save 17%</span></span>
            </div>
          </div>

          <div className="max-w-lg mx-auto" style={{ paddingTop: '20px', paddingBottom: '40px' }}>
            <div className="p-8 rounded-2xl bg-white border border-border/20 shadow-lg flex flex-col">
              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground">{isAnnual ? '$250' : '$25'}</span>
                <span className="text-muted-foreground text-sm">{isAnnual ? '/year' : '/month'}</span>
              </div>
              
              <p className="text-sm text-muted-foreground mb-6">
                Everything you need to track website activity, leads, site health, and reporting in one streamlined WordPress dashboard.
              </p>
              
              <p className="text-xs font-semibold text-foreground mb-3">What's included:</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
                {[
                  "1 website",
                  "Traffic source tracking",
                  "UTM capture",
                  "Form tracking",
                  "Lead attribution",
                  "Conversion tracking",
                  "Top page insights",
                  "Site health monitoring",
                  "Broken form checks",
                  "Broken link detection",
                  "SSL and domain alerts",
                  "AI suggestions",
                  "Weekly and monthly summaries",
                  "Custom date range reports",
                  "12 months reporting history",
                  "60 days recent detailed activity",
                  "PDF exports",
                  "Shareable snapshots",
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

            <p className="text-center text-sm text-white/60 mt-6" style={{ fontFamily: "'BR Omega', sans-serif" }}>
              No bloated analytics stack. No scattered reports. Just clear visibility into what your website is doing.
            </p>
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
