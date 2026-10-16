import React, { useState } from "react";
import { useNavigate, Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, ShieldAlert, Eye, EyeOff, Globe, Sparkles, Clock, X, KeyRound, RefreshCw, ArrowLeft, ShieldCheck } from "lucide-react";
import Logo from "../components/Logo";

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showMfaScreen, setShowMfaScreen] = useState(false);
  const [pendingToken, setPendingToken] = useState("");
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300);
  const { login, logout, currentUser, sendPasswordReset, verifyLoginOtp, resendLoginOtp } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { companySlug } = useParams();

  // Clear existing session once on initial mount if visiting login page
  React.useEffect(() => {
    const token = localStorage.getItem("att_auth_token");
    if (token && currentUser) {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const updateFavicon = (url) => {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = url || "/favicon.png";
    };

    if (companySlug) {
      import("../firebase").then(({ getCompanyBySlug }) => {
        getCompanyBySlug(companySlug).then(company => {
          if (company && company.logoBase64) {
            updateFavicon(company.logoBase64);
          } else {
            updateFavicon("/favicon.png");
          }
        }).catch(() => {
          updateFavicon("/favicon.png");
        });
      });
    } else {
      updateFavicon("/favicon.png");
    }
    
    return () => updateFavicon("/favicon.png");
  }, [companySlug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return showToast("Please fill in all fields", "warning");
    }

    setLoading(true);
    setOtpError("");
    try {
      const result = await login(email, password);

      // Multi-Factor Authentication requirement for all users
      if (result.mfaRequired) {
        setPendingToken(result.pendingToken);
        setShowMfaScreen(true);
        setCooldown(60);
        setExpirySeconds(300);
        setOtp("");
        showToast("Verification code sent to your email address.", "info");
        return;
      }

      showToast(`Welcome back, ${result.name}!`, "success");
      
      const roleLower = (result.role || "").toLowerCase().trim();
      if (roleLower === "superadmin" || roleLower === "super admin") {
        navigate("/superadmin");
      } else if (roleLower === "admin" || roleLower === "system admin" || roleLower === "systemadmin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      let msg = "Failed to log in. Please check your credentials.";
      const errCode = error.code || "";
      const errMsg = error.message || "";
      if (
        errCode === "auth/invalid-credential" ||
        errCode === "auth/wrong-password" ||
        errCode === "auth/user-not-found" ||
        errMsg.toLowerCase().includes("invalid email or password") ||
        errMsg.toLowerCase().includes("user-not-found") ||
        errMsg.toLowerCase().includes("wrong-password")
      ) {
        msg = "Incorrect email or password. Please try again.";
      } else if (errMsg) {
        msg = errMsg;
      }
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setOtpError("Please enter the complete 6-digit verification code.");
      return showToast("Please enter the complete 6-digit verification code.", "warning");
    }

    setOtpLoading(true);
    setOtpError("");
    try {
      const user = await verifyLoginOtp(pendingToken, otp.trim());
      showToast(`Welcome back, ${user.name}!`, "success");

      const roleLower = (user.role || "").toLowerCase().trim();
      if (roleLower === "superadmin" || roleLower === "super admin") {
        navigate("/superadmin");
      } else if (roleLower === "admin" || roleLower === "system admin" || roleLower === "systemadmin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      const msg = error.message || "Invalid or expired verification code.";
      setOtpError(msg);
      showToast(msg, "error");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || otpLoading) return;
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await resendLoginOtp(pendingToken);
      showToast(res.message || "A new verification code has been sent to your email.", "success");
      setCooldown(60);
      setExpirySeconds(300);
      setOtp("");
    } catch (error) {
      const msg = error.message || "Failed to resend verification code.";
      setOtpError(msg);
      showToast(msg, "error");
    } finally {
      setOtpLoading(false);
    }
  };

  // Cooldown and Expiry countdown timers
  React.useEffect(() => {
    if (!showMfaScreen) return;

    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [showMfaScreen]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleSetAdminDemo = () => {
    setEmail("admin@teamcarrezza.com");
    setPassword("12345678");
    showToast("Admin demo credentials filled.", "info");
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail) return showToast("Please enter your email", "warning");
    
    setResetLoading(true);
    try {
      await Promise.race([
        sendPasswordReset(resetEmail),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out. Please check your inbox shortly or try again.")), 8000))
      ]);
      showToast("Password reset email sent! Please check your inbox.", "success");
      setIsResetModalOpen(false);
      setResetEmail("");
    } catch (error) {
      showToast(error.message || "Failed to send reset email.", "error");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-bg-base overflow-hidden">
      {/* Left Visual Panel - Dark Theme - sticky, never scrolls */}
      <div className="hidden lg:flex flex-[1.1] flex-col justify-between bg-gradient-to-br from-[#0c1322] to-[#040810] p-12 text-white relative overflow-hidden border-r border-border-card flex-shrink-0 sticky top-0 h-screen">
        {/* Decorative Grid / Blurs */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-brand-primary filter blur-[120px] opacity-10 pointer-events-none" />

        {/* Top tag */}
        <div className="z-10 self-start flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold tracking-wider text-slate-300">
          <Sparkles size={12} className="text-brand-primary" />
          <span>ENTERPRISE READY</span>
        </div>

        {/* Graphic & Slogans */}
        <div className="z-10 max-w-lg mx-auto flex flex-col items-center justify-center text-center my-auto gap-8">
          <div>
            <h1 className="text-4xl lg:text-5xl font-extrabold mb-4 leading-tight tracking-tight text-white">
              Manage Precision Attendance
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              Experience the next evolution of workforce management. High-stakes enterprise environments demand clarity, efficiency, and absolute reliability.
            </p>
          </div>

          {/* Graphical Mockup Card */}
          <div className="relative w-full max-w-[340px] bg-white/5 border border-white/10 rounded-[20px] p-6 shadow-2xl backdrop-blur-md">
            {/* Mock layout inside card */}
            <div className="flex items-center justify-between mb-4">
              <div className="w-16 h-4 bg-white/10 rounded-full" />
              <div className="flex gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-brand-primary/40" />
                <div className="w-3.5 h-3.5 rounded-full bg-brand-primary/60" />
                <div className="w-3.5 h-3.5 rounded-full bg-brand-primary" />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <div className="w-32 h-3 bg-white/10 rounded-full" />
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Globe size={16} />
                </div>
                <div className="w-40 h-3 bg-white/10 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="z-10 grid grid-cols-3 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          <div>
            <div className="text-white text-lg font-bold">99.9%</div>
            <div>Uptime</div>
          </div>
          <div className="border-x border-white/10">
            <div className="text-white text-lg font-bold">50k+</div>
            <div>Active Users</div>
          </div>
          <div>
            <div className="text-white text-lg font-bold">24/7</div>
            <div>Support</div>
          </div>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex-1 lg:flex-[0.9] flex flex-col p-5 sm:p-8 lg:p-12 bg-bg-card w-full h-screen overflow-y-auto">
        {/* Header Branding */}
        <div className="flex justify-between items-center w-full max-w-[460px] mx-auto pt-4">
          <Logo size={36} showText={true} />
        </div>

        {/* Center Card */}
        <div className="max-w-[460px] w-full mx-auto my-auto py-8">
          {showMfaScreen ? (
            <div>
              <button 
                type="button"
                onClick={() => { setShowMfaScreen(false); setOtp(""); setOtpError(""); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-text-sec hover:text-brand-primary mb-6 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back to Login</span>
              </button>

              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary mb-4">
                <ShieldCheck size={24} />
              </div>

              <div className="mb-6">
                <h2 className="text-3xl font-extrabold text-text-main tracking-tight mb-1.5">Verify Your Email</h2>
                <p className="text-xs text-text-sec leading-relaxed">
                  Enter the 6-digit verification code sent to your registered email address (<strong className="text-text-main">{email}</strong>).
                </p>
                <div className="flex items-center gap-1.5 text-xs text-brand-primary font-medium mt-2">
                  <Clock size={13} />
                  <span>Code expires in: <strong>{formatTime(expirySeconds)}</strong></span>
                </div>
              </div>

              {otpError && (
                <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-[12px] text-xs text-red-500 font-medium">
                  {otpError}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-sec" htmlFor="otp-input">
                    6-Digit Security Code
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="w-full text-center tracking-[0.4em] font-mono text-2xl font-bold py-3 border border-border-card rounded-[12px] bg-bg-base/20 text-text-main placeholder-text-mut focus:bg-bg-card focus:border-brand-primary outline-none transition-all"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtp(val);
                      if (otpError) setOtpError("");
                    }}
                    disabled={otpLoading || expirySeconds === 0}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otp.length !== 6 || expirySeconds === 0}
                  className="w-full py-3 bg-brand-primary hover:bg-brand-hover text-white font-bold rounded-[12px] hover:shadow-lg hover:shadow-brand-primary/10 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                >
                  {otpLoading ? "Verifying OTP..." : "Verify OTP"}
                </button>

                <div className="flex items-center justify-between pt-2 border-t border-border-card text-xs">
                  <span className="text-text-mut">Didn't receive the code?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={cooldown > 0 || otpLoading}
                    className="font-bold text-brand-primary hover:text-brand-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw size={12} className={otpLoading ? "animate-spin" : ""} />
                    <span>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border-card mb-8">
                <button className="py-2.5 px-4 font-bold text-sm border-b-2 border-brand-primary text-text-main cursor-pointer">
                  Sign In
                </button>
                <Link to={companySlug ? `/${companySlug}/register` : "/register"} className="py-2.5 px-4 font-semibold text-sm border-b-2 border-transparent text-text-sec hover:text-brand-primary transition-colors no-underline">
                  Sign Up
                </Link>
              </div>

              <div className="mb-6">
                <h2 className="text-3xl font-extrabold text-text-main tracking-tight mb-1.5">Welcome back</h2>
                <p className="text-xs text-text-sec">Please enter your credentials to access your dashboard.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Email Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-sec" htmlFor="email-input">Email Address</label>
                  <div className="relative">
                    <Mail 
                      size={16} 
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mut pointer-events-none"
                    />
                    <input
                      id="email-input"
                      type="email"
                      className="w-full pl-10 pr-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/20 text-sm text-text-main placeholder-text-mut focus:bg-bg-card focus:border-brand-primary outline-none transition-all"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-text-sec" htmlFor="password-input">Password</label>
                    <button 
                      type="button"
                      onClick={() => setIsResetModalOpen(true)}
                      className="text-xs font-bold text-brand-primary hover:text-brand-hover no-underline hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock 
                      size={16} 
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mut pointer-events-none"
                    />
                    <input
                      id="password-input"
                      type={showPassword ? "text" : "password"}
                      className="w-full pl-10 pr-11 py-2.5 border border-border-card rounded-[12px] bg-bg-base/20 text-sm text-text-main placeholder-text-mut focus:bg-bg-card focus:border-brand-primary outline-none transition-all"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-mut hover:text-text-main cursor-pointer"
                      tabIndex="-1"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                {/* <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="checkbox" 
                    id="remember-me" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-brand-primary border-border-card rounded focus:ring-brand-primary/20 accent-brand-primary"
                  />
                  <label htmlFor="remember-me" className="text-xs font-semibold text-text-sec cursor-pointer">
                    Remember this device for 30 days
                  </label>
                </div> */}

                {/* Submit */}
                <button 
                  type="submit" 
                  className="w-full py-3 bg-brand-primary hover:bg-brand-hover text-white font-bold rounded-[12px] hover:shadow-lg hover:shadow-brand-primary/10 transition-all mt-2 cursor-pointer"
                  disabled={loading}
                >
                  {loading ? "Signing In..." : "Sign In →"}
                </button>
              </form>
            </>
          )}

          {/* SSO Options */}
          {/* <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-border-card"></div>
            <span className="flex-shrink mx-4 text-[10px] text-text-mut font-bold uppercase tracking-wider">Or continue with</span>
            <div className="flex-grow border-t border-border-card"></div>
          </div> */}

          {/* <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => showToast("Google SSO is cosmetic.", "info")}
              className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-xs font-bold text-text-main flex items-center justify-center gap-2 cursor-pointer"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" className="w-4 h-4 object-contain" />
              <span>Google</span>
            </button>
            <button 
              onClick={() => showToast("Enterprise SSO is cosmetic.", "info")}
              className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-xs font-bold text-text-main flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock size={14} className="text-text-sec" />
              <span>SSO</span>
            </button>
          </div> */}

          {/* Quick Admin fill credentials */}
          {/* <div 
            onClick={handleSetAdminDemo}
            className="flex items-center justify-center gap-2 mt-6 p-3 bg-brand-primary/5 border border-dashed border-brand-primary/20 rounded-[12px] cursor-pointer text-xs font-bold text-brand-primary hover:bg-brand-primary/10 transition-colors"
          >
            <ShieldAlert size={14} />
            <span>Auto-fill Admin Demo Credentials</span>
          </div> */}
        </div>

        {/* Footer Support */}
        <div className="text-center text-xs text-text-mut pb-4">
          Professional support: <a href="mailto:info@teamcarrezza.com" className="font-bold text-brand-primary hover:underline">info@teamcarrezza.com</a>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-bg-card w-full max-w-md rounded-[20px] shadow-2xl overflow-hidden border border-border-card">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-text-main">Reset Password</h3>
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="p-2 hover:bg-bg-base rounded-full text-text-mut hover:text-text-main transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              
              <p className="text-sm text-text-sec mb-6">
                Enter your email address and we'll send you instructions to reset your password.
              </p>

              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-sec" htmlFor="reset-email">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mut pointer-events-none" />
                    <input
                      id="reset-email"
                      type="email"
                      className="w-full pl-10 pr-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/20 text-sm text-text-main placeholder-text-mut focus:bg-bg-card focus:border-brand-primary outline-none transition-all"
                      placeholder="name@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={resetLoading}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="px-5 py-2.5 rounded-[12px] text-sm font-semibold text-text-sec hover:bg-bg-base transition-colors cursor-pointer"
                    disabled={resetLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-brand-primary hover:bg-brand-hover text-white rounded-[12px] text-sm font-bold shadow-lg shadow-brand-primary/20 transition-all cursor-pointer disabled:opacity-50"
                    disabled={resetLoading}
                  >
                    {resetLoading ? "Sending..." : "Send Reset Link"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


