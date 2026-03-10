import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Check, 
  Zap, 
  Shield, 
  Users, 
  BarChart3, 
  Activity, 
  Clock, 
  Globe, 
  Layout, 
  MousePointer2, 
  MessageSquare, 
  GitBranch, 
  Layers,
  Eye,
  Palette,
  Bell,
  FileCheck,
  Rocket,
  TrendingUp,
  Target,
  Lock,
  Link2,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logoActvTrkr from "@/assets/actv-trkr-logo.svg";
import logoActvTrkrWhite from "@/assets/actv-trkr-logo-white.svg";
import logoActvTrkr2 from "@/assets/actv-trkr-logo-2.png";
import logoMshnCtrl from "@/assets/logo-mshn-ctrl.svg";
import spaceboy from "@/assets/spaceboy.png";
import spaceBgd from "@/assets/space-bgd.jpg";
import SparkleCanvas from "@/components/SparkleCanvas";
import footerBackground from "@/assets/footer-background.jpg";
import designPresentationBg from "@/assets/design-presentation-bg.jpg";
import helmetImg from "@/assets/helmet.png";
import presentationBgImg from "@/assets/section-2-bgd.jpg";
import platformBg from "@/assets/section-3-space.jpg";
import platformInset from "@/assets/section-3-graphs.png";
import spaceManBack from "@/assets/space-man-back.png";
import workflowBg from "@/assets/workflow-bg.png";
import workflowInset from "@/assets/workflow-inset.png";
import accountabilityBg from "@/assets/accountability-bg-new.jpg";
import accountabilityInset from "@/assets/accountability-astronaut.png";
import featuresBg from "@/assets/features-bg.png";
import trialBg from "@/assets/trial-bg.png";
import pricingBg from "@/assets/pricing-bg.png";

const Index = () => {
  const navigate = useNavigate();

  const [scrollY, setScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY);
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

  const extensiveFeatures = [
    { icon: BarChart3, label: "Real-Time Dashboard" },
    { icon: TrendingUp, label: "Conversion Tracking" },
    { icon: Target, label: "Lead Attribution" },
    { icon: MessageSquare, label: "Form Analytics" },
    { icon: FileCheck, label: "Form Health Monitoring" },
    { icon: Layout, label: "Traffic Insights" },
    { icon: MousePointer2, label: "Click Tracking" },
    { icon: Activity, label: "Uptime Monitoring" },
    { icon: Eye, label: "Visitor Engagement" },
    { icon: Lock, label: "SSL Monitoring" },
    { icon: Shield, label: "Domain Health" },
    { icon: Clock, label: "Real-Time Alerts" },
    { icon: Layers, label: "Multi-Site Support" },
    { icon: Bell, label: "Smart Notifications" },
    { icon: Link2, label: "Broken Link Detection" },
  ];

  const easySetupCards = [
    {
      icon: Globe,
      title: "Connect Your Site in Seconds",
      description: "Install the lightweight WordPress plugin and start tracking immediately.",
      features: ["One-click WP plugin install", "Auto-detected forms", "Zero performance impact", "Instant data flow"],
    },
    {
      icon: BarChart3,
      title: "See Every Lead Instantly",
      description: "Track every form submission with full attribution and engagement scoring.",
      features: ["Source & UTM tracking", "Engagement scoring", "Form-level analytics", "Lead timeline view"],
    },
    {
      icon: Users,
      title: "Multi-Client Dashboard",
      description: "Manage all your client sites from a single, powerful command center.",
      features: ["Org-based access control", "Per-site settings", "Team member roles", "Client-specific views"],
    },
  ];

  const dashboardFeatures = [
    "Real-time KPI tracking with trends",
    "Traffic source breakdown & ROI",
    "Form conversion rate analysis",
    "AI-powered performance insights",
    "Week-over-week comparisons",
    "Shareable dashboard snapshots",
  ];

  const monitoringFeatures = [
    "Automatic uptime checks every 10 minutes",
    "SSL certificate expiry tracking",
    "Domain registration monitoring",
    "Broken link scanning & detection",
    "Instant downtime alerts via email & in-app",
  ];

  const attributionFeatures = [
    "Full UTM parameter tracking",
    "Referrer domain attribution",
    "Session-level engagement scoring",
    "Lead-to-source mapping",
    "Campaign performance analysis",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 landing-page-fonts">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 bg-black">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-16 flex items-center justify-center md:justify-between">
            <div className="flex items-center gap-2 flex-shrink-0">
              <img src={logoMshnCtrl} alt="MSHN CTRL" className="h-6 w-auto object-contain" />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => document.getElementById('features-grid')?.scrollIntoView({ behavior: 'smooth' })}
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
          {/* Mobile buttons row */}
          <div className="flex md:hidden items-center justify-center gap-2 mt-3">
            <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10 text-xs" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs" onClick={() => navigate("/auth")}>
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero + Quick Setup wrapped in space background */}
      <div className="relative overflow-hidden bg-black">
        {/* Parallax background - moves slower */}
        <div
          className="absolute inset-0 w-full h-[120%]"
          style={{
            backgroundImage: `url(${spaceBgd})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            transform: `translateY(${scrollY * 0.3}px)`,
            willChange: 'transform',
          }}
        />
        
        
        
        <SparkleCanvas />

      {/* Hero Section */}
      <section className="relative px-6 pt-[10rem] pb-16 md:pt-[calc(10rem+10px)] md:pb-[calc(16px+80px)]">
        <div
          className="max-w-7xl mx-auto relative"
          style={{ zIndex: 2, transform: `translateY(${scrollY * -0.15}px)`, willChange: 'transform' }}
        >
          {/* Centered logo over everything */}
          <div className="flex justify-center mb-[60px]">
            <img src={logoActvTrkr2} alt="ACTV TRKR" className="h-11 md:h-16 lg:h-[72px] w-auto drop-shadow-lg" />
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-8 lg:gap-12">
            {/* Spaceman — large, left-aligned, leg touches left edge */}
            <div className="w-full md:w-2/5 lg:w-1/2 flex justify-center md:justify-start mt-[20px] md:mt-0 md:-ml-16 lg:-ml-24">
              <img
                src={spaceboy}
                alt="Floating astronaut"
                className="w-64 md:w-80 lg:w-[36rem] drop-shadow-2xl"
                style={{
                  transform: `translateY(${scrollY * -0.25}px)`,
                  willChange: 'transform',
                }}
              />
            </div>

            <div className="w-full md:w-3/5 lg:w-1/2 text-center md:text-left">
              <h1 className="text-xl md:text-[1.9rem] lg:text-[3.56rem] font-normal text-white mb-4 tracking-wide drop-shadow-lg whitespace-nowrap" style={{ lineHeight: '1.1', fontFamily: "'Funnel Display', sans-serif" }}>
                Know Exactly Where<br />Your Website Lands
              </h1>
              
              <p className="text-base md:text-lg text-white/90 mb-8 md:mb-12 leading-relaxed drop-shadow-md font-light">
                ACTV TRKR is a lightweight intelligence platform for WordPress that shows you what visitors do, where your leads come from, and whether your website is actually working. Instead of juggling analytics tools, form exports, and monitoring services, ACTV TRKR brings everything together in one clean dashboard so you can understand performance at a glance.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 pb-[30px]">
                <Button size="lg" className="text-lg px-8 py-6 bg-white text-primary hover:bg-white/90 shadow-xl" onClick={() => navigate("/auth")}>
                  Download Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="ghost" 
                  className="text-lg px-8 py-6 border-2 border-accent text-white hover:bg-accent/10 bg-transparent"
                  onClick={() => document.getElementById('features-grid')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Full List of Features
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      </div>{/* End space background wrapper */}

      {/* Dashboard Showcase */}
      <section className="px-6 bg-surface/50 landing-section-pad" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${presentationBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Layout className="h-4 w-4" />
                All In One Place
              </div>
              <h2 className="font-normal text-foreground mb-6" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                A Dashboard That Shows What Matters
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                ACTV TRKR gives you an immediate view of your website's health with clear metrics for sessions, leads, conversion rate, and overall site status. Week-over-week comparisons and performance trends help you quickly see whether your website is improving or if something needs attention. If a problem appears, ACTV TRKR highlights it right away so you can respond before it affects your leads.
              </p>
            </div>

            <div className="relative flex items-center justify-center lg:col-span-3 lg:-ml-16">
              <img 
                src={helmetImg}
                alt="ACTV TRKR dashboard preview with astronaut helmet"
                className="w-full max-w-2xl h-auto object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Multi-Site Management */}
      <section className="relative px-6 landing-section-pad overflow-visible" style={{ paddingTop: '90px', paddingBottom: '80px', backgroundImage: `url(${platformBg})`, backgroundSize: 'cover', backgroundPosition: 'center -40px' }}>
        <SparkleCanvas />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative">
            {/* Left: graphs with parallax */}
            <div className="relative">
              <img
                src={platformInset}
                alt="Lead generation analytics"
                className="w-3/4 h-auto rounded-2xl shadow-2xl"
                style={{ transform: `translateY(${(scrollY - 800) * -0.08}px)`, willChange: 'transform' }}
              />
            </div>
            {/* Right: text, vertically centered */}
            <div className="flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4 w-fit">
                <Target className="h-4 w-4" />
                Lead Generation
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Understand Where Your Leads Come From
              </h3>
              <p className="text-white/70 max-w-xl">
                Most analytics tools focus on traffic. ACTV TRKR focuses on leads. Track which marketing channels, campaigns, and pages actually generate inquiries. Attribution reports connect visitor activity to form submissions so you can clearly see which marketing efforts are producing results.
              </p>
            </div>
          </div>
          {/* Astronaut pinned to bottom of section container */}
          <img
            src={spaceManBack}
            alt="Astronaut"
            className="absolute bottom-[-80px] left-[28%] h-[55%] w-auto object-contain pointer-events-none z-10"
          />
        </div>
      </section>

      {/* Monitoring Section */}
      <section className="px-6 landing-section-pad" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${workflowBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
                <GitBranch className="h-4 w-4" />
                Site Monitoring
              </div>
              <h3 className="font-normal text-foreground mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Know when something breaks — before your client does
              </h3>
              <p className="text-muted-foreground max-w-xl mb-8">
                Automatic uptime checks, SSL monitoring, domain expiry tracking, and broken link detection keep you ahead of every issue.
              </p>
              <div className="space-y-3">
                {monitoringFeatures.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <img src={workflowInset} alt="Monitoring dashboard" className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* Attribution Section */}
      <section className="px-6 landing-section-pad" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${accountabilityBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="flex items-center justify-center overflow-hidden" style={{ maxHeight: '500px' }}>
              <img src={accountabilityInset} alt="Attribution tracking" className="w-full h-auto rounded-2xl shadow-2xl" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold mb-4">
                <Eye className="h-4 w-4" />
                Attribution
              </div>
              <h3 className="font-normal text-white mb-3" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                Know exactly where every lead comes from
              </h3>
              <p className="text-white/70 max-w-xl mb-8">
                Full-funnel attribution connects traffic sources to form submissions. See which campaigns, pages, and referrers are actually driving revenue.
              </p>
              <div className="space-y-3">
                {attributionFeatures.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-white/90">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Extensive Features Grid */}
      <section id="features-grid" className="px-6 py-20" style={{ backgroundImage: `url(${featuresBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-normal text-foreground mb-4" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
              Everything in one place
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete toolkit for tracking traffic, leads, conversions, and site health.
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {extensiveFeatures.map((feature, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-surface hover:bg-muted/50 hover:border-primary/30 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground text-center">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - Trial First */}
      <section id="pricing-section" className="px-6 py-20 landing-section-pad" style={{ backgroundImage: `url(${trialBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success text-sm font-semibold mb-6">
              <Check className="h-4 w-4" />
              No Credit Card Required
            </div>
            <h2 className="font-normal text-white mb-4" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
              Try it free with a real site
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              See real data from your WordPress site in 14 days. Full access. No risk.
            </p>
          </div>

          <div className="max-w-3xl mx-auto mb-16">
            <div className="relative p-8 md:p-10 rounded-3xl border-2 border-primary bg-white shadow-xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-primary text-white text-sm font-bold">
                14-Day Free Trial
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                <div>
                  <h3 className="font-normal text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                    <Check className="h-5 w-5 text-success" />
                    Full Product Access
                  </h3>
                  <div className="space-y-3">
                    {[
                      "Real-time analytics dashboard",
                      "Lead tracking & attribution",
                      "Form conversion analytics",
                      "Uptime & SSL monitoring",
                      "AI-powered insights",
                      "Smart notifications",
                      "Unlimited team members",
                      "Data export & reports",
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-success" />
                        </div>
                        <span className="text-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-normal text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
                    <Shield className="h-5 w-5 text-primary" />
                    Trial Includes
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-background border border-border">
                      <div className="text-3xl font-bold text-primary mb-1">1</div>
                      <div className="text-sm text-muted-foreground">WordPress Site</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Connect a real client site and see actual data flowing in
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background border border-border">
                      <div className="text-3xl font-bold text-foreground mb-1">∞</div>
                      <div className="text-sm text-muted-foreground">Unlimited Forms & Pages</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Track every form and page on that site with no limits
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">After trial:</span> Dashboard becomes read-only. No data lost.
                </div>
                <Button size="lg" className="px-8" onClick={() => navigate("/auth")}>
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ready to Scale - Paid Plans */}
      <section className="px-6 landing-section-pad" style={{ paddingTop: '100px', paddingBottom: '100px', backgroundImage: `url(${pricingBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h3 className="font-bold text-foreground mb-2" style={{ fontSize: '1.8em', lineHeight: '1.2em' }}>
              Ready to scale?
            </h3>
            <p className="text-muted-foreground">
              Upgrade anytime to add more sites and unlock premium features.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "Starter",
                price: 49,
                description: "For solo marketers",
                clients: "3 sites",
                storage: "30-day retention",
                features: ["Real-time dashboard", "Lead attribution", "Uptime monitoring", "Email support"],
              },
              {
                name: "Pro",
                price: 99,
                description: "For agencies",
                clients: "10 sites",
                storage: "90-day retention",
                popular: true,
                features: ["Everything in Starter", "AI insights", "Priority support", "Advanced reports"],
              },
              {
                name: "Agency",
                price: 199,
                description: "For large agencies",
                clients: "Unlimited sites",
                storage: "365-day retention",
                features: ["Everything in Pro", "Dedicated support", "White-label reports", "Custom integrations"],
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`relative p-6 rounded-2xl border flex flex-col bg-white ${
                  plan.popular 
                    ? 'border-primary shadow-lg' 
                    : 'border-border'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                
                <h4 className="font-bold text-foreground mb-1" style={{ fontSize: '1.8em', lineHeight: '1.2em' }}>{plan.name}</h4>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                
                <div className="mb-4">
                  <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                
                <div className="flex gap-3 mb-4">
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {plan.clients}
                  </div>
                  <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    {plan.storage}
                  </div>
                </div>
                
                <div className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
                
                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  disabled
                >
                  Coming Soon
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section 
        className="relative px-6 py-24 overflow-hidden"
        style={{
          backgroundImage: `url(${footerBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/20"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="font-normal text-white mb-4 drop-shadow-lg" style={{ fontFamily: "'Funnel Display', sans-serif", fontSize: '1.8em', lineHeight: '1.2em' }}>
            Ready for liftoff?
          </h2>
          <p className="text-xl text-white/90 mb-8 drop-shadow-md">
            Start tracking what matters—leads, conversions, and real ROI.
          </p>
          <Button
            size="lg"
            className="text-lg px-8 py-6 bg-white text-primary hover:bg-white/90 shadow-xl"
            onClick={() => navigate("/auth")}
          >
            Get Started Free
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-border">
        <div className="px-6 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                <span className="text-lg font-semibold">
                  <span className="text-foreground">ACTV</span>{" "}
                  <span className="text-primary">TRKR</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                © 2025 ACTV TRKR. All rights reserved.
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