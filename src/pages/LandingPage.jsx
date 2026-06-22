import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun, ArrowRight, Shield, Users, Clock, CheckCircle, BarChart, Briefcase } from "lucide-react";
import logoImg from "../assets/zuna-logo.png";
import Logo from "../components/Logo";

export default function LandingPage() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-bg-base text-text-main font-sans overflow-x-hidden selection:bg-brand-primary/30 transition-colors duration-500">
      
      {/* Dynamic Background with Grid and Orbs */}
      <div className="fixed inset-0 z-[-1] bg-bg-base transition-colors duration-500">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
        <div className={`absolute top-0 z-[-2] h-screen w-screen transition-all duration-700 ${isDark ? 'bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.15),rgba(0,0,0,0))]' : 'bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.1),rgba(255,255,255,0))]'}`}></div>
        
        {/* Futuristic grid */}
        <div 
          className="absolute inset-0 z-[-1] opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%)'
          }}
        />
      </div>

      <style>{`
        .glass-card {
          background: color-mix(in srgb, var(--bg-card) 60%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid color-mix(in srgb, var(--border-card) 60%, transparent);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
        }
        [data-theme="dark"] .glass-card {
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        .hover-tilt {
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .hover-tilt:hover {
          transform: translateY(-10px) scale(1.02) rotateX(2deg) rotateY(-2deg);
          border-color: rgba(139, 92, 246, 0.5);
          box-shadow: 0 20px 40px rgba(139, 92, 246, 0.15);
          z-index: 10;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float 7s ease-in-out 2s infinite;
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 8s infinite alternate;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 glass-card !opacity-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3 hover:scale-105 transition-transform duration-300">
              <Logo size={32} showText={true} />
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={toggleTheme}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-bg-base border border-border-card text-text-sec hover:text-brand-primary hover:shadow-[0_0_10px_rgba(139,92,246,0.2)] transition-all cursor-pointer"
                title="Toggle Theme"
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <Link to="/login" className="hidden sm:block text-sm font-bold text-text-sec hover:text-text-main transition-colors">
                Log in
              </Link>
              <Link to="/register" className="group relative px-5 sm:px-6 py-2.5 font-bold text-white rounded-full overflow-hidden shadow-lg shadow-brand-primary/20">
                <div className="absolute inset-0 bg-brand-primary opacity-90 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-brand-primary via-[#a855f7] to-[#6366f1] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[2px]"></div>
                <div className="relative flex items-center gap-2">
                  Get Started
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main ref={heroRef} className="pt-32 pb-20 sm:pt-48 sm:pb-32 lg:min-h-[90vh] flex items-center justify-center relative overflow-hidden">
        
        {/* Antigravity-style Interactive Spotlight */}
        <div 
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 z-0 ${isDark ? 'opacity-100' : 'opacity-0'}`}
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, color-mix(in srgb, var(--brand-primary) 15%, transparent), transparent 40%)`
          }}
        />

        {/* Floating background orbs */}
        <div className={`absolute top-1/4 left-1/4 w-[30vw] h-[30vw] max-w-md max-h-md bg-brand-primary rounded-full mix-blend-multiply filter blur-[100px] ${isDark ? 'opacity-30' : 'opacity-5'} animate-blob`}></div>
        <div className={`absolute top-1/3 right-1/4 w-[30vw] h-[30vw] max-w-md max-h-md bg-purple-400 dark:bg-purple-600 rounded-full mix-blend-multiply filter blur-[100px] ${isDark ? 'opacity-30' : 'opacity-5'} animate-blob animation-delay-2000`}></div>
        <div className={`absolute bottom-1/4 left-1/2 w-[30vw] h-[30vw] max-w-md max-h-md bg-blue-400 dark:bg-indigo-500 rounded-full mix-blend-multiply filter blur-[100px] ${isDark ? 'opacity-30' : 'opacity-5'} animate-blob animation-delay-4000`}></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center flex flex-col items-center">
          
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card !opacity-100 border-brand-primary/30 text-brand-primary text-xs font-bold uppercase tracking-wider mb-8 hover:scale-105 transition-transform duration-300 cursor-default animate-float shadow-[0_0_15px_rgba(139,92,246,0.15)] dark:shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-primary"></span>
            </span>
            Multi-Vendor HRMS Platform
          </div>

          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-text-main mb-6 drop-shadow-sm dark:drop-shadow-2xl transition-colors duration-500">
            Unify Your Workforce, <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary via-purple-500 to-indigo-600 dark:from-brand-primary dark:via-purple-400 dark:to-indigo-400 mt-2 block sm:inline-block">
              Anywhere, Anytime.
            </span>
          </h1>
          
          <p className="mt-6 max-w-2xl text-lg sm:text-xl text-text-sec mx-auto mb-12 font-medium leading-relaxed transition-colors duration-500">
            The ultimate multi-vendor attendance and project management system. Streamline tracking, boost productivity, and manage multiple client workspaces with a single intuitive platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center w-full sm:w-auto">
            <Link to="/register" className="group relative w-full sm:w-auto p-[2px] rounded-full overflow-hidden bg-gradient-to-r from-brand-primary via-purple-500 to-indigo-600 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-brand-primary via-purple-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"></div>
              <div className="relative px-8 py-4 bg-bg-base rounded-full text-text-main font-bold text-sm sm:text-base flex items-center justify-center gap-3 transition-all group-hover:bg-opacity-0 group-hover:text-white">
                Start Your Free Trial
                <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
              </div>
            </Link>
            
            <a href="#features" className="group w-full sm:w-auto px-8 py-4 text-sm sm:text-base font-bold rounded-full glass-card !opacity-100 text-text-main hover:text-brand-primary transition-all flex items-center justify-center gap-3 hover:border-brand-primary/50">
              Explore Features
              <div className="w-6 h-6 rounded-full bg-border-card flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                <ArrowRight size={14} className="rotate-90 group-hover:translate-y-0.5 transition-transform" />
              </div>
            </a>
          </div>
        </div>
      </main>

      {/* Futuristic Features Section / Bento Grid */}
      <section id="features" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-black text-text-main mb-6 tracking-tight transition-colors duration-500">Everything you need to <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-purple-500">manage your teams</span></h2>
            <p className="text-text-sec text-lg sm:text-xl transition-colors duration-500">Powerful features designed specifically for modern, distributed multi-vendor teams.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Feature 1 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-brand-primary/10 dark:bg-brand-primary/20 rounded-full blur-2xl group-hover:bg-brand-primary/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-brand-primary mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-sm">
                <Clock size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Live Attendance Tracking</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Precise GPS-enabled check-ins, automated timesheets, and comprehensive break management ensure exact tracking of billable hours.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden lg:-translate-y-8">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-2xl group-hover:bg-purple-500/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-purple-500 dark:text-purple-400 mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-sm">
                <Briefcase size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Project & Task Mastery</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Assign tasks, track progress in real-time, and manage multi-vendor projects effortlessly with tailored access controls.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-2xl group-hover:bg-indigo-500/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-sm">
                <Users size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Multi-Vendor Sync</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Easily collaborate across different organizational boundaries. Keep all external teams and internal staff aligned in one unified hub.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden lg:translate-y-8">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-pink-500/10 dark:bg-pink-500/20 rounded-full blur-2xl group-hover:bg-pink-500/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-pink-500 dark:text-pink-400 mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-sm">
                <Shield size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Leave Management</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Seamlessly request, review, and approve leaves with transparent tracking of paid leaves, casual leaves, and sick days.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-blue-500 dark:text-blue-400 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-sm">
                <BarChart size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Advanced Analytics</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Generate instant reports on team performance, project completion rates, and individual workloads with a click.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="glass-card !opacity-100 p-8 rounded-[2rem] hover-tilt group relative overflow-hidden lg:-translate-y-8">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl group-hover:bg-emerald-500/30 transition-colors"></div>
              <div className="w-14 h-14 bg-bg-card border border-border-card rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-400 mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-sm">
                <CheckCircle size={28} />
              </div>
              <h3 className="text-xl font-bold text-text-main mb-3 tracking-wide transition-colors duration-500">Admin Panel Controls</h3>
              <p className="text-text-sec leading-relaxed font-medium transition-colors duration-500">
                Deep customization for roles, permissions, dynamic rules, and detailed activity logs giving admins complete system oversight.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Animated CTA Section */}
      <section className="py-32 relative z-10 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          
          <div className="glass-card !opacity-100 border-brand-primary/30 rounded-[3rem] p-10 sm:p-20 text-center relative overflow-hidden group shadow-2xl">
            {/* Animated gradients inside CTA */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-purple-600/10 to-indigo-600/10 dark:from-brand-primary/20 dark:via-purple-600/20 dark:to-indigo-600/20 opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-primary/30 rounded-full blur-[100px] animate-blob"></div>
            <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/30 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
            
            <h2 className="text-4xl sm:text-6xl font-black mb-6 relative z-10 text-text-main tracking-tight drop-shadow-sm transition-colors duration-500">
              Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-purple-500 dark:to-purple-400">transform</span> your workflow?
            </h2>
            <p className="text-text-sec text-lg sm:text-xl max-w-2xl mx-auto mb-10 relative z-10 font-medium transition-colors duration-500">
              Join hundreds of teams already using our platform to centralize their multi-vendor operations and boost efficiency.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-5 relative z-10">
              <Link to="/register" className="group relative w-full sm:w-auto p-[2px] rounded-full overflow-hidden bg-gradient-to-r from-brand-primary via-purple-500 to-indigo-600 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300">
                <div className="relative px-8 py-4 bg-brand-primary group-hover:bg-transparent text-white font-black text-lg flex items-center justify-center gap-3 transition-colors duration-300">
                  Create Free Account
                  <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
                </div>
              </Link>
              <Link to="/login" className="w-full sm:w-auto px-8 py-4 glass-card !opacity-100 border-border-card text-text-main font-bold text-lg rounded-full hover:bg-bg-base transition-all flex items-center justify-center">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-card bg-bg-card/50 backdrop-blur-xl pt-20 pb-10 transition-colors duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-16 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6 hover:scale-105 transition-transform origin-left w-max">
                <Logo size={32} showText={true} />
              </div>
              <p className="text-text-sec max-w-sm mb-8 font-medium leading-relaxed transition-colors duration-500">
                A premium, reliable, and flexible multi-vendor platform designed to modernize the future of work.
              </p>
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full glass-card !opacity-100 flex items-center justify-center text-text-sec hover:text-brand-primary hover:border-brand-primary/50 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer transition-all hover:-translate-y-1">
                  <span className="sr-only">Twitter</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg>
                </div>
                <div className="w-12 h-12 rounded-full glass-card !opacity-100 flex items-center justify-center text-text-sec hover:text-brand-primary hover:border-brand-primary/50 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer transition-all hover:-translate-y-1">
                  <span className="sr-only">LinkedIn</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-text-main mb-6 uppercase tracking-wider text-sm transition-colors duration-500">Product</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Features</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Pricing</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Integrations</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Changelog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-text-main mb-6 uppercase tracking-wider text-sm transition-colors duration-500">Company</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">About Us</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Careers</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Contact</a></li>
                <li><a href="#" className="text-text-sec hover:text-brand-primary hover:translate-x-1 inline-block transition-all font-medium">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border-card text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors duration-500">
            <p className="text-sm text-text-mut font-medium">
              &copy; {new Date().getFullYear()} Carrezza Global Solutions. All rights reserved.
            </p>
            <div className="flex gap-8">
              <a href="#" className="text-sm text-text-mut hover:text-brand-primary transition-colors font-medium">Terms of Service</a>
              <a href="#" className="text-sm text-text-mut hover:text-brand-primary transition-colors font-medium">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
