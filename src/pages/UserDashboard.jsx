import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  checkIn,
  checkOut,
  startBreak,
  resumeWork,
  subscribeToUserLogs,
  requestLeave,
  subscribeToPaidLeaves,
  subscribeToLeaveRequests,
  getAllRegisteredUsers
} from "../firebase";
import {
  Play,
  Square,
  Coffee,
  Compass,
  Clock,
  RotateCcw,
  MapPin,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Map,
  ChevronRight,
  LogOut,
  CalendarDays,
  Umbrella
} from "lucide-react";

export default function UserDashboard() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const [userLogs, setUserLogs] = useState([]);
  const [todayLog, setTodayLog] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [fetchingGps, setFetchingGps] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  // Leave Form & Notice Board states
  const [paidLeaves, setPaidLeaves] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [leaveDuration, setLeaveDuration] = useState("1 Day");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [myLeaveRequests, setMyLeaveRequests] = useState([]);
  const [selectedPaidLeaveDetail, setSelectedPaidLeaveDetail] = useState(null);

  const [loading, setLoading] = useState(true);
  const [leavesPage, setLeavesPage] = useState(1);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamOnLeaveCount, setTeamOnLeaveCount] = useState(0);

  const toastShownRef = useRef(false);

  const getElapsedWorkingMs = () => {
    if (!todayLog) return 0;
    if (todayLog.status === "checked-out") {
      if (todayLog.totalWorkingMinutes !== undefined) {
        return todayLog.totalWorkingMinutes * 60000;
      }
      const checkInDate = new Date(todayLog.checkInTime);
      const checkOutDate = new Date(todayLog.checkOutTime);
      let diffMs = checkOutDate.getTime() - checkInDate.getTime();
      let breakMs = 0;
      if (todayLog.breaks && todayLog.breaks.length > 0) {
        todayLog.breaks.forEach(b => {
          if (b.startTime) {
            const start = new Date(b.startTime);
            const resume = b.resumeTime ? new Date(b.resumeTime) : new Date(todayLog.checkOutTime);
            breakMs += (resume.getTime() - start.getTime());
          }
        });
      }
      return Math.min(Math.max(0, diffMs - breakMs), 8 * 60 * 60 * 1000);
    } else {
      const checkInDate = new Date(todayLog.checkInTime);
      let diffMs = currentTime.getTime() - checkInDate.getTime();
      let breakMs = 0;
      if (todayLog.breaks && todayLog.breaks.length > 0) {
        todayLog.breaks.forEach(b => {
          if (b.startTime) {
            const start = new Date(b.startTime);
            const resume = b.resumeTime ? new Date(b.resumeTime) : currentTime;
            breakMs += (resume.getTime() - start.getTime());
          }
        });
      }
      return Math.min(Math.max(0, diffMs - breakMs), 8 * 60 * 60 * 1000);
    }
  };

  const formatDuration = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const isForgotToCheckIn = (() => {
    if (currentUser.role === "admin") return false;
    if (todayLog) return false;
    
    // Check if today is a weekday
    const day = currentTime.getDay();
    const isWeekday = day >= 1 && day <= 5;
    if (!isWeekday) return false;
    
    // Parse shiftStart (e.g. "10:00")
    if (!currentUser.shiftStart) return false;
    const [startH, startM] = currentUser.shiftStart.split(":").map(Number);
    const shiftStartToday = new Date(currentTime);
    shiftStartToday.setHours(startH, startM, 0, 0);
    
    return currentTime > shiftStartToday;
  })();

  useEffect(() => {
    if (isForgotToCheckIn && !toastShownRef.current) {
      showToast("⚠️ Shift Started! You forgot to check-in today. Please check-in immediately.", "warning", 6000);
      toastShownRef.current = true;
    } else if (!isForgotToCheckIn) {
      toastShownRef.current = false;
    }
  }, [isForgotToCheckIn]);

  const formatShiftTime = (timeStr) => {
    if (!timeStr) return "10:00 AM";
    const [hoursStr, minutesStr] = timeStr.split(":");
    const hours = parseInt(hoursStr);
    const minutes = parseInt(minutesStr);
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
    const formattedMinutes = String(minutes).padStart(2, "0");
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
  };

  const isWithinShiftHours = () => {
    if (!currentUser.shiftStart || !currentUser.shiftEnd) return true;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const getMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const startMinutes = getMinutes(currentUser.shiftStart);
    const endMinutes = getMinutes(currentUser.shiftEnd);

    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  };

  // Ticking time effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset pagination on tab change
  useEffect(() => {
    setLeavesPage(1);
  }, [activeTab]);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [breakTotalSeconds, setBreakTotalSeconds] = useState(0);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef(null);

  // Fetch GPS on mount and subscribe to logs
  useEffect(() => {
    refreshLocation();

    const unsubscribe = subscribeToUserLogs(currentUser.uid, (logs) => {
      setUserLogs(logs);
      const todayStr = new Date().toISOString().split("T")[0];
      const today = logs.find(log => log.date === todayStr);
      setTodayLog(today || null);
      setLoading(false);
    });

    const unsubscribePaid = subscribeToPaidLeaves((list) => {
      setPaidLeaves(list);
    });

    const unsubscribeLeaves = subscribeToLeaveRequests((list) => {
      setMyLeaveRequests(list.filter(r => r.userId === currentUser.uid));
      
      const todayStr = new Date().toISOString().split("T")[0];
      const deptOnLeave = list.filter(r => 
        r.status === "approved" && 
        r.userDept === currentUser.department && 
        r.userId !== currentUser.uid &&
        r.startDate <= todayStr && 
        r.endDate >= todayStr
      );
      setTeamOnLeaveCount(deptOnLeave.length);
    });

    getAllRegisteredUsers().then(usersList => {
      const deptUsers = usersList.filter(u => u.department === currentUser.department && u.uid !== currentUser.uid && u.role !== "admin");
      setTeamMembers(deptUsers);
    }).catch(err => console.warn("Failed to fetch team members:", err));

    return () => {
      unsubscribe();
      unsubscribePaid();
      unsubscribeLeaves();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentUser.uid, currentUser.department]);

  // Handle countdown timer when user is on break
  useEffect(() => {
    if (todayLog && todayLog.status === "on-break" && todayLog.currentBreakTimerEnd) {
      const endTime = new Date(todayLog.currentBreakTimerEnd).getTime();

      const activeBreak = todayLog.breaks?.find(b => !b.resumeTime);
      if (activeBreak) {
        const start = new Date(activeBreak.startTime).getTime();
        setBreakTotalSeconds((endTime - start) / 1000);
      }

      const updateTimer = () => {
        const now = new Date().getTime();
        const diff = Math.max(0, Math.floor((endTime - now) / 1000));
        setTimeLeft(diff);

        if (diff <= 0) {
          setTimerExpired(true);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        } else {
          setTimerExpired(false);
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      setTimeLeft(0);
      setTimerExpired(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [todayLog]);

  const refreshLocation = () => {
    setFetchingGps(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by this browser.");
      setFetchingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy)
        });
        setFetchingGps(false);
      },
      (error) => {
        let msg = "Failed to fetch GPS coordinates.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "GPS access denied. Please enable location services in your browser.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out. Please try again.";
        }
        setGpsError(msg);
        setFetchingGps(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const getFreshLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy)
          };
          setGpsLocation(loc);
          resolve(loc);
        },
        (error) => {
          let msg = "Could not fetch active GPS coordinates. Please ensure location is enabled.";
          if (error.code === error.PERMISSION_DENIED) {
            msg = "Location permission denied. Please allow GPS access to check-in/out.";
          }
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      showToast("Fetching precise GPS location...", "info", 1500);
      const location = await getFreshLocation();
      await checkIn(currentUser, location);
      showToast("Checked in successfully! Have a great workday.", "success");
    } catch (err) {
      showToast(err.message || "Failed to check in.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = () => {
    setShowCheckoutConfirm(true);
  };

  const confirmCheckOut = async () => {
    setShowCheckoutConfirm(false);
    setActionLoading(true);
    try {
      showToast("Fetching precise GPS location...", "info", 1500);
      const location = await getFreshLocation();
      await checkOut(currentUser.uid, location);
      showToast("Checked out successfully! See you tomorrow.", "success");
    } catch (err) {
      showToast(err.message || "Failed to check out.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartBreak = async (breakType) => {
    setActionLoading(true);
    try {
      showToast("Fetching location for break start...", "info", 1500);
      const location = await getFreshLocation();
      await startBreak(currentUser.uid, breakType, location);
      showToast(`Started ${breakType} break. Timer is running.`, "success");
    } catch (err) {
      showToast(err.message || "Failed to start break.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeWork = async () => {
    setActionLoading(true);
    try {
      showToast("Fetching location to resume work...", "info", 1500);
      const location = await getFreshLocation();
      await resumeWork(currentUser.uid, location);
      showToast("Work resumed successfully! Good luck.", "success");
    } catch (err) {
      showToast(err.message || "Failed to resume work.", "error");
    } finally {
      setActionLoading(false);
    }
  };
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!leaveType || !startDate || !endDate || !leaveReason) {
      return showToast("Please fill in all leave request fields.", "warning");
    }

    const startD = new Date(startDate);
    const endD = new Date(endDate);
    if (endD < startD) {
      return showToast("End Date cannot be before Start Date.", "warning");
    }

    const diffTime = Math.abs(endD - startD);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const durationStr = `${diffDays} Day${diffDays > 1 ? "s" : ""}`;

    setActionLoading(true);
    try {
      await requestLeave(
        currentUser.uid,
        currentUser.name,
        currentUser.department || "Engineering",
        leaveType,
        durationStr,
        startDate,
        endDate,
        leaveReason,
        null
      );
      showToast("Leave request submitted successfully.", "success");
      setLeaveType("Annual Leave");
      setStartDate("");
      setEndDate("");
      setLeaveReason("");
    } catch (err) {
      showToast(err.message || "Failed to submit leave request.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const getTodayFormatted = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString(undefined, options);
  };

  const timerPercentage = breakTotalSeconds > 0 ? (timeLeft / breakTotalSeconds) * 100 : 0;

  const getShiftDurationMinutes = () => {
    if (!currentUser.shiftStart || !currentUser.shiftEnd) return 540; // 9 hours
    const [startH, startM] = currentUser.shiftStart.split(":").map(Number);
    const [endH, endM] = currentUser.shiftEnd.split(":").map(Number);
    let startMin = startH * 60 + startM;
    let endMin = endH * 60 + endM;
    if (endMin < startMin) endMin += 1440;
    return endMin - startMin;
  };

  const getShiftProgress = () => {
    if (!todayLog || !todayLog.checkInTime) return 0;
    if (todayLog.status === "checked-out" && todayLog.totalWorkingMinutes) {
      const targetMin = getShiftDurationMinutes();
      return Math.min(100, Math.round((todayLog.totalWorkingMinutes / targetMin) * 100));
    }

    const start = new Date(todayLog.checkInTime).getTime();
    const now = todayLog.checkOutTime ? new Date(todayLog.checkOutTime).getTime() : new Date().getTime();

    const breakMinutes = todayLog.breaks?.reduce((acc, b) => {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = b.resumeTime ? new Date(b.resumeTime).getTime() : new Date().getTime();
      return acc + ((bEnd - bStart) / 60000);
    }, 0) || 0;

    const elapsedMinutes = Math.max(0, ((now - start) / 60000) - breakMinutes);
    const targetMinutes = getShiftDurationMinutes();

    return Math.min(100, Math.round((elapsedMinutes / targetMinutes) * 100));
  };

  const getActiveHoursText = () => {
    if (!todayLog || !todayLog.checkInTime) return "0.0 hrs";
    if (todayLog.status === "checked-out" && todayLog.totalWorkingMinutes !== undefined) {
      return `${(todayLog.totalWorkingMinutes / 60).toFixed(1)} hrs`;
    }
    const start = new Date(todayLog.checkInTime).getTime();
    const now = new Date().getTime();
    const breakMinutes = todayLog.breaks?.reduce((acc, b) => {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = b.resumeTime ? new Date(b.resumeTime).getTime() : new Date().getTime();
      return acc + ((bEnd - bStart) / 60000);
    }, 0) || 0;

    const elapsedMinutes = Math.max(0, ((now - start) / 60000) - breakMinutes);
    return `${(elapsedMinutes / 60).toFixed(1)} hrs`;
  };

  const getWeeklyHours = () => {
    const days = ["M", "T", "W", "T", "F", "S", "S"];
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date();
    monday.setDate(now.getDate() - distanceToMonday);

    return days.map((dayName, index) => {
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + index);
      const targetDateStr = targetDate.toISOString().split("T")[0];

      const log = userLogs.find(l => l.date === targetDateStr);
      const hrs = log ? (log.totalWorkingMinutes || 0) / 60 : 0;
      return {
        label: dayName,
        hours: parseFloat(hrs.toFixed(1)),
        active: targetDateStr === new Date().toISOString().split("T")[0]
      };
    });
  };

  const getRecentActivitiesList = () => {
    const list = [];

    if (todayLog) {
      if (todayLog.checkOutTime) {
        list.push({
          type: "out",
          title: "Checked Out",
          time: new Date(todayLog.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateText: "Today",
          desc: `Total: ${((todayLog.totalWorkingMinutes || 0) / 60).toFixed(2)} hrs`
        });
      }

      const reversedBreaks = [...(todayLog.breaks || [])].reverse();
      reversedBreaks.forEach((brk) => {
        if (brk.resumeTime) {
          list.push({
            type: "work",
            title: "Work Resumed",
            time: new Date(brk.resumeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dateText: "Today",
            desc: "Office Worksite"
          });
        }
        list.push({
          type: "break",
          title: brk.type === "short" ? "Short Break Started" : "Long Break Started",
          time: new Date(brk.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateText: "Today",
          desc: brk.duration ? `${brk.duration} mins` : "In progress"
        });
      });

      if (todayLog.checkInTime) {
        list.push({
          type: "in",
          title: "Checked In",
          time: new Date(todayLog.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateText: "Today",
          desc: "Office Worksite"
        });
      }
    }

    const historyLogs = userLogs.filter(l => l.date !== new Date().toISOString().split("T")[0]).slice(0, 3);
    historyLogs.forEach(hLog => {
      const dateText = new Date(hLog.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (hLog.checkOutTime) {
        list.push({
          type: "out",
          title: "Checked Out",
          time: new Date(hLog.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateText: dateText,
          desc: `Total: ${((hLog.totalWorkingMinutes || 0) / 60).toFixed(2)} hrs`
        });
      }
      if (hLog.checkInTime) {
        list.push({
          type: "in",
          title: "Checked In",
          time: new Date(hLog.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateText: dateText,
          desc: "Office Worksite"
        });
      }
    });

    if (list.length === 0) {
      list.push(
        { type: "in", title: "Checked In", time: "09:12 AM", dateText: "Today", desc: "Remote Work" },
        { type: "out", title: "Checked Out", time: "05:45 PM", dateText: "Yesterday", desc: "Total: 8h 33m" },
        { type: "break", title: "Break Started", time: "01:00 PM", dateText: "Yesterday", desc: "Lunch Break" },
        { type: "in", title: "Checked In", time: "08:58 AM", dateText: "Yesterday", desc: "Office Worksite" }
      );
    }

    return list;
  };

  const shiftProgressPercent = getShiftProgress();
  const shortBreakBalance = todayLog?.shortBreakBalance !== undefined ? todayLog.shortBreakBalance : 1200;
  const longBreakBalance = todayLog?.longBreakBalance !== undefined ? todayLog.longBreakBalance : 2400;
  const shortBreakPercent = (shortBreakBalance / 1200) * 100;
  const longBreakPercent = (longBreakBalance / 2400) * 100;

  const weeklyHoursData = getWeeklyHours();
  const maxWeeklyHours = Math.max(8, ...weeklyHoursData.map(d => d.hours));
  const recentActivities = getRecentActivitiesList();

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-8 w-full max-w-[1400px] mx-auto text-left animate-fade-in">
        {/* Welcome Panel Skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2 w-full max-w-[250px]">
            <div className="h-7 w-48 rounded skeleton" />
            <div className="h-4 w-36 rounded skeleton" />
          </div>
          <div className="h-16 w-full sm:w-64 rounded-[14px] skeleton" />
        </div>

        {/* Paid Leaves Section Skeleton */}
        <div className="bg-bg-card border border-border-card rounded-[24px] p-6 space-y-4">
          <div className="h-5 w-40 rounded skeleton" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="h-28 rounded-[20px] skeleton" />
            <div className="h-28 rounded-[20px] skeleton" />
            <div className="h-28 rounded-[20px] skeleton" />
          </div>
        </div>

        {/* Dashboard Content Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Shift Panel Skeleton */}
            <div className="h-[280px] rounded-[24px] skeleton" />
            {/* Weekly Attendance Skeleton */}
            <div className="h-[240px] rounded-[24px] skeleton" />
          </div>
          <div className="space-y-8">
            {/* Geolocation Skeleton */}
            <div className="h-[140px] rounded-[24px] skeleton" />
            {/* Recent Activity Skeleton */}
            <div className="h-[320px] rounded-[24px] skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "leaves") {
    const leavesStartIndex = (leavesPage - 1) * 10;
    const paginatedLeaveRequests = myLeaveRequests.slice(leavesStartIndex, leavesStartIndex + 10);
    const leavesTotalPages = Math.ceil(myLeaveRequests.length / 10) || 1;

    return (
      <div className="space-y-6 w-full max-w-[1400px] mx-auto text-left">
        {/* Breadcrumb & Header */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs text-text-mut font-semibold mb-2">
            <span>Leave Requests</span>
            <span>&gt;</span>
            <span className="text-brand-primary">New Request</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Request Leave</h1>
          <p className="text-sm text-text-sec mt-1">Submit your time-off request for manager approval.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form & History (col-span-2) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Leave Details Form Card */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-border-card">
                <div className="w-9 h-9 rounded-[10px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <CalendarDays size={18} />
                </div>
                <h3 className="font-extrabold text-base text-text-main">Leave Details</h3>
              </div>

              <form onSubmit={handleApplyLeave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Leave Type Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-sec" htmlFor="leave-type-select">Leave Type</label>
                    <select
                      id="leave-type-select"
                      className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main font-semibold outline-none focus:bg-bg-card focus:border-brand-primary transition-all appearance-none"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value)}
                      required
                    >
                      <option value="Annual Leave">Annual Leave</option>
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Maternity Leave">Maternity Leave</option>
                      <option value="Paternity Leave">Paternity Leave</option>
                    </select>
                  </div>
                  <div className="flex items-center text-xs text-text-mut leading-relaxed mt-4">
                    Requests are subject to manager availability and team capacity.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Start Date */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-sec" htmlFor="start-date-input">Start Date</label>
                    <input
                      id="start-date-input"
                      type="date"
                      className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>

                  {/* End Date */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-sec" htmlFor="end-date-input">End Date</label>
                    <input
                      id="end-date-input"
                      type="date"
                      className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Reason for Leave Textarea */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-sec" htmlFor="leave-reason-textarea">Reason for Leave</label>
                  <textarea
                    id="leave-reason-textarea"
                    placeholder="Briefly describe the reason for your request..."
                    className="w-full h-24 p-3.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all resize-none"
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    required
                  />
                </div>

                {/* Supporting Documents (Optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-sec">Supporting Documents (Optional)</label>
                  <div className="border border-dashed border-border-card rounded-[16px] p-6 text-center bg-bg-base/20 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-bg-base/40 transition-all">
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold text-text-main">Click to upload or drag and drop</span>
                    <span className="text-[10px] text-text-mut font-semibold">PDF, PNG, JPG or DOCX (max. 10MB)</span>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end gap-3 border-t border-border-card pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setLeaveType("Annual Leave");
                      setStartDate("");
                      setEndDate("");
                      setLeaveReason("");
                      navigate("/dashboard");
                    }}
                    className="py-2.5 px-6 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-all cursor-pointer"
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-brand-primary text-white text-xs font-bold rounded-[12px] hover:bg-brand-hover transition-colors cursor-pointer"
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            </div>

            {/* My Request History Queue */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
              <h3 className="font-extrabold text-base text-text-main tracking-tight mb-4">My Request Queue</h3>

              {myLeaveRequests.length === 0 ? (
                <div className="text-center py-8 text-text-mut text-xs font-semibold">No leave requests submitted yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-card text-[10px] font-bold text-text-mut uppercase tracking-wider">
                        <th className="pb-3 pr-4">Leave Type</th>
                        <th className="pb-3 px-4">Dates</th>
                        <th className="pb-3 px-4">Duration</th>
                        <th className="pb-3 px-4">Status</th>
                        <th className="pb-3 pl-4 text-right">Manager Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-card text-xs text-text-main font-semibold">
                      {paginatedLeaveRequests.map((req) => {
                        let statusColor = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
                        if (req.status === "approved") {
                          statusColor = "bg-emerald-500/10 text-emerald-500";
                        } else if (req.status === "rejected") {
                          statusColor = "bg-red-500/10 text-red-500";
                        }

                        const startF = req.startDate ? new Date(req.startDate).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
                        const endF = req.endDate ? new Date(req.endDate).toLocaleDateString([], { month: "short", day: "numeric" }) : "";

                        return (
                          <tr key={req.id} className="hover:bg-bg-base/30">
                            <td className="py-3.5 pr-4 text-text-main font-bold">{req.type}</td>
                            <td className="py-3.5 px-4 text-text-sec">{startF && endF ? `${startF} - ${endF}` : "—"}</td>
                            <td className="py-3.5 px-4 text-text-sec">{req.duration}</td>
                            <td className="py-3.5 px-4">
                              <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase ${statusColor}`}>
                                {req.status}
                              </span>
                            </td>
                            <td className="py-3.5 pl-4 text-right text-[11px] text-text-mut font-semibold truncate max-w-[150px]" title={req.managerComment || ""}>
                              {req.managerComment || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {myLeaveRequests.length > 10 && (
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border-card text-xs flex-wrap gap-4">
                  <span className="text-text-mut font-semibold">
                    Showing {leavesStartIndex + 1} to {Math.min(myLeaveRequests.length, leavesStartIndex + 10)} of {myLeaveRequests.length} entries
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLeavesPage(prev => Math.max(1, prev - 1))}
                      disabled={leavesPage === 1}
                      className="px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-text-sec disabled:opacity-40 disabled:hover:bg-bg-card cursor-pointer font-bold transition-all"
                    >
                      Prev
                    </button>
                    {Array.from({ length: leavesTotalPages }, (_, i) => i + 1).map((p) => {
                      if (leavesTotalPages > 5 && p !== 1 && p !== leavesTotalPages && Math.abs(p - leavesPage) > 1) {
                        if (p === 2 || p === leavesTotalPages - 1) {
                          return <span key={p} className="px-1 text-text-mut font-bold">...</span>;
                        }
                        return null;
                      }
                      return (
                        <button
                          key={p}
                          onClick={() => setLeavesPage(p)}
                          className={`w-8 h-8 rounded-[8px] border transition-all cursor-pointer font-bold ${
                            leavesPage === p
                              ? "bg-brand-primary border-brand-primary text-white"
                              : "border-border-card bg-bg-card text-text-sec hover:bg-bg-base"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setLeavesPage(prev => Math.min(leavesTotalPages, prev + 1))}
                      disabled={leavesPage === leavesTotalPages}
                      className="px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-text-sec disabled:opacity-40 disabled:hover:bg-bg-card cursor-pointer font-bold transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Leave Balances, Policies, Team Capacity */}
          <div className="space-y-6">
            {/* Leave Balances Card */}
            <div className="bg-bg-card border border-border-card rounded-[24px] overflow-hidden shadow-sm">
              <div className="bg-brand-primary p-6 text-white text-left">
                <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block">AS OF TODAY</span>
                <h3 className="font-extrabold text-lg text-white mt-0.5">Leave Balances</h3>
              </div>

              <div className="p-6 space-y-4">
                {/* Annual Leave circular progress */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-bg-base/20 border border-border-card">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-[12px] bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0">
                      <Umbrella size={20} />
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-text-mut uppercase block">Annual Leave</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-text-main">{currentUser.annualLeaves !== undefined ? currentUser.annualLeaves : 25}</span>
                        <span className="text-[10px] font-semibold text-text-sec">days</span>
                      </div>
                    </div>
                  </div>
                  {/* Circular progress SVG */}
                  <div className="w-10 h-10 relative flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="20" cy="20" r="16" className="text-border-card" strokeWidth="3" fill="transparent" stroke="currentColor" />
                      <circle cx="20" cy="20" r="16" className="text-brand-primary" strokeWidth="3" fill="transparent" strokeDasharray="100" strokeDashoffset={100 - ((currentUser.annualLeaves !== undefined ? currentUser.annualLeaves : 25) / 25.0) * 100} strokeLinecap="round" stroke="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Sick Leave circular progress */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-bg-base/20 border border-border-card">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-[12px] bg-brand-danger/10 text-brand-danger flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-text-mut uppercase block">Sick Leave</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-text-main">{currentUser.sickLeaves !== undefined ? currentUser.sickLeaves : 10}</span>
                        <span className="text-[10px] font-semibold text-text-sec">days</span>
                      </div>
                    </div>
                  </div>
                  {/* Circular progress SVG */}
                  <div className="w-10 h-10 relative flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="20" cy="20" r="16" className="text-border-card" strokeWidth="3" fill="transparent" stroke="currentColor" />
                      <circle cx="20" cy="20" r="16" className="text-brand-danger" strokeWidth="3" fill="transparent" strokeDasharray="100" strokeDashoffset={100 - ((currentUser.sickLeaves !== undefined ? currentUser.sickLeaves : 10) / 10.0) * 100} strokeLinecap="round" stroke="currentColor" />
                    </svg>
                  </div>
                </div>

                {/* Casual Leave circular progress */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-bg-base/20 border border-border-card">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-[12px] bg-brand-success/10 text-brand-success flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-text-mut uppercase block">Casual Leave</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-text-main">{currentUser.casualLeaves !== undefined ? currentUser.casualLeaves : 6}</span>
                        <span className="text-[10px] font-semibold text-text-sec">days</span>
                      </div>
                    </div>
                  </div>
                  {/* Circular progress SVG */}
                  <div className="w-10 h-10 relative flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="20" cy="20" r="16" className="text-border-card" strokeWidth="3" fill="transparent" stroke="currentColor" />
                      <circle cx="20" cy="20" r="16" className="text-brand-success" strokeWidth="3" fill="transparent" strokeDasharray="100" strokeDashoffset={100 - ((currentUser.casualLeaves !== undefined ? currentUser.casualLeaves : 6) / 6.0) * 100} strokeLinecap="round" stroke="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={() => navigate("/history")}
                  className="w-full text-center text-xs font-bold text-brand-primary hover:text-brand-hover hover:underline cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>View Full History</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Policy Reminders Card */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm text-left">
              <h3 className="font-extrabold text-base text-text-main tracking-tight mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Policy Reminders</span>
              </h3>
              <ul className="space-y-2 text-xs text-text-sec font-semibold list-disc list-inside leading-relaxed pl-1">
                <li>Requests for more than 5 days must be submitted at least 2 weeks in advance.</li>
                <li>Medical certificates are mandatory for sick leave exceeding 2 consecutive days.</li>
              </ul>
            </div>

            {/* Team Capacity Card */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm text-left">
              <h3 className="font-extrabold text-xs text-text-mut uppercase tracking-wider mb-4">TEAM CAPACITY</h3>
              <div className="flex items-center justify-between text-xs font-bold border-b border-border-card pb-3 mb-3">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{currentUser.department || "Development"}</span>
                </span>
                <span className="text-text-sec">
                  {Math.max(1, (teamMembers.length + 1) - teamOnLeaveCount)}/{teamMembers.length + 1} Present
                </span>
              </div>
              <p className="text-[11px] text-text-sec font-semibold leading-relaxed">
                {teamOnLeaveCount > 0 
                  ? `${teamOnLeaveCount} team member${teamOnLeaveCount > 1 ? "s are" : " is"} currently on leave today.`
                  : "All team members in your department are active and available today."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activePaidLeaves = paidLeaves
    .filter(pl => (pl.status || "active") === "active")
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  return (
    <div className="space-y-5 sm:space-y-8 w-full max-w-[1400px] mx-auto">
      {/* Forgot to check-in Warning Banner */}
      {isForgotToCheckIn && (
        <div className="bg-gradient-to-r from-red-500/10 via-red-500/15 to-red-500/10 border border-red-500/30 rounded-[20px] p-5 shadow-lg relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] bg-red-500/20 text-red-500 flex items-center justify-center flex-shrink-0 animate-bounce">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-text-main flex items-center gap-1.5">
                <span>Attendance Alert: Forgot to Check-In!</span>
              </h4>
              <p className="text-xs text-text-sec mt-1 font-semibold leading-relaxed">
                Your shift was scheduled to start at <strong className="text-text-main">{formatShiftTime(currentUser.shiftStart)}</strong>. Please check-in now to record your shift metrics.
              </p>
            </div>
          </div>
          <button
            onClick={handleCheckIn}
            disabled={actionLoading || fetchingGps}
            className="py-2.5 px-6 bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs rounded-[12px] shadow-md shadow-red-500/25 transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
          >
            Check-In Now
          </button>
        </div>
      )}

      {/* Official Paid Leaves Section */}
      {activePaidLeaves.length > 0 && (
        <div className="bg-bg-card border border-border-card rounded-[20px] sm:rounded-[24px] p-4 sm:p-6 shadow-sm text-left">
          {/* Header: stacks on mobile, side-by-side on sm+ */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
            <div>
              <h3 className="font-extrabold text-base text-text-main tracking-tight">Official Paid Leaves</h3>
              <p className="text-[10px] text-text-mut font-semibold mt-0.5">Company-wide paid holidays and scheduled closures</p>
            </div>
            <button
              onClick={() => navigate("/dashboard?tab=leaves")}
              className="self-start sm:self-auto py-2 px-4 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[10px] shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 flex-shrink-0"
            >
              <CalendarDays size={14} />
              <span>Apply for Leave</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {activePaidLeaves.map((pl) => (
              <div 
                key={pl.id} 
                onClick={() => setSelectedPaidLeaveDetail(pl)}
                className="p-5 rounded-[20px] bg-gradient-to-br from-brand-primary/5 via-transparent to-transparent border border-border-card hover:border-brand-primary/30 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 cursor-pointer flex flex-col gap-3 group relative overflow-hidden text-left"
              >
                {/* Background glowing circle on hover */}
                <div className="absolute -right-6 -bottom-6 w-16 h-16 rounded-full bg-brand-primary/10 group-hover:scale-[2] transition-all duration-500 pointer-events-none" />

                <div className="flex justify-between items-start gap-3">
                  <span className="font-black text-xs text-text-main leading-tight group-hover:text-brand-primary transition-colors truncate max-w-[150px]" title={pl.title}>{pl.title}</span>
                  <span className="bg-brand-primary/10 text-brand-primary text-[8px] font-black px-2.5 py-1 rounded-full whitespace-nowrap">
                    {pl.startDate && pl.endDate ? (
                      pl.startDate === pl.endDate ? (
                        new Date(pl.startDate).toLocaleDateString([], { month: "short", day: "numeric" })
                      ) : (
                        `${new Date(pl.startDate).toLocaleDateString([], { month: "short", day: "numeric" })} - ${new Date(pl.endDate).toLocaleDateString([], { month: "short", day: "numeric" })}`
                      )
                    ) : (
                      new Date(pl.date || pl.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })
                    )}
                  </span>
                </div>
                <p className="text-[10px] text-text-sec leading-relaxed font-semibold line-clamp-2">{pl.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upper Dashboard welcome panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-text-sec mt-1 flex items-center gap-1.5 sm:gap-2">
            <CalendarDays size={14} className="text-brand-primary flex-shrink-0" />
            <span className="truncate">{getTodayFormatted()} • {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>

        {/* Current Location header status */}
        <div className="w-full sm:w-auto bg-bg-card border-l-4 border-brand-primary border border-border-card rounded-[14px] p-3 sm:p-4 flex items-center justify-between gap-4 shadow-sm">
          <div className="text-left">
            <span className="text-[9px] font-bold text-text-mut uppercase tracking-wider block">CURRENT LOCATION</span>
            <span className="text-xs font-extrabold text-brand-primary flex items-center gap-1 mt-0.5">
              <MapPin size={12} />
              {gpsLocation ? `~${gpsLocation.accuracy}m accuracy` : "HQ Office"}
            </span>
          </div>

          {/* Top check in Shortcut */}
          {!todayLog ? (
            <button
              onClick={handleCheckIn}
              disabled={actionLoading || fetchingGps}
              className="py-2.5 px-4 bg-brand-primary hover:bg-brand-hover text-white font-bold text-xs rounded-[10px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Play size={12} fill="#fff" />
              <span>check in</span>
            </button>
          ) : todayLog.status === "checked-in" ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-brand-primary bg-brand-primary/10 px-2.5 py-1.5 rounded-[8px] animate-pulse">
                {formatDuration(getElapsedWorkingMs())}
              </span>
              <button
                onClick={handleCheckOut}
                disabled={actionLoading}
                className="py-2.5 px-4 bg-brand-danger hover:bg-brand-danger-hover text-white font-bold text-xs rounded-[10px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Square size={10} fill="#fff" />
                <span>check out</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-text-mut px-3 py-2 bg-bg-base rounded-[10px] flex items-center gap-2">
              <span>{todayLog.status === "on-break" ? "On Break" : "Shift Ended"}</span>
              <span className="text-[10px] font-mono text-text-sec bg-bg-card border border-border-card px-2 py-0.5 rounded">
                {formatDuration(getElapsedWorkingMs())}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Main content split dashboard layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left pane: Actions, Charts, Leaves */}
        <div className="lg:col-span-2 space-y-8">

          {/* Card 1: Shift Control / Active Action Panel */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 lg:p-8 shadow-sm flex flex-col justify-center items-center min-h-[280px]">
            {/* Action State: 1. NOT CHECKED IN AND SHIFT NOT ACTIVE */}
            {!todayLog && !isWithinShiftHours() && (
              <div className="text-center max-w-md p-4">
                <div className="w-16 h-16 rounded-full bg-brand-warning/10 text-brand-warning flex items-center justify-center mx-auto mb-5">
                  <Clock size={28} />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-1.5">Shift Inactive</h3>
                <p className="text-sm text-text-sec mb-5 leading-relaxed">
                  Your registered shift schedule is <strong className="text-text-main">{formatShiftTime(currentUser.shiftStart)} - {formatShiftTime(currentUser.shiftEnd)}</strong>.
                </p>
                <span className="inline-block px-4 py-2 bg-brand-warning/5 border border-dashed border-brand-warning/20 rounded-[10px] text-[11px] font-bold text-brand-warning uppercase tracking-wide">
                  Unlocks during shift hours
                </span>
              </div>
            )}

            {/* Action State: 2. NOT CHECKED IN AND SHIFT IS ACTIVE */}
            {!todayLog && isWithinShiftHours() && (
              <div className="text-center max-w-md p-4">
                <div className="w-16 h-16 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto mb-5 animate-pulse">
                  <Play size={24} fill="currentColor" className="ml-1" />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-1.5">Ready to check in?</h3>
                <p className="text-sm text-text-sec mb-6 leading-relaxed">
                  Your shift schedule is active. check in with GPS tracking enabled to start logging your attendance.
                </p>
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading || fetchingGps || !!gpsError}
                  className="px-8 py-3.5 bg-brand-primary hover:bg-brand-hover text-white font-extrabold text-sm rounded-[14px] flex items-center gap-2 mx-auto shadow-md shadow-brand-primary/15 transition-all cursor-pointer"
                >
                  <Play size={16} fill="#fff" />
                  <span>check in Now</span>
                </button>
              </div>
            )}

            {/* Action State: 3. WORKING / CHECKED-IN */}
            {todayLog && todayLog.status === "checked-in" && (() => {
              const shortBalMin = Math.max(0, Math.round(shortBreakBalance / 60));
              const longBalMin = Math.max(0, Math.round(longBreakBalance / 60));

              return (
                <div className="w-full text-center p-2">
                  <div className="w-16 h-16 rounded-full bg-brand-success/10 text-brand-success flex items-center justify-center mx-auto mb-5">
                    <CheckCircle size={28} />
                  </div>
                  <h3 className="text-xl font-bold text-text-main mb-1">Shift In Progress</h3>
                  <p className="text-sm text-text-sec mb-4">
                    You checked in today at <strong className="text-text-main">{new Date(todayLog.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>.
                  </p>

                  {/* Digital Clock Shift Duration Ticker */}
                  <div className="relative w-full max-w-[320px] bg-bg-base/70 p-4 rounded-[20px] border border-dashed border-border-card flex flex-col items-center justify-center mx-auto mb-6 overflow-hidden">
                    <div className="text-3xl font-mono font-extrabold text-brand-primary tracking-wider drop-shadow-sm mb-1 animate-pulse">
                      {formatDuration(getElapsedWorkingMs())}
                    </div>
                    <span className="text-[9px] font-bold text-text-sec uppercase tracking-wide">
                      Active Shift Duration
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[480px] mx-auto mb-6">
                    <button
                      onClick={() => handleStartBreak("short")}
                      disabled={actionLoading || shortBreakBalance <= 0}
                      className="py-3 px-4 bg-brand-warning hover:bg-brand-warning-hover text-white font-bold text-xs rounded-[12px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Coffee size={15} />
                      <span>Short Break ({shortBalMin}m left)</span>
                    </button>
                    <button
                      onClick={() => handleStartBreak("long")}
                      disabled={actionLoading || longBreakBalance <= 0}
                      className="py-3 px-4 bg-brand-warning hover:bg-brand-warning-hover text-white font-bold text-xs rounded-[12px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Coffee size={15} />
                      <span>Long Break ({longBalMin}m left)</span>
                    </button>
                  </div>

                  <button
                    onClick={handleCheckOut}
                    disabled={actionLoading}
                    className="py-3 px-8 bg-brand-danger hover:bg-brand-danger-hover text-white font-bold text-xs rounded-[12px] flex items-center justify-center gap-1.5 mx-auto shadow-sm transition-colors cursor-pointer"
                  >
                    <Square size={11} fill="#fff" />
                    <span>check out & End Shift</span>
                  </button>
                </div>
              );
            })()}

            {/* Action State: 4. ON BREAK */}
            {todayLog && todayLog.status === "on-break" && (
              <div className="w-full text-center p-2">
                <div className="w-16 h-16 rounded-full bg-brand-warning/10 text-brand-warning flex items-center justify-center mx-auto mb-5 animate-spin duration-[4000ms]">
                  <Coffee size={28} />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-1.5">Break in Progress</h3>

                <div className="relative w-full max-w-[400px] bg-bg-base/70 p-5 rounded-[20px] border border-dashed border-border-card flex flex-col items-center justify-center mx-auto my-5 overflow-hidden">
                  <div className="text-4xl font-mono font-extrabold text-brand-primary tracking-wider drop-shadow-sm mb-1.5">
                    {formatTime(timeLeft)}
                  </div>

                  {timeLeft > 0 ? (
                    <span className="text-[10px] font-bold text-text-sec uppercase tracking-wide">
                      Remaining Break Balance
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-brand-danger flex items-center gap-1 animate-pulse">
                      <AlertCircle size={12} /> Balance Expired! Resume shift.
                    </span>
                  )}

                  <div
                    className={`absolute bottom-0 left-0 h-[3px] transition-all duration-1000 ${timerExpired ? "bg-brand-danger" : "bg-brand-warning"}`}
                    style={{ width: `${timerPercentage}%` }}
                  />
                </div>

                <div className="mb-5 text-xs text-text-sec font-semibold">
                  Shift paused at: <strong className="text-text-main font-mono">{formatDuration(getElapsedWorkingMs())}</strong>
                </div>

                <button
                  onClick={handleResumeWork}
                  disabled={actionLoading}
                  className="py-3 px-10 bg-brand-primary hover:bg-brand-hover text-white font-bold text-xs rounded-[14px] flex items-center justify-center gap-1.5 mx-auto shadow-md shadow-brand-primary/10 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Resume Shift</span>
                </button>
              </div>
            )}

            {/* Action State: 5. CHECKED OUT */}
            {todayLog && todayLog.status === "checked-out" && (
              <div className="text-center p-4 w-full">
                <div className="w-16 h-16 rounded-full bg-brand-success/10 text-brand-success flex items-center justify-center mx-auto mb-5">
                  <CheckCircle size={28} />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-1.5">Workday Completed</h3>
                <p className="text-sm text-text-sec mb-4">
                  You checked out today at <strong className="text-text-main">{new Date(todayLog.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>.
                </p>

                {/* Frozen Digital Clock Shift Duration */}
                <div className="relative w-full max-w-[320px] bg-bg-base/70 p-4 rounded-[20px] border border-dashed border-border-card flex flex-col items-center justify-center mx-auto mb-5 overflow-hidden">
                  <div className="text-3xl font-mono font-extrabold text-brand-success tracking-wider drop-shadow-sm mb-1">
                    {formatDuration(getElapsedWorkingMs())}
                  </div>
                  <span className="text-[9px] font-bold text-text-sec uppercase tracking-wide">
                    Total Shift Duration
                  </span>
                </div>

                <div className="inline-flex py-2.5 px-4 bg-brand-success/5 border border-brand-success/20 rounded-[12px] text-xs font-bold text-brand-success gap-1.5 uppercase tracking-wide">
                  <span>Logged:</span>
                  <strong>{((todayLog.totalWorkingMinutes || 0) / 60).toFixed(2)} hrs</strong>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Weekly Attendance Chart */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-extrabold text-base text-text-main tracking-tight">Weekly Attendance</h3>
                <p className="text-[10px] text-text-mut font-semibold">Shift hours completed during the current week</p>
              </div>
              <button
                onClick={() => navigate("/history")}
                className="text-xs font-bold text-brand-primary hover:text-brand-hover hover:underline cursor-pointer"
              >
                View Detailed Report
              </button>
            </div>

            {/* Bars chart */}
            <div className="flex items-end justify-around h-[160px] border-b border-border-card pb-2 pt-4 px-2">
              {weeklyHoursData.map((d, idx) => {
                const barPercent = Math.max(4, Math.min(100, Math.round((d.hours / maxWeeklyHours) * 100)));
                return (
                  <div key={idx} className="flex flex-col items-center gap-2 group w-8">
                    {/* Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 absolute transform -translate-y-12 bg-slate-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow pointer-events-none transition-opacity duration-150">
                      {d.hours} hrs
                    </div>

                    {/* Bar */}
                    <div
                      className={`w-4 rounded-t-sm transition-all duration-500 relative overflow-hidden ${d.active
                        ? "bg-brand-primary"
                        : d.hours > 0 ? "bg-brand-primary/60" : "bg-slate-200 dark:bg-slate-800"
                        }`}
                      style={{ height: `${barPercent}%` }}
                    />

                    {/* Label */}
                    <span className={`text-[10px] font-extrabold tracking-tight ${d.active ? "text-brand-primary" : "text-text-sec"}`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>



          {/* Leave Card Balances Row */}
          {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            Annual Leave
            <div className="bg-bg-card border border-border-card border-t-4 border-t-brand-primary rounded-[20px] p-5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">ANNUAL LEAVE</span>
              <span className="text-3xl font-extrabold text-text-main block mt-1.5 mb-0.5">14.5</span>
              <span className="text-[10px] font-semibold text-text-sec">Days Available</span>
            </div>

            Sick Leave
            <div className="bg-bg-card border border-border-card border-t-4 border-t-brand-warning rounded-[20px] p-5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">SICK LEAVE</span>
              <span className="text-3xl font-extrabold text-text-main block mt-1.5 mb-0.5">06</span>
              <span className="text-[10px] font-semibold text-text-sec">Days Remaining</span>
            </div>

            Casual Leave
            <div className="bg-bg-card border border-border-card border-t-4 border-t-brand-success rounded-[20px] p-5 shadow-sm text-left">
              <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">CASUAL LEAVE</span>
              <span className="text-3xl font-extrabold text-text-main block mt-1.5 mb-0.5">03</span>
              <span className="text-[10px] font-semibold text-text-sec">Allocated</span>
            </div>
          </div> */}
        </div>

        {/* Right pane: GPS tracking details & Activity Log */}
        <div className="space-y-8">

          {/* Card 1: GPS Coordinates Card */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
            <h3 className="font-extrabold text-base text-text-main tracking-tight mb-4 flex items-center gap-2">
              <Compass size={18} className="text-brand-primary" />
              <span>GPS Geolocation</span>
            </h3>

            {fetchingGps ? (
              <div className="text-center py-6">
                <div className="border-2 border-border-card border-t-brand-primary rounded-full w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-xs text-text-sec">Syncing coordinates...</p>
              </div>
            ) : gpsError ? (
              <div className="bg-brand-danger/5 border border-brand-danger/25 p-3.5 rounded-[12px] text-xs text-brand-danger">
                <div className="font-bold flex items-center gap-1 mb-1">
                  <AlertCircle size={14} /> Location Alert
                </div>
                {gpsError}
              </div>
            ) : gpsLocation ? (
              <div className="space-y-3">
                <div className="p-3 bg-brand-success/5 border border-brand-success/20 rounded-[10px] text-center">
                  <span className="text-[9px] font-bold text-text-mut tracking-wider block uppercase">GEOLOCATION LOCKED</span>
                  <span className="text-xs font-bold text-brand-success mt-0.5 block">Office Area Confirmed</span>
                </div>
                <div className="flex justify-between items-center text-xs text-text-sec border-t border-border-card pt-3">
                  <span>Accuracy: ~{gpsLocation.accuracy}m</span>
                  <button
                    onClick={refreshLocation}
                    className="py-1 px-2.5 border border-border-card rounded-[6px] hover:bg-bg-base text-[10px] font-bold cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-sec">Pending location access permission.</p>
            )}
          </div>

          {/* Card 2: Recent Activity Timeline */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
            <h3 className="font-extrabold text-base text-text-main tracking-tight mb-6">Recent Activity</h3>

            {/* Timeline nodes */}
            <div className="relative pl-5 border-l border-border-card space-y-6 ml-2 text-left">
              {recentActivities.map((act, idx) => {
                let dotColor = "bg-brand-primary";
                if (act.type === "out") dotColor = "bg-brand-danger";
                if (act.type === "break") dotColor = "bg-brand-warning";
                if (act.type === "work") dotColor = "bg-brand-primary";
                if (act.type === "in") dotColor = "bg-brand-success";

                return (
                  <div key={idx} className="relative">
                    {/* Node Dot */}
                    <div className={`absolute -left-[25px] top-1 w-2.5 h-2.5 rounded-full border-2 border-bg-card ${dotColor}`} />

                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-extrabold text-text-main">{act.title}</h4>
                        <span className="text-[10px] text-text-mut font-semibold">{act.desc}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-text-main block">{act.time}</span>
                        <span className="text-[8px] text-text-mut uppercase font-extrabold block">{act.dateText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Redirect */}
            <button
              onClick={() => navigate("/history")}
              className="w-full mt-6 py-2.5 border border-border-card text-text-sec hover:text-brand-primary font-bold text-xs rounded-[12px] bg-bg-card hover:bg-bg-base transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>View All History</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Glassmorphic Checkout Confirmation Modal */}
      {showCheckoutConfirm && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[440px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-text-main">Confirm check out</h3>
              <button
                onClick={() => setShowCheckoutConfirm(false)}
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-text-sec leading-relaxed mb-6">
              Are you sure you want to check out? This will end your workday shift and submit your total completed active hours.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCheckoutConfirm(false)}
                className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-all cursor-pointer"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmCheckOut}
                className="py-2.5 px-5 bg-brand-danger text-white text-xs font-bold rounded-[12px] hover:bg-brand-danger-hover transition-colors cursor-pointer"
                disabled={actionLoading}
              >
                {actionLoading ? "Processing..." : "check out"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Paid Leave Detail Modal */}
      {selectedPaidLeaveDetail && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[500px] bg-bg-card border border-border-card rounded-[24px] p-6 lg:p-8 shadow-xl animate-scale-up text-left relative overflow-hidden">
            {/* Glowing top effect */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-brand-primary" />

            <div className="flex justify-between items-center mb-6 border-b border-border-card pb-4">
              <h3 className="font-extrabold text-lg text-text-main flex items-center gap-2">
                <CalendarDays size={20} className="text-brand-primary animate-bounce" />
                <span>Paid Leave Details</span>
              </h3>
              <button
                onClick={() => setSelectedPaidLeaveDetail(null)}
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[9px] font-bold text-text-mut uppercase tracking-wider block">HOLIDAY TITLE</span>
                <span className="text-lg font-black text-text-main mt-0.5 block">{selectedPaidLeaveDetail.title}</span>
              </div>

              <div className="p-4 rounded-[16px] bg-brand-primary/5 border border-brand-primary/10 flex items-center gap-4">
                <div className="w-10 h-10 rounded-[12px] bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block">HOLIDAY DURATION</span>
                  <span className="text-sm font-bold text-text-main mt-0.5 block">
                    {selectedPaidLeaveDetail.startDate && selectedPaidLeaveDetail.endDate ? (
                      selectedPaidLeaveDetail.startDate === selectedPaidLeaveDetail.endDate ? (
                        new Date(selectedPaidLeaveDetail.startDate).toLocaleDateString([], { weekday: 'long', month: "long", day: "numeric", year: "numeric" })
                      ) : (
                        `${new Date(selectedPaidLeaveDetail.startDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} to ${new Date(selectedPaidLeaveDetail.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                      )
                    ) : (
                      new Date(selectedPaidLeaveDetail.date || selectedPaidLeaveDetail.createdAt).toLocaleDateString([], { weekday: 'long', month: "long", day: "numeric", year: "numeric" })
                    )}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[9px] font-bold text-text-mut uppercase tracking-wider block">DESCRIPTION & BENEFITS</span>
                <p className="text-xs text-text-sec leading-relaxed font-semibold mt-1.5 p-3.5 bg-bg-base/30 rounded-[12px] border border-border-card">
                  {selectedPaidLeaveDetail.description}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border-card flex justify-end">
              <button
                onClick={() => setSelectedPaidLeaveDetail(null)}
                className="py-2 px-6 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[10px] transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
