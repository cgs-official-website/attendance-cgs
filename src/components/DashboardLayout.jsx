import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  LayoutGrid,
  Shield,
  Users,
  Calendar,
  LogOut,
  Search,
  Bell,
  HelpCircle,
  X,
  Clock,
  HardDrive,
  Sun,
  Moon,
  ChevronRight,
  Play,
  Square,
  ClipboardList,
  Mail,
  User,
  Trash2
} from "lucide-react";
import Logo from "./Logo";
import { 
  checkIn, 
  checkOut, 
  getTodayAttendanceLog,
  subscribeToLeaveRequests,
  subscribeToAttendanceRules
} from "../firebase";

export default function DashboardLayout({ children }) {
  const { currentUser, logout, dbMode } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [showQuickCheckModal, setShowQuickCheckModal] = useState(false);
  const [todayLog, setTodayLog] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Notice board, rules & notification states
  const [showNotifications, setShowNotifications] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rules, setRules] = useState("");
  const [leaveRequestsList, setLeaveRequestsList] = useState([]);
  const [newUpdatesCount, setNewUpdatesCount] = useState(0);
  const [dismissedNotifs, setDismissedNotifs] = useState(() => {
    try {
      const saved = localStorage.getItem(`dismissed_notifs_${currentUser?.uid}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const activeNotifications = leaveRequestsList.filter(req => !dismissedNotifs.includes(req.id));

  useEffect(() => {
    if (currentUser) {
      try {
        const saved = localStorage.getItem(`dismissed_notifs_${currentUser.uid}`);
        setDismissedNotifs(saved ? JSON.parse(saved) : []);
      } catch (e) {
        setDismissedNotifs([]);
      }
    } else {
      setDismissedNotifs([]);
    }
  }, [currentUser]);

  const handleDeleteNotification = (e, reqId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) return;
    const updated = [...dismissedNotifs, reqId];
    setDismissedNotifs(updated);
    localStorage.setItem(`dismissed_notifs_${currentUser.uid}`, JSON.stringify(updated));
    showToast("Notification deleted successfully.", "success");
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Sync today's log for quick check-in button state
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      getTodayAttendanceLog(currentUser.uid)
        .then(log => setTodayLog(log))
        .catch(() => { });
    }
  }, [currentUser, showQuickCheckModal]);

  // Subscribe to dynamic rules and leave updates
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeRules = subscribeToAttendanceRules((data) => {
      setRules(data);
    });

    const unsubscribeLeaves = subscribeToLeaveRequests((data) => {
      if (currentUser.role === "admin") {
        const pending = data.filter(r => r.status === "pending");
        setLeaveRequestsList(pending);
      } else {
        const myRequests = data.filter(r => r.userId === currentUser.uid);
        setLeaveRequestsList(myRequests);
      }
    });

    return () => {
      unsubscribeRules();
      unsubscribeLeaves();
    };
  }, [currentUser]);

  // Compute unseen notifications count
  useEffect(() => {
    if (!currentUser || currentUser.role === "admin") {
      setNewUpdatesCount(0);
      return;
    }
    const seenStr = localStorage.getItem(`seen_leaves_${currentUser.uid}`);
    const seen = seenStr ? JSON.parse(seenStr) : {};
    
    let unseenCount = 0;
    leaveRequestsList.forEach(req => {
      if (!dismissedNotifs.includes(req.id) && seen[req.id] !== req.status && req.status !== "pending") {
        unseenCount++;
      }
    });
    setNewUpdatesCount(unseenCount);
  }, [leaveRequestsList, dismissedNotifs, currentUser]);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications && currentUser && currentUser.role !== "admin") {
      const seen = {};
      activeNotifications.forEach(req => {
        seen[req.id] = req.status;
      });
      localStorage.setItem(`seen_leaves_${currentUser.uid}`, JSON.stringify(seen));
      setNewUpdatesCount(0);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const handleLogout = async () => {
    try {
      await logout();
      showToast("Logged out successfully.", "success");
      navigate("/login");
    } catch (error) {
      showToast(error.message || "Failed to log out", "error");
    }
  };

  const getGpsLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        }),
        (err) => reject(new Error("Failed to fetch GPS coordinates. Please enable location services.")),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  const handleQuickCheckIn = async () => {
    setLoadingAction(true);
    try {
      showToast("Fetching location...", "info", 1500);
      const loc = await getGpsLocation();
      await checkIn(currentUser, loc);
      showToast("Checked in successfully!", "success");
      setShowQuickCheckModal(false);
      // reload page or trigger state update
      window.location.reload();
    } catch (err) {
      showToast(err.message || "Quick check-in failed", "error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleQuickCheckOut = async () => {
    setLoadingAction(true);
    try {
      showToast("Fetching location...", "info", 1500);
      const loc = await getGpsLocation();
      await checkOut(currentUser.uid, loc);
      showToast("Checked out successfully!", "success");
      setShowQuickCheckModal(false);
      window.location.reload();
    } catch (err) {
      showToast(err.message || "Quick check-out failed", "error");
    } finally {
      setLoadingAction(false);
    }
  };

  const isAdmin = currentUser?.role === "admin";
  const activeTabParam = searchParams.get("tab") || "live";

  // Sidebar navigation items
  const menuItems = isAdmin ? [
    {
      label: "Dashboard",
      icon: LayoutGrid,
      active: location.pathname === "/admin" && activeTabParam === "analytics",
      onClick: () => { navigate("/admin?tab=analytics"); setIsMobileOpen(false); }
    },
    {
      label: "Admin Panel",
      icon: Shield,
      active: location.pathname === "/admin" && activeTabParam === "live",
      onClick: () => { navigate("/admin?tab=live"); setIsMobileOpen(false); }
    },
    {
      label: "Staff Directory",
      icon: Users,
      active: location.pathname === "/admin" && activeTabParam === "users",
      onClick: () => { navigate("/admin?tab=users"); setIsMobileOpen(false); }
    },
    {
      label: "Leave Requests",
      icon: Calendar,
      active: location.pathname === "/admin" && activeTabParam === "logs",
      onClick: () => { navigate("/admin?tab=logs"); setIsMobileOpen(false); }
    },
    {
      label: "Notice Board",
      icon: ClipboardList,
      active: location.pathname === "/admin" && activeTabParam === "rules",
      onClick: () => { navigate("/admin?tab=rules"); setIsMobileOpen(false); }
    },
    {
      label: "My Profile",
      icon: User,
      active: location.pathname === "/profile",
      onClick: () => { navigate("/profile"); setIsMobileOpen(false); }
    }
  ] : [
    {
      label: "Dashboard",
      icon: LayoutGrid,
      active: location.pathname === "/dashboard" && !searchParams.get("tab"),
      onClick: () => { navigate("/dashboard"); setIsMobileOpen(false); }
    },
    {
      label: "Leave Requests",
      icon: Calendar,
      active: location.pathname === "/dashboard" && searchParams.get("tab") === "leaves",
      onClick: () => { navigate("/dashboard?tab=leaves"); setIsMobileOpen(false); }
    },
    {
      label: "My History",
      icon: Calendar,
      active: location.pathname === "/history",
      onClick: () => { navigate("/history"); setIsMobileOpen(false); }
    },
    {
      label: "My Profile",
      icon: User,
      active: location.pathname === "/profile",
      onClick: () => { navigate("/profile"); setIsMobileOpen(false); }
    }
  ];

  return (
    <div className="flex min-h-screen w-full bg-bg-base text-text-main overflow-x-hidden">
      {/* Sidebar Panel - Desktop */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-bg-card border-r border-border-card flex-shrink-0 z-30 fixed h-screen">
        {/* Logo and Brand */}
        <div className="py-5 px-6 border-b border-border-card flex items-center justify-between">
          <Link to="/" className="no-underline">
            <Logo size={32} showText={true} />
          </Link>
        </div>

        {/* Small business branding card */}
        <div className="mx-4 my-4 p-3 bg-brand-primary/5 rounded-[12px] border border-brand-primary/10 flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-10 h-10 rounded-[10px] object-contain bg-white p-1.5 shadow-sm"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="flex flex-col text-left">
            <span className="font-bold text-xs text-text-main">Carrezza Portal</span>
            <span className="text-[9px] text-text-mut uppercase font-semibold tracking-wider">Attendance System</span>
          </div>
        </div>

        {/* Sidebar Nav links */}
        <nav className="flex-grow px-3 py-2 space-y-1.5 overflow-y-auto">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={item.onClick}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-[12px] text-sm font-semibold transition-all duration-200 cursor-pointer ${item.active
                  ? "bg-brand-primary text-white shadow-md shadow-brand-primary/15"
                  : "text-text-sec hover:text-brand-primary hover:bg-brand-primary/8"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
                {item.active && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>

        {/* Quick Contact action for normal user */}
        {currentUser && currentUser.role !== "admin" && (
          <div className="p-4 border-t border-border-card">
            <button
              onClick={() => { window.location.href = "mailto:developers@teamcarrezza.com"; }}
              className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-hover text-white font-bold text-sm rounded-[12px] flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/15 hover:shadow-brand-primary/25 hover:translate-y-[-1px] transition-all cursor-pointer"
            >
              <Mail size={16} />
              <span>Contact</span>
            </button>
          </div>
        )}

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-border-card flex items-center justify-between bg-bg-base/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs uppercase">
              {currentUser?.name ? currentUser.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "AP"}
            </div>
            <div className="flex flex-col text-left max-w-[110px]">
              <span className="font-bold text-xs text-text-main truncate">{currentUser?.name}</span>
              <span className="text-[9px] text-text-mut uppercase font-extrabold tracking-wider">{currentUser?.role}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] hover:bg-red-500/10 text-text-sec hover:text-red-500 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex flex-col flex-grow min-h-screen w-full lg:pl-[260px]">
        {/* Top Header navbar */}
        <header className="fixed top-0 left-0 lg:left-[260px] right-0 h-[60px] sm:h-[70px] bg-bg-card/85 backdrop-blur-md border-b border-border-card px-3 sm:px-4 lg:px-8 flex items-center justify-between z-40 shadow-sm transition-all">
          {/* Mobile: hamburger + logo icon only (no text) */}
          <div className="flex items-center gap-2 lg:hidden flex-shrink-0 min-w-0 overflow-hidden">
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              aria-label={isMobileOpen ? "Close menu" : "Open menu"}
              className="relative w-9 h-9 flex flex-col items-center justify-center gap-0 rounded-[8px] border border-border-card bg-bg-card text-text-main hover:bg-bg-base cursor-pointer overflow-hidden"
            >
              <span
                className="block w-5 h-[2px] bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{
                  transform: isMobileOpen ? 'translateY(4px) rotate(45deg)' : 'translateY(-3px)',
                }}
              />
              <span
                className="block h-[2px] bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{
                  width: isMobileOpen ? '0px' : '20px',
                  opacity: isMobileOpen ? 0 : 1,
                }}
              />
              <span
                className="block w-5 h-[2px] bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{
                  transform: isMobileOpen ? 'translateY(-4px) rotate(-45deg)' : 'translateY(3px)',
                }}
              />
            </button>
            {/* Show only the icon on mobile, hide text to prevent overflow */}
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="CGS"
                className="w-7 h-7 object-contain rounded-[6px] shadow-sm"
                onError={(e) => { e.target.style.display='none'; }}
              />
              <span className="font-extrabold text-sm text-text-main tracking-tight hidden xs:block">CGS</span>
            </div>
          </div>

          {/* Action icons - right side */}
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 ml-auto flex-shrink-0">
            {dbMode === "local" && (
              <span className="hidden xs:flex bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider items-center gap-1.5">
                <HardDrive size={10} /> Demo
              </span>
            )}

            {/* Light/Dark mode switcher */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center border border-border-card rounded-[10px] bg-bg-card hover:bg-bg-base text-text-sec transition-colors cursor-pointer flex-shrink-0"
              title="Toggle Theme"
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            {/* Notifications */}
            <div className="relative flex-shrink-0" id="notif-anchor">
              <button
                className="w-8 h-8 flex items-center justify-center border border-border-card rounded-[10px] bg-bg-card hover:bg-bg-base text-text-sec relative cursor-pointer"
                onClick={handleOpenNotifications}
                title="Notifications"
              >
                <Bell size={15} />
                {((currentUser?.role === "admin" && activeNotifications.length > 0) || (currentUser?.role !== "admin" && newUpdatesCount > 0)) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-primary rounded-full border-2 border-bg-card" />
                )}
              </button>

              {showNotifications && (
                <>
                  {/* Backdrop - clicks outside to close */}
                  <div className="fixed inset-0 z-[199]" onClick={() => setShowNotifications(false)} />
                  {/* Dropdown panel - fixed so it's never clipped by parent overflow/z-index */}
                  <div className="fixed top-[65px] sm:top-[75px] right-3 sm:right-4 lg:right-8 w-[calc(100vw-1.5rem)] max-w-[340px] bg-bg-card border border-border-card rounded-[16px] shadow-2xl p-4 z-[200] text-left animate-scale-up">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-card">
                      <span className="font-extrabold text-xs text-text-main uppercase tracking-wider">🔔 Leave Updates</span>
                      {((currentUser?.role === "admin" && activeNotifications.length > 0) || (currentUser?.role !== "admin" && newUpdatesCount > 0)) && (
                        <span className="bg-brand-primary text-white px-2 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                          {currentUser?.role === "admin" ? activeNotifications.length : newUpdatesCount} New
                        </span>
                      )}
                    </div>

                    {activeNotifications.length === 0 ? (
                      <div className="py-8 text-center">
                        <div className="text-3xl mb-2">📭</div>
                        <p className="text-xs text-text-mut font-semibold">No notifications yet.</p>
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1 overscroll-contain">
                        {activeNotifications.slice(0, 10).map((req) => {
                          const isApproved = req.status === "approved";
                          const isRejected = req.status === "rejected";

                          let badgeColor = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
                          let symbol = "⏳";
                          if (isApproved) {
                            badgeColor = "bg-emerald-500/10 text-emerald-500";
                            symbol = "✓";
                          } else if (isRejected) {
                            badgeColor = "bg-red-500/10 text-red-500";
                            symbol = "✗";
                          }

                          const seenStr = localStorage.getItem(`seen_leaves_${currentUser?.uid}`);
                          const seen = seenStr ? JSON.parse(seenStr) : {};
                          const isNewUpdate = currentUser?.role !== "admin" && seen[req.id] !== req.status && req.status !== "pending";

                          return (
                            <div 
                              key={req.id} 
                              className={`p-2.5 rounded-[12px] border text-xs flex flex-col gap-1 transition-all ${
                                isNewUpdate 
                                  ? "bg-brand-primary/10 border-brand-primary/20 shadow-sm" 
                                  : "bg-bg-base/30 border-border-card"
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-extrabold text-text-main truncate max-w-[150px]">{req.type}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {isNewUpdate && (
                                    <span className="bg-brand-primary text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">NEW</span>
                                  )}
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeColor}`}>
                                    {symbol} {req.status}
                                  </span>
                                  <button
                                    onClick={(e) => handleDeleteNotification(e, req.id)}
                                    className="p-1 text-text-mut hover:text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer ml-1 flex items-center justify-center"
                                    title="Delete Notification"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-[10px] text-text-sec">
                                {currentUser?.role === "admin" 
                                  ? `${req.userName} requested ${req.type} (${req.duration}).`
                                  : `Your ${req.type} request for ${req.duration} was ${req.status}.`}
                              </p>
                              {req.managerComment && (
                                <p className="text-[10px] text-brand-primary italic mt-0.5 bg-brand-primary/5 p-1.5 rounded border border-brand-primary/10">
                                  Comment: "{req.managerComment}"
                                </p>
                              )}
                              <span className="text-[8px] text-text-mut self-end mt-0.5 font-semibold">
                                {new Date(req.updatedAt || req.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Help / Attendance Rules - hidden on xs screens */}
            <button
              className="hidden sm:flex w-8 h-8 items-center justify-center border border-border-card rounded-[10px] bg-bg-card hover:bg-bg-base text-text-sec cursor-pointer flex-shrink-0"
              onClick={() => setShowRulesModal(true)}
              title="Attendance Rules"
            >
              <HelpCircle size={15} />
            </button>

            {/* Divider - hidden on mobile */}
            <div className="h-5 w-px bg-border-card hidden sm:block" />

            {/* User profile avatar button */}
            <button
              onClick={() => navigate("/profile")}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 hover:border-brand-primary/60 hover:bg-brand-primary/25 transition-all flex items-center justify-center font-extrabold text-xs uppercase shadow-sm cursor-pointer focus:outline-none"
              title="View Profile"
            >
              {currentUser?.name ? currentUser.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "U"}
            </button>
          </div>
        </header>

        {/* Dashboard Content Container with padding to clear fixed header */}
        <main className="flex-grow p-3 sm:p-4 lg:p-8 pt-[72px] sm:pt-[86px] lg:pt-[102px] overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Sidebar Navigation */}
      <div
        className={`fixed inset-0 z-50 flex lg:hidden transition-all duration-300 ${isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!isMobileOpen}
      >
        {/* Overlay backdrop */}
        <div
          className={`fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[2px] transition-opacity duration-300 ${isMobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsMobileOpen(false)}
        />

        {/* Drawer menu - slides in from left */}
        <aside
          className="relative flex flex-col w-[280px] max-w-[85vw] bg-bg-card h-full z-10 border-r border-border-card shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ transform: isMobileOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
            {/* Header close trigger */}
            <div className="py-4 px-5 border-b border-border-card flex items-center justify-between">
              <Logo size={28} showText={true} />
              <button
                onClick={() => setIsMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center border border-border-card rounded-[8px] text-text-sec"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-grow px-3 py-4 space-y-1 overflow-y-auto">
              {menuItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={item.onClick}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-[12px] text-sm font-semibold transition-colors cursor-pointer ${item.active
                      ? "bg-brand-primary text-white"
                      : "text-text-sec hover:text-brand-primary hover:bg-brand-primary/8"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Quick Contact */}
            {currentUser && currentUser.role !== "admin" && (
              <div className="p-4 border-t border-border-card">
                <button
                  onClick={() => { setIsMobileOpen(false); window.location.href = "mailto:developers@teamcarrezza.com"; }}
                  className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-hover text-white font-bold text-sm rounded-[12px] flex items-center justify-center gap-2"
                >
                  <Mail size={16} />
                  <span>Contact</span>
                </button>
              </div>
            )}

            {/* Mobile Footer profile */}
            <div className="p-4 border-t border-border-card flex items-center justify-between bg-bg-base/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs uppercase">
                  {currentUser?.name?.substring(0, 2) || "AP"}
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-bold text-xs text-text-main truncate max-w-[110px]">{currentUser?.name}</span>
                  <span className="text-[9px] text-text-mut uppercase font-semibold">{currentUser?.role}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] hover:bg-red-500/10 text-text-sec hover:text-red-500 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </aside>
      </div>

      {/* Quick Check-In Modal */}
      {showQuickCheckModal && currentUser && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[400px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up text-center relative overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <Clock size={20} className="text-brand-primary" />
                <span>Quick Actions</span>
              </h3>
              <button
                onClick={() => setShowQuickCheckModal(false)}
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content info */}
            <p className="text-sm text-text-sec mb-6">
              Select an action to log your attendance from anywhere in the portal. Location services must be enabled.
            </p>

            {/* Status Indicator */}
            <div className="mb-6 p-4 rounded-[16px] bg-bg-base/50 border border-border-card text-left flex items-center justify-between">
              <span className="text-xs font-semibold text-text-sec">Current Status:</span>
              {!todayLog ? (
                <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">Not Checked In</span>
              ) : todayLog.status === "checked-in" ? (
                <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">Working</span>
              ) : todayLog.status === "on-break" ? (
                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">On Break</span>
              ) : (
                <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">Checked Out</span>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {!todayLog && (
                <button
                  onClick={handleQuickCheckIn}
                  disabled={loadingAction}
                  className="w-full py-3 px-4 bg-brand-primary text-white font-bold rounded-[12px] flex items-center justify-center gap-2 hover:bg-brand-hover shadow-md shadow-brand-primary/10 transition-all cursor-pointer"
                >
                  <Play size={16} fill="#fff" />
                  <span>{loadingAction ? "Processing..." : "Check In Now"}</span>
                </button>
              )}

              {todayLog && todayLog.status === "checked-in" && (
                <button
                  onClick={handleQuickCheckOut}
                  disabled={loadingAction}
                  className="w-full py-3 px-4 bg-brand-danger text-white font-bold rounded-[12px] flex items-center justify-center gap-2 hover:bg-brand-danger-hover shadow-md shadow-brand-danger/10 transition-all cursor-pointer"
                >
                  <Square size={14} fill="#fff" />
                  <span>{loadingAction ? "Processing..." : "Check Out & End Shift"}</span>
                </button>
              )}

              {todayLog && todayLog.status === "on-break" && (
                <p className="text-xs text-brand-warning font-bold">
                  ⚠️ Please resume work on the main Dashboard page to end your break.
                </p>
              )}

              {todayLog && todayLog.status === "checked-out" && (
                <p className="text-xs text-brand-success font-bold">
                  ✓ Shift completed for today!
                </p>
              )}

              <button
                onClick={() => setShowQuickCheckModal(false)}
                disabled={loadingAction}
                className="w-full py-2.5 px-4 border border-border-card text-text-sec font-semibold rounded-[12px] hover:bg-bg-base transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Help / Attendance Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[500px] bg-bg-card border border-border-card rounded-[24px] p-6 lg:p-8 shadow-xl animate-scale-up relative overflow-hidden text-left">
            {/* Header */}
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-border-card">
              <h3 className="font-extrabold text-lg text-text-main flex items-center gap-2">
                <HelpCircle size={20} className="text-brand-primary" />
                <span>Attendance Guidelines & Rules</span>
              </h3>
              <button
                onClick={() => setShowRulesModal(false)}
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Rules Text Content */}
            <div className="mb-6 space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              {rules ? (
                rules.split("\n").map((rule, idx) => (
                  <div key={idx} className="p-3.5 rounded-[12px] bg-bg-base/40 border border-border-card text-xs text-text-sec leading-relaxed font-semibold">
                    {rule}
                  </div>
                ))
              ) : (
                <p className="text-xs text-text-mut py-6 text-center font-bold">No guidelines published yet.</p>
              )}
            </div>

            {/* Footer */}
            <button
              onClick={() => setShowRulesModal(false)}
              className="w-full py-2.5 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] transition-colors cursor-pointer"
            >
              Understand & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
