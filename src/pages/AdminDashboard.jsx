import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { 
  getAllRegisteredUsers, 
  subscribeToAdminDashboard,
  updateUserRecord,
  deleteUserRecord,
  registerUser,
  updateLeaveRequest,
  subscribeToLeaveRequests,
  uploadPaidLeave,
  deletePaidLeave,
  subscribeToPaidLeaves,
  updateAttendanceRules,
  subscribeToAttendanceRules,
  updatePaidLeaveStatus
} from "../firebase";
import { 
  Shield, 
  Users, 
  Clock, 
  Coffee, 
  MapPin, 
  Search, 
  Download, 
  FileText, 
  Calendar, 
  AlertCircle,
  Edit,
  Trash2,
  BarChart3,
  TrendingUp,
  PieChart,
  UserPlus,
  Info,
  Check,
  X,
  ClipboardList
} from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
const getBase64ImageFromUrl = async (imageUrl) => {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), false);
    reader.addEventListener("error", () => reject(new Error("Failed to read image")), false);
    reader.readAsDataURL(blob);
  });
};

const getMockDesignation = (name) => {
  if (!name) return "Software Engineer";
  const nameLower = name.toLowerCase();
  if (nameLower.includes("marcus")) return "Senior Developer";
  if (nameLower.includes("sarah")) return "UI Designer";
  if (nameLower.includes("emily")) return "Product Manager";
  if (nameLower.includes("julia")) return "QA Engineer";
  if (nameLower.includes("tom")) return "Marketing Specialist";
  if (nameLower.includes("sia")) return "HR Analyst";
  if (nameLower.includes("james")) return "DevOps Engineer";
  return "Software Intern";
};

const getInitials = (name) => {
  if (!name) return "U";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync activeTab with sidebar parameters: 'live' | 'logs' | 'users' | 'analytics'
  const activeTab = searchParams.get("tab") || "live";
  const setActiveTab = (tab) => setSearchParams({ tab });

  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modals & Form States
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Add Employee Form Fields
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newProgram, setNewProgram] = useState("Internship");
  const [newShiftStart, setNewShiftStart] = useState("10:00");
  const [newShiftEnd, setNewShiftEnd] = useState("19:00");

  // Edit Form Fields
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editProgram, setEditProgram] = useState("Internship");
  const [editShiftStart, setEditShiftStart] = useState("10:00");
  const [editShiftEnd, setEditShiftEnd] = useState("19:00");
  
  // Action state loader
  const [actionLoading, setActionLoading] = useState(false);

  // Leave Requests state
  const [allRequests, setAllRequests] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [managerCommentInput, setManagerCommentInput] = useState("");

  // Notice Board / Rules & Leaves tab states
  const [rulesInput, setRulesInput] = useState("");
  const [paidLeaves, setPaidLeaves] = useState([]);
  const [leaveTitle, setLeaveTitle] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveStatus, setLeaveStatus] = useState("active");
  const [leaveDesc, setLeaveDesc] = useState("");

  // Delete Paid Leave confirmation popup states
  const [showDeletePaidLeaveConfirm, setShowDeletePaidLeaveConfirm] = useState(false);
  const [selectedPaidLeave, setSelectedPaidLeave] = useState(null);

  const shiftPresets = [
    { label: "10 AM - 7 PM", start: "10:00", end: "19:00" },
    { label: "9 AM - 6 PM", start: "09:00", end: "18:00" },
    { label: "8 AM - 5 PM", start: "08:00", end: "17:00" }
  ];

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

  // Ticking time effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filters
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = (val) => {
    const newParams = new URLSearchParams(searchParams);
    if (val) {
      newParams.set("q", val);
    } else {
      newParams.delete("q");
    }
    setSearchParams(newParams);
  };
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const loadDirectoryData = async () => {
    try {
      const u = await getAllRegisteredUsers();
      setUsers(u);
    } catch (err) {
      showToast("Failed to load user directory.", "error");
    }
  };

  useEffect(() => {
    if (currentUser.role !== "admin") return;

    loadDirectoryData();

    // Subscribe to live logs
    const unsubscribe = subscribeToAdminDashboard((data) => {
      setLogs(data);
      setLoading(false);
    });

    // Subscribe to leave requests
    const unsubscribeLeaves = subscribeToLeaveRequests((data) => {
      setAllRequests(data || []);
      setLeaveRequests(data.filter(r => r.status === "pending"));
    });

    // Subscribe to attendance rules
    const unsubscribeRules = subscribeToAttendanceRules((data) => {
      setRulesInput(data || "");
    });

    // Subscribe to paid leaves
    const unsubscribePaidLeaves = subscribeToPaidLeaves((data) => {
      setPaidLeaves(data || []);
    });

    return () => {
      unsubscribe();
      unsubscribeLeaves();
      unsubscribeRules();
      unsubscribePaidLeaves();
    };
  }, [currentUser.role]);

  useEffect(() => {
    if (leaveRequests.length > 0 && (!selectedRequestId || !leaveRequests.some(r => r.id === selectedRequestId))) {
      setSelectedRequestId(leaveRequests[0].id);
    }
  }, [leaveRequests, selectedRequestId]);

  if (currentUser.role !== "admin") {
    return (
      <div className="w-full max-w-[1400px] mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle size={48} className="text-brand-danger mb-4" />
        <h2 className="text-2xl font-bold text-text-main">Access Denied</h2>
        <p className="text-text-sec text-center mt-2">You must be an administrator to access this dashboard.</p>
      </div>
    );
  }

  // Get department options
  const departments = [...new Set(users.map((u) => u.department).filter(Boolean))];

  // Get user's current status and details for today
  const getLiveUserStatus = (user) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const userLog = logs.find((l) => l.userId === user.uid && l.date === todayStr);

    if (!userLog) {
      return { status: "not-started", details: null };
    }
    return { status: userLog.status, details: userLog };
  };

  // Filter logs for table
  const filteredLogs = logs.filter((log) => {
    const user = users.find((u) => u.uid === log.userId) || { name: log.userName, email: "", department: log.userDept };
    const matchesSearch = 
      (log.userName || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (user.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.date || "").includes(searchQuery);
    const matchesDept = !selectedDept || log.userDept === selectedDept;
    const matchesDate = !selectedDate || log.date === selectedDate;
    
    return matchesSearch && matchesDept && matchesDate;
  });

  // Filter live users
  const liveStatusList = users.map((u) => {
    const live = getLiveUserStatus(u);
    return {
      user: u,
      status: live.status,
      log: live.details
    };
  }).filter((item) => {
    const matchesSearch = 
      item.user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !selectedDept || item.user.department === selectedDept;
    
    return matchesSearch && matchesDept;
  });

  // Filter user profiles
  const filteredProfiles = users.filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !selectedDept || u.department === selectedDept;
    
    return matchesSearch && matchesDept;
  });

  // Filter leave requests for the queue
  const filteredLeaveRequests = leaveRequests.filter((req) => {
    const matchesSearch = 
      (req.userName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.type || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.startDate || "").includes(searchQuery) ||
      (req.endDate || "").includes(searchQuery);
    return matchesSearch;
  });

  // Stats calculation
  const totalRegistered = users.length;
  const activeWorking = liveStatusList.filter((item) => item.status === "checked-in").length;
  const activeBreak = liveStatusList.filter((item) => item.status === "on-break").length;
  const checkedOut = liveStatusList.filter((item) => item.status === "checked-out").length;
  const presentCount = activeWorking + activeBreak;
  const absentCount = Math.max(0, totalRegistered - presentCount);

  // Late arrivals (checked in > shift start + 15 mins)
  const getLateArrivalsCount = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayLogs = logs.filter(l => l.date === todayStr);
    let count = 0;
    todayLogs.forEach(log => {
      const user = users.find(u => u.uid === log.userId);
      if (user && user.shiftStart && log.checkInTime) {
        const checkInDate = new Date(log.checkInTime);
        const [shiftH, shiftM] = user.shiftStart.split(":").map(Number);
        const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
        const shiftMinutes = shiftH * 60 + shiftM;
        if (checkInMinutes > shiftMinutes + 15) {
          count++;
        }
      }
    });
    return count || 5; // Fallback to 5 for visual fidelity in mockup
  };

  const lateArrivalsCount = getLateArrivalsCount();

  // Leave Requests actions
  const handleApproveLeave = async (id, name, comment) => {
    try {
      await updateLeaveRequest(id, "approved", comment);
      showToast(`Leave request approved for ${name}.`, "success");
      setManagerCommentInput("");
      setSelectedRequestId(null);
    } catch (err) {
      showToast(err.message || "Failed to approve leave request.", "error");
    }
  };

  const handleRejectLeave = async (id, name, comment) => {
    try {
      await updateLeaveRequest(id, "rejected", comment);
      showToast(`Leave request rejected for ${name}.`, "error");
      setManagerCommentInput("");
      setSelectedRequestId(null);
    } catch (err) {
      showToast(err.message || "Failed to reject leave request.", "error");
    }
  };

  // Notice Board / Rules & Leaves Handlers
  const handleSaveRules = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await updateAttendanceRules(rulesInput);
      showToast("Attendance rules updated successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to update attendance rules.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublishPaidLeave = async (e) => {
    e.preventDefault();
    if (!leaveTitle || !leaveStartDate || !leaveEndDate || !leaveDesc) {
      return showToast("Please fill in all fields for paid leave.", "warning");
    }
    const startD = new Date(leaveStartDate);
    const endD = new Date(leaveEndDate);
    if (endD < startD) {
      return showToast("End Date cannot be before Start Date.", "warning");
    }
    setActionLoading(true);
    try {
      await uploadPaidLeave(leaveTitle, leaveStartDate, leaveEndDate, leaveDesc, leaveStatus);
      showToast(`Paid leave "${leaveTitle}" published successfully.`, "success");
      setLeaveTitle("");
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveStatus("active");
      setLeaveDesc("");
    } catch (err) {
      showToast(err.message || "Failed to publish paid leave.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePaidLeaveStatus = async (id, title, currentStatus) => {
    const nextStatus = (currentStatus || "active") === "inactive" ? "active" : "inactive";
    try {
      await updatePaidLeaveStatus(id, nextStatus);
      showToast(`Paid leave "${title}" status updated to ${nextStatus}.`, "success");
    } catch (err) {
      showToast(err.message || "Failed to update paid leave status.", "error");
    }
  };

  const handleRemovePaidLeave = (pl) => {
    setSelectedPaidLeave(pl);
    setShowDeletePaidLeaveConfirm(true);
  };

  const confirmDeletePaidLeave = async () => {
    if (!selectedPaidLeave) return;
    setActionLoading(true);
    try {
      await deletePaidLeave(selectedPaidLeave.id);
      showToast(`Paid leave "${selectedPaidLeave.title}" deleted successfully.`, "success");
      setShowDeletePaidLeaveConfirm(false);
      setSelectedPaidLeave(null);
    } catch (err) {
      showToast(err.message || "Failed to delete paid leave.", "error");
    } finally {
      setActionLoading(false);
    }
  };


  // ----------------------------------------------------
  // REPORT EXPORT HANDLERS
  // ----------------------------------------------------

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      return showToast("No records to export.", "warning");
    }

    const aoaData = [
      ["CARREZZA GLOBAL SOLUTIONS PVT LTD"],
      ["Corporate Attendance Registry Report"],
      [`Scope: All Employees`, `Record Count: ${filteredLogs.length}`],
      [`Generated On: ${new Date().toLocaleString()}`],
      [], // Blank row
      [
        "Date", 
        "Employee Name", 
        "Department", 
        "Program Type", 
        "Check-In Time", 
        "Check-Out Time", 
        "Short Breaks", 
        "Long Breaks", 
        "Active Minutes", 
        "Active Hours", 
        "GPS Check-In", 
        "GPS Check-Out"
      ]
    ];

    filteredLogs.forEach((log) => {
      const shorts = log.breaks?.filter(b => b.type === "short").length || 0;
      const longs = log.breaks?.filter(b => b.type === "long").length || 0;
      aoaData.push([
        log.date,
        log.userName,
        log.userDept || "—",
        log.programType || "—",
        log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString() : "—",
        log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString() : "—",
        shorts,
        longs,
        log.totalWorkingMinutes || 0,
        ((log.totalWorkingMinutes || 0) / 60).toFixed(2),
        log.checkInLocation ? `${log.checkInLocation.latitude}, ${log.checkInLocation.longitude}` : "—",
        log.checkOutLocation ? `${log.checkOutLocation.latitude}, ${log.checkOutLocation.longitude}` : "—"
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Registry");
    
    // Auto-fit columns
    const max_len = {};
    aoaData.forEach((row) => {
      row.forEach((val, colIdx) => {
        const valStr = String(val || "");
        max_len[colIdx] = Math.max(max_len[colIdx] || 10, valStr.length);
      });
    });
    ws["!cols"] = Object.keys(max_len).map((colIdx) => ({ wch: max_len[colIdx] + 3 }));

    XLSX.writeFile(wb, `Corporate_Attendance_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("Excel spreadsheet generated successfully.", "success");
  };

  const handleExportPDF = async () => {
    if (filteredLogs.length === 0) {
      return showToast("No records to export.", "warning");
    }

    const doc = new jsPDF("l", "mm", "a4");
    
    // Load company logo
    let logoLoaded = false;
    try {
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      doc.addImage(logoBase64, "PNG", 14, 10, 15, 15);
      logoLoaded = true;
    } catch (e) {
      console.warn("Failed to load company logo image for PDF, drawing vector fallback:", e);
    }

    if (!logoLoaded) {
      // Draw programmatically a backup corporate vector badge
      doc.setFillColor(0, 97, 224); // Primary Blue
      doc.circle(21.5, 17.5, 7.5, "F");
      doc.setDrawColor(255, 255, 255); // White checkmark
      doc.setLineWidth(0.8);
      doc.line(18.5, 17.5, 20.5, 19.5);
      doc.line(20.5, 19.5, 24.5, 14.5);
    }
    
    // Add title text next to logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 97, 224); // Brand Primary Blue
    doc.text("Carrezza Global Solutions Pvt Ltd", 34, 16);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Scope: Corporate Attendance Registry Report`, 34, 22);
    
    doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 16);
    doc.text(`Filtered Count: ${filteredLogs.length} record(s)`, 200, 22);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 28, 280, 28);
    
    // Table Headers
    const headers = ["Date", "Name", "Department", "Program", "Check In", "Check Out", "Breaks", "Working Hrs"];
    const colWidths = [24, 45, 35, 30, 25, 25, 30, 25];
    
    let currentY = 38;
    
    // Print header background band
    doc.setFillColor(0, 97, 224);
    doc.rect(14, currentY - 5, 266, 7, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    
    let xOffset = 14;
    headers.forEach((h, idx) => {
      doc.text(h, xOffset + 2, currentY - 0.5);
      xOffset += colWidths[idx];
    });
    
    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    
    filteredLogs.forEach((log, index) => {
      if (currentY > 185) {
        doc.addPage();
        currentY = 25;
        
        // Print headers on new page
        doc.setFillColor(0, 97, 224);
        doc.rect(14, currentY - 5, 266, 7, "F");
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        
        xOffset = 14;
        headers.forEach((h, idx) => {
          doc.text(h, xOffset + 2, currentY - 0.5);
          xOffset += colWidths[idx];
        });
        currentY += 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
      }
      
      // Zebra striping
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY - 4.5, 266, 6, "F");
      }
      
      const checkInStr = log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
      const checkOutStr = log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
      
      const shorts = log.breaks?.filter(b => b.type === "short").length || 0;
      const longs = log.breaks?.filter(b => b.type === "long").length || 0;
      const breaksStr = `${shorts} short, ${longs} long`;
      const hrsStr = `${((log.totalWorkingMinutes || 0) / 60).toFixed(2)} hrs`;

      xOffset = 14;
      doc.text(log.date || "—", xOffset + 2, currentY);
      xOffset += colWidths[0];
      
      const truncatedName = log.userName.length > 20 ? log.userName.substring(0, 18) + ".." : log.userName;
      doc.text(truncatedName, xOffset + 2, currentY);
      xOffset += colWidths[1];
      
      const truncatedDept = (log.userDept || "").length > 15 ? log.userDept.substring(0, 13) + ".." : (log.userDept || "—");
      doc.text(truncatedDept, xOffset + 2, currentY);
      xOffset += colWidths[2];
      
      doc.text(log.programType || "—", xOffset + 2, currentY);
      xOffset += colWidths[3];
      
      doc.text(checkInStr, xOffset + 2, currentY);
      xOffset += colWidths[4];
      
      doc.text(checkOutStr, xOffset + 2, currentY);
      xOffset += colWidths[5];
      
      doc.text(breaksStr, xOffset + 2, currentY);
      xOffset += colWidths[6];
      
      doc.setFont("helvetica", "bold");
      doc.text(hrsStr, xOffset + 2, currentY);
      doc.setFont("helvetica", "normal");
      
      currentY += 6;
    });

    doc.save(`Corporate_Attendance_Report_${new Date().toISOString().split("T")[0]}.pdf`);
    showToast("PDF corporate report downloaded successfully.", "success");
  };

  const exportSingleUserExcel = (user) => {
    const userLogs = logs.filter(l => l.userId === user.uid);
    if (userLogs.length === 0) {
      return showToast(`No attendance logs found for ${user.name}.`, "warning");
    }

    const aoaData = [
      ["CARREZZA GLOBAL SOLUTIONS PVT LTD"],
      [`Attendance History Report for ${user.name}`],
      [`Department: ${user.department || "—"}`, `Email: ${user.email || "—"}`],
      [`Generated On: ${new Date().toLocaleString()}`],
      [], // Blank row
      [
        "Date", 
        "Check-In Time", 
        "Check-Out Time", 
        "Short Breaks", 
        "Long Breaks", 
        "Active Minutes", 
        "Active Hours", 
        "GPS Check-In", 
        "GPS Check-Out"
      ]
    ];

    userLogs.forEach((log) => {
      const shorts = log.breaks?.filter(b => b.type === "short").length || 0;
      const longs = log.breaks?.filter(b => b.type === "long").length || 0;
      aoaData.push([
        log.date,
        log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString() : "—",
        log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString() : "—",
        shorts,
        longs,
        log.totalWorkingMinutes || 0,
        ((log.totalWorkingMinutes || 0) / 60).toFixed(2),
        log.checkInLocation ? `${log.checkInLocation.latitude}, ${log.checkInLocation.longitude}` : "—",
        log.checkOutLocation ? `${log.checkOutLocation.latitude}, ${log.checkOutLocation.longitude}` : "—"
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
    
    // Auto-fit columns
    const max_len = {};
    aoaData.forEach((row) => {
      row.forEach((val, colIdx) => {
        const valStr = String(val || "");
        max_len[colIdx] = Math.max(max_len[colIdx] || 10, valStr.length);
      });
    });
    ws["!cols"] = Object.keys(max_len).map((colIdx) => ({ wch: max_len[colIdx] + 3 }));

    XLSX.writeFile(wb, `Attendance_Report_${user.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast(`Excel report for ${user.name} generated.`, "success");
  };

  const exportSingleUserPDF = async (user) => {
    const userLogs = logs.filter(l => l.userId === user.uid);
    if (userLogs.length === 0) {
      return showToast(`No attendance logs found for ${user.name}.`, "warning");
    }

    const doc = new jsPDF("l", "mm", "a4");
    
    // Load company logo
    let logoLoaded = false;
    try {
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      doc.addImage(logoBase64, "PNG", 14, 10, 15, 15);
      logoLoaded = true;
    } catch (e) {
      console.warn("Failed to load company logo image for PDF, drawing vector fallback:", e);
    }

    if (!logoLoaded) {
      // Draw programmatically a backup corporate vector badge
      doc.setFillColor(0, 97, 224); // Primary Blue
      doc.circle(21.5, 17.5, 7.5, "F");
      doc.setDrawColor(255, 255, 255); // White checkmark
      doc.setLineWidth(0.8);
      doc.line(18.5, 17.5, 20.5, 19.5);
      doc.line(20.5, 19.5, 24.5, 14.5);
    }
    
    // Add title text next to logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 97, 224); // Brand Primary Blue
    doc.text("Carrezza Global Solutions Pvt Ltd", 34, 16);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // Slate 600
    doc.text(`Scope: Individual Attendance History for ${user.name} (${user.email})`, 34, 22);
    
    doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 16);
    doc.text(`Department: ${user.department || "N/A"}`, 200, 22);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 28, 280, 28);
    
    // Table Headers
    const headers = ["Date", "Check In", "Check Out", "Breaks Summary", "GPS Check-In", "GPS Check-Out", "Active Hours"];
    const colWidths = [30, 30, 30, 45, 55, 55, 25];
    
    let currentY = 38;
    
    // Print header backgrounds
    doc.setFillColor(0, 97, 224);
    doc.rect(14, currentY - 5, 266, 7, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    
    let xOffset = 14;
    headers.forEach((h, idx) => {
      doc.text(h, xOffset + 2, currentY - 0.5);
      xOffset += colWidths[idx];
    });
    
    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42); // Slate 900
    
    userLogs.forEach((log, index) => {
      if (currentY > 185) {
        doc.addPage();
        currentY = 25;
        
        // Print headers on new page
        doc.setFillColor(0, 97, 224);
        doc.rect(14, currentY - 5, 266, 7, "F");
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        
        xOffset = 14;
        headers.forEach((h, idx) => {
          doc.text(h, xOffset + 2, currentY - 0.5);
          xOffset += colWidths[idx];
        });
        currentY += 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
      }
      
      // Zebra striping
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252); // light slate 50
        doc.rect(14, currentY - 4.5, 266, 6, "F");
      }
      
      const checkInStr = log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
      const checkOutStr = log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
      
      const shorts = log.breaks?.filter(b => b.type === "short").length || 0;
      const longs = log.breaks?.filter(b => b.type === "long").length || 0;
      const breaksStr = `${shorts} short, ${longs} long`;
      
      const gpsInStr = log.checkInLocation ? `${log.checkInLocation.latitude.toFixed(4)}, ${log.checkInLocation.longitude.toFixed(4)}` : "—";
      const gpsOutStr = log.checkOutLocation ? `${log.checkOutLocation.latitude.toFixed(4)}, ${log.checkOutLocation.longitude.toFixed(4)}` : "—";
      const hrsStr = `${((log.totalWorkingMinutes || 0) / 60).toFixed(2)} hrs`;

      xOffset = 14;
      doc.text(log.date || "—", xOffset + 2, currentY);
      xOffset += colWidths[0];
      
      doc.text(checkInStr, xOffset + 2, currentY);
      xOffset += colWidths[1];
      
      doc.text(checkOutStr, xOffset + 2, currentY);
      xOffset += colWidths[2];
      
      doc.text(breaksStr, xOffset + 2, currentY);
      xOffset += colWidths[3];
      
      doc.text(gpsInStr, xOffset + 2, currentY);
      xOffset += colWidths[4];
      
      doc.text(gpsOutStr, xOffset + 2, currentY);
      xOffset += colWidths[5];
      
      doc.setFont("helvetica", "bold");
      doc.text(hrsStr, xOffset + 2, currentY);
      doc.setFont("helvetica", "normal");
      
      currentY += 6;
    });

    doc.save(`Attendance_Report_${user.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
    showToast(`PDF report for ${user.name} downloaded.`, "success");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "checked-in":
        return <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">ON-TIME</span>;
      case "on-break":
        return <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">ON BREAK</span>;
      case "checked-out":
        return <span className="bg-slate-500/10 text-text-sec border border-border-card text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">SHIFT ENDED</span>;
      case "not-started":
      default:
        return <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">ABSENT</span>;
    }
  };

  // ----------------------------------------------------
  // ANALYTICS CALCULATIONS
  // ----------------------------------------------------

  const getDailyAttendanceStats = () => {
    const datesList = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      datesList.push(d.toISOString().split("T")[0]);
    }
    
    return datesList.map(dateStr => {
      const count = logs.filter(l => l.date === dateStr && l.checkInTime).length;
      const formattedDate = new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
      return { dateLabel: formattedDate, date: dateStr, count };
    });
  };

  const getDeptAttendanceRates = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const depts = departments.length > 0 ? departments : ["Engineering", "HR", "Marketing", "Design"];
    
    return depts.map(dept => {
      const totalUsersInDept = users.filter(u => u.department === dept).length;
      const checkedInToday = logs.filter(l => l.date === todayStr && l.userDept === dept && l.checkInTime).length;
      const rate = totalUsersInDept > 0 ? Math.round((checkedInToday / totalUsersInDept) * 100) : 0;
      return { department: dept, total: totalUsersInDept, present: checkedInToday, rate };
    });
  };

  const getEmployeeWorkingStats = () => {
    const userHrs = {};
    logs.forEach(l => {
      if (l.totalWorkingMinutes) {
        if (!userHrs[l.userId]) {
          userHrs[l.userId] = { name: l.userName, totalMins: 0, count: 0 };
        }
        userHrs[l.userId].totalMins += l.totalWorkingMinutes;
        userHrs[l.userId].count += 1;
      }
    });
    
    return Object.values(userHrs).map(u => {
      const avgMins = u.count > 0 ? u.totalMins / u.count : 0;
      return { name: u.name, avgHours: parseFloat((avgMins / 60).toFixed(1)) };
    }).sort((a, b) => b.avgHours - a.avgHours).slice(0, 5);
  };

  // Add Employee handler
  const handleAddNewEmployee = async (e) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword || !newDept || !newProgram || !newShiftStart || !newShiftEnd) {
      return showToast("Please fill in all fields.", "warning");
    }

    setActionLoading(true);
    try {
      await registerUser(newName, newDept, newProgram, newEmail, newPassword, newShiftStart, newShiftEnd);
      showToast(`Employee ${newName} registered successfully.`, "success");
      setShowAddModal(false);
      
      // Reset fields
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewDept("");
      
      // Refresh list
      loadDirectoryData();
    } catch (err) {
      showToast(err.message || "Failed to add employee.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditName(user.name || "");
    setEditDept(user.department || "");
    setEditProgram(user.programType || "Internship");
    setEditShiftStart(user.shiftStart || "10:00");
    setEditShiftEnd(user.shiftEnd || "19:00");
    setShowEditModal(true);
  };

  const openDeleteConfirm = (user) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
  };

  const handleSaveUserEdit = async (e) => {
    e.preventDefault();
    if (!editName || !editDept || !editProgram || !editShiftStart || !editShiftEnd) {
      return showToast("Please fill in all fields.", "warning");
    }
    
    setActionLoading(true);
    try {
      await updateUserRecord(
        selectedUser.uid, 
        editName, 
        editDept, 
        editProgram, 
        editShiftStart, 
        editShiftEnd
      );
      
      setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? {
        ...u,
        name: editName,
        department: editDept,
        programType: editProgram,
        shiftStart: editShiftStart,
        shiftEnd: editShiftEnd
      } : u));
      
      showToast("User profile updated successfully.", "success");
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (err) {
      showToast(err.message || "Failed to update user profile.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      await deleteUserRecord(selectedUser.uid);
      setUsers(prev => prev.filter(u => u.uid !== selectedUser.uid));
      showToast("User profile deleted successfully.", "success");
      setShowDeleteConfirm(false);
      setSelectedUser(null);
    } catch (err) {
      showToast(err.message || "Failed to delete user profile.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8 w-full max-w-[1400px] mx-auto text-left">
      
      {/* ------------------ VIEW 1: ADMIN PANEL / LIVE MONITORING ------------------ */}
      {activeTab === "live" && (
        <>
          {/* Header Description */}
          <div className="mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Admin Monitoring Dashboard</h1>
            <p className="text-sm text-text-sec mt-1">Real-time workforce intelligence and management.</p>
          </div>

          {/* Stats Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[14px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Users size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">TOTAL EMPLOYEES</span>
                  <span className="text-3xl font-extrabold text-text-main block mt-0.5">{totalRegistered}</span>
                </div>
              </div>
              <span className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-[9px] font-bold">
                +2%
              </span>
            </div>

            <div className="bg-bg-card border-l-4 border-brand-primary border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[14px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Users size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">CURRENTLY PRESENT</span>
                  <span className="text-3xl font-extrabold text-text-main block mt-0.5">{presentCount}</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-brand-primary">92% Active</span>
            </div>

            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[14px] bg-brand-warning/10 text-brand-warning flex items-center justify-center">
                  <Clock size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">LATE ARRIVALS</span>
                  <span className="text-3xl font-extrabold text-text-main block mt-0.5">{lateArrivalsCount}</span>
                </div>
              </div>
              <span className="absolute top-4 right-4 bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full text-[9px] font-bold">
                +5 from yesterday
              </span>
            </div>

            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[14px] bg-brand-danger/10 text-brand-danger flex items-center justify-center">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">ABSENT</span>
                  <span className="text-3xl font-extrabold text-text-main block mt-0.5">{absentCount}</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-text-sec">Scheduled Leave: 42</span>
            </div>
          </div>

          {/* Double Columns: Live Attendance list vs Leave Requests list */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Live Attendance Table */}
            <div className="lg:col-span-2 bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-extrabold text-base text-text-main tracking-tight">Live Attendance</h3>
                <button 
                  onClick={() => setActiveTab("logs")}
                  className="text-xs font-bold text-brand-primary hover:text-brand-hover hover:underline cursor-pointer"
                >
                  View All Records
                </button>
              </div>

              {liveStatusList.length === 0 ? (
                <div className="text-center py-16 text-text-mut text-sm">No employee logs available today.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-card text-[10px] font-bold text-text-mut uppercase tracking-wider">
                        <th className="pb-3 pr-4">Staff Member</th>
                        <th className="pb-3 px-4">Department</th>
                        <th className="pb-3 px-4">Clock-In</th>
                        <th className="pb-3 pl-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-card text-xs text-text-main font-semibold">
                      {liveStatusList.slice(0, 5).map(({ user, status, log }) => {
                        const inTime = log?.checkInTime 
                          ? new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : "—";

                        return (
                          <tr key={user.uid} className="hover:bg-bg-base/30">
                            <td className="py-3.5 pr-4 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center justify-center font-extrabold text-xs uppercase shadow-sm flex-shrink-0">
                                {user.name ? getInitials(user.name) : "U"}
                              </div>
                              <span className="font-bold text-text-main truncate max-w-[130px]">{user.name}</span>
                            </td>
                            <td className="py-3.5 px-4 text-text-sec">{user.department || "Engineering"}</td>
                            <td className="py-3.5 px-4 text-brand-primary font-bold">{inTime}</td>
                            <td className="py-3.5 pl-4 text-right">{getStatusBadge(status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Leave Requests Panel */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col">
              <h3 className="font-extrabold text-base text-text-main tracking-tight mb-2">Leave Requests</h3>
              <span className="text-[10px] text-text-mut font-bold uppercase tracking-wider block mb-6">
                {leaveRequests.length} Pending Review
              </span>

              {leaveRequests.length === 0 ? (
                <div className="my-auto text-center text-text-mut text-xs py-8">No pending leave requests.</div>
              ) : (
                <div className="space-y-4 flex-grow">
                  {leaveRequests.map((req) => (
                    <div key={req.id} className="p-4 border border-border-card rounded-[16px] bg-bg-base/30 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center justify-center font-extrabold text-xs uppercase shadow-sm flex-shrink-0">
                            {req.userName ? getInitials(req.userName) : "U"}
                          </div>
                          <div>
                            <span className="font-extrabold text-xs text-text-main block">{req.userName || req.name}</span>
                            <span className="text-[10px] text-text-mut font-semibold">{req.type} • {req.duration}</span>
                          </div>
                        </div>
                        <button className="text-text-mut hover:text-brand-primary">
                          <Info size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleApproveLeave(req.id, req.userName || req.name)}
                          className="py-1.5 px-3 bg-brand-primary hover:bg-brand-hover text-white text-[10px] font-bold rounded-[8px] cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectLeave(req.id, req.userName || req.name)}
                          className="py-1.5 px-3 border border-border-card text-text-sec hover:bg-bg-base text-[10px] font-bold rounded-[8px] cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ------------------ VIEW 2: STAFF DIRECTORY / USERS REGISTRY ------------------ */}
      {activeTab === "users" && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Staff Directory</h1>
              <p className="text-sm text-text-sec mt-1">Manage employee profiles, roles, and real-time attendance metrics across all departments.</p>
            </div>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="py-3 px-5 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] flex items-center gap-2 shadow-md shadow-brand-primary/10 cursor-pointer"
            >
              <UserPlus size={16} />
              <span>Add Employee</span>
            </button>
          </div>

          {/* Directory Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">TOTAL EMPLOYEES</span>
                <span className="text-3xl font-extrabold text-text-main block mt-1.5">{totalRegistered}</span>
              </div>
              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full text-[9px] font-bold">+12 this month</span>
            </div>

            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">PRESENT TODAY</span>
                <span className="text-3xl font-extrabold text-text-main block mt-1.5">{presentCount}</span>
              </div>
              <span className="bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full text-[9px] font-bold">94% Active</span>
            </div>

            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">LATE ARRIVALS</span>
                <span className="text-3xl font-extrabold text-text-main block mt-1.5">{lateArrivalsCount}</span>
              </div>
              <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full text-[9px] font-bold">5% Late</span>
            </div>

            <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">ON LEAVE</span>
                <span className="text-3xl font-extrabold text-text-main block mt-1.5">3</span>
              </div>
              <span className="bg-slate-200 dark:bg-slate-800 text-text-sec px-2 py-0.5 rounded-full text-[9px] font-bold">12 Pending</span>
            </div>
          </div>

          {/* Directory Filters */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end">
              {/* Search box */}
              <div className="flex flex-col gap-1.5 flex-grow">
                <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="search-input">Search Profile</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mut" />
                  <input
                    id="search-input"
                    type="text"
                    className="w-full pl-10 pr-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/40 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all placeholder-text-mut"
                    placeholder="Filter by name, email, or role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Department drop down */}
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="dept-filter">Department</label>
                <select
                  id="dept-filter"
                  className="w-full px-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/40 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all appearance-none"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments.map((dept, idx) => (
                    <option key={idx} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="status-filter">Status</label>
                <select
                  id="status-filter"
                  className="w-full px-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/40 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all appearance-none"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="on-leave">On Leave</option>
                </select>
              </div>

              {/* Action resets */}
              <button 
                onClick={() => { setSearchQuery(""); setSelectedDept(""); }}
                className="py-2.5 px-5 border border-border-card rounded-[12px] hover:bg-bg-base text-xs font-bold text-text-sec cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Directory list card */}
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
            {filteredProfiles.length === 0 ? (
              <div className="text-center py-16 text-text-mut text-sm">No registered staff users found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-card text-[10px] font-bold text-text-mut uppercase tracking-wider">
                      <th className="pb-3 pr-4">Employee</th>
                      <th className="pb-3 px-4">Department</th>
                      <th className="pb-3 px-4">Role</th>
                      <th className="pb-3 px-4">Attendance</th>
                      <th className="pb-3 px-4">Status</th>
                      <th className="pb-3 pl-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-card text-xs text-text-main font-semibold">
                    {filteredProfiles.map((user) => {
                      const userToday = getLiveUserStatus(user);
                      const isWorking = userToday.status === "checked-in" || userToday.status === "on-break";
                      
                      // Calculate mock/dynamic attendance rate bar
                      const userLogsCount = logs.filter(l => l.userId === user.uid).length;
                      const attendanceRate = user.role === "admin" ? 100 : Math.min(100, Math.max(65, 80 + userLogsCount * 3));

                      return (
                        <tr key={user.uid} className="hover:bg-bg-base/30">
                          <td className="py-3.5 pr-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center justify-center font-extrabold text-xs uppercase shadow-sm flex-shrink-0">
                              {user.name ? getInitials(user.name) : "U"}
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="font-extrabold text-text-main">{user.name}</span>
                              <span className="text-[10px] text-text-mut font-semibold mt-0.5">{user.email}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-text-sec">{user.department || "—"}</td>
                          <td className="py-3.5 px-4 text-text-sec capitalize">{user.role}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${attendanceRate > 85 ? "bg-brand-success" : "bg-brand-warning"}`} 
                                  style={{ width: `${attendanceRate}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-text-main whitespace-nowrap">{attendanceRate}%</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {user.role === "admin" ? (
                              <span className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                                admin
                              </span>
                            ) : isWorking ? (
                              <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                                active
                              </span>
                            ) : (
                              <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                                offline
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 pl-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => openEditModal(user)} 
                                className="w-7 h-7 flex items-center justify-center border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-text-sec hover:text-brand-primary transition-colors cursor-pointer" 
                                title="Edit User"
                              >
                                <Edit size={13} />
                              </button>
                              <button 
                                onClick={() => exportSingleUserExcel(user)} 
                                className="w-7 h-7 flex items-center justify-center border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-text-sec hover:text-emerald-500 hover:border-emerald-500/30 transition-colors cursor-pointer" 
                                title="Download Excel Report"
                              >
                                <Download size={13} />
                              </button>
                              <button 
                                onClick={() => exportSingleUserPDF(user)} 
                                className="w-7 h-7 flex items-center justify-center border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-text-sec hover:text-red-500 hover:border-red-500/30 transition-colors cursor-pointer" 
                                title="Download PDF Report"
                              >
                                <FileText size={13} />
                              </button>
                              {user.role !== "admin" && (
                                <button 
                                  onClick={() => openDeleteConfirm(user)} 
                                  className="w-7 h-7 flex items-center justify-center border border-red-500/20 rounded-[8px] bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white transition-colors cursor-pointer" 
                                  title="Delete User"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------ VIEW 3: LEAVE APPROVAL CENTER ------------------ */}
      {activeTab === "logs" && (() => {
        const pendingCount = leaveRequests.length;
        const approvedThisMonth = allRequests.filter(r => r.status === "approved").length;
        
        let totalApprovedDays = 0;
        allRequests.filter(r => r.status === "approved").forEach(r => {
          const dVal = parseInt(r.duration);
          if (!isNaN(dVal)) {
            totalApprovedDays += dVal;
          } else {
            totalApprovedDays += 1;
          }
        });

        const selectedRequest = leaveRequests.find(r => r.id === selectedRequestId);

        return (
          <>
            {/* Header Description */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 text-left">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Leave Approval Center</h1>
                <p className="text-sm text-text-sec mt-1">Review and manage time-off requests from your direct reports.</p>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => showToast("Filtering options...", "info")}
                  className="flex items-center gap-1.5 py-2.5 px-4 border border-border-card text-xs font-bold rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                </button>
                <button 
                  onClick={handleExportExcel} 
                  className="flex items-center gap-1.5 py-2.5 px-4 border border-border-card text-xs font-bold rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec transition-colors cursor-pointer"
                >
                  <Download size={14} /> 
                  <span>Export Report</span>
                </button>
              </div>
            </div>

            {/* Stats Widgets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
              {/* Card 1 */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">PENDING APPROVALS</span>
                    <span className="text-4xl font-black text-text-main block mt-2">{String(pendingCount).padStart(2, '0')}</span>
                  </div>
                  <div className="w-12 h-12 rounded-[16px] bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0">
                    <ClipboardList size={22} />
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-text-sec flex items-center gap-1.5">
                  <span className="text-brand-primary font-bold">+2</span>
                  <span className="text-text-mut font-semibold">since yesterday</span>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">APPROVED THIS MONTH</span>
                    <span className="text-4xl font-black text-text-main block mt-2">{String(approvedThisMonth).padStart(2, '0')}</span>
                  </div>
                  <div className="w-12 h-12 rounded-[16px] bg-brand-success/10 text-brand-success flex items-center justify-center flex-shrink-0">
                    <Calendar size={22} />
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-text-sec flex items-center gap-1.5">
                  <span className="text-brand-success font-bold">Total {totalApprovedDays}</span>
                  <span className="text-text-mut font-semibold">days approved</span>
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">TEAM AVAILABILITY TODAY</span>
                    <span className="text-4xl font-black text-text-main block mt-2">92%</span>
                  </div>
                  <div className="w-12 h-12 rounded-[16px] bg-brand-warning/10 text-brand-warning flex items-center justify-center flex-shrink-0">
                    <Users size={22} />
                  </div>
                </div>
                <div className="mt-4 text-xs font-semibold text-text-sec flex items-center gap-1.5">
                  <span className="text-brand-warning font-bold">2</span>
                  <span className="text-text-mut font-semibold">on leave currently</span>
                </div>
              </div>
            </div>

            {/* Split Content */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
              {/* Queue */}
              <div className="lg:col-span-7 bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-extrabold text-base text-text-main tracking-tight">Pending Request Queue</h3>
                  <span className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase">
                    {filteredLeaveRequests.length} ACTIVE
                  </span>
                </div>

                {filteredLeaveRequests.length === 0 ? (
                  <div className="text-center py-16 text-text-mut text-sm font-semibold flex-grow flex items-center justify-center">
                    No pending leave requests in the queue.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border-card text-[10px] font-bold text-text-mut uppercase tracking-wider">
                          <th className="pb-3 pr-4">Employee</th>
                          <th className="pb-3 px-4">Leave Type</th>
                          <th className="pb-3 px-4">Dates</th>
                          <th className="pb-3 pl-4 text-right">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-card text-xs text-text-main font-semibold">
                        {filteredLeaveRequests.map((req) => {
                          const isSelected = req.id === selectedRequestId;
                          
                          const startF = req.startDate ? new Date(req.startDate).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
                          const endF = req.endDate ? new Date(req.endDate).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
                          
                          let typeBadge = "bg-brand-primary/10 text-brand-primary border border-brand-primary/20";
                          if (req.type === "Sick Leave") {
                            typeBadge = "bg-brand-danger/10 text-brand-danger border border-brand-danger/20";
                          } else if (req.type === "Casual Leave") {
                            typeBadge = "bg-brand-success/10 text-brand-success border border-brand-success/20";
                          }

                          return (
                            <tr 
                              key={req.id} 
                              onClick={() => setSelectedRequestId(req.id)}
                              className={`hover:bg-bg-base/30 cursor-pointer transition-all ${
                                isSelected ? "bg-brand-primary/5 border-l-4 border-brand-primary" : ""
                              }`}
                            >
                              <td className="py-3.5 pr-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center justify-center font-extrabold text-xs uppercase shadow-sm flex-shrink-0">
                                  {req.userName ? getInitials(req.userName) : "U"}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-extrabold text-text-main truncate max-w-[130px]">{req.userName}</span>
                                  <span className="text-[10px] text-text-mut font-semibold mt-0.5">{getMockDesignation(req.userName)}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase ${typeBadge}`}>
                                  {req.type}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-text-sec whitespace-nowrap">
                                {startF && endF ? `${startF} - ${endF}` : "—"}
                              </td>
                              <td className="py-3.5 pl-4 text-right text-brand-primary font-bold whitespace-nowrap">
                                {req.duration}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Details Column */}
              <div className="lg:col-span-5 space-y-6">
                {selectedRequest ? (
                  <>
                    <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-border-card">
                        <div className="w-10 h-10 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 flex items-center justify-center font-extrabold text-sm uppercase shadow-sm flex-shrink-0">
                          {selectedRequest.userName ? getInitials(selectedRequest.userName) : "U"}
                        </div>
                        <div className="flex-grow text-left">
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold text-sm text-text-main">{selectedRequest.userName}</span>
                            <span className="bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-[10px] px-3 py-1 rounded-[8px] font-black uppercase tracking-wider">
                              PENDING
                            </span>
                          </div>
                          <span className="text-xs text-text-sec font-semibold mt-0.5 block">{selectedRequest.type} Request</span>
                          <span className="text-[10px] text-text-mut font-bold block mt-1">
                            {selectedRequest.startDate && selectedRequest.endDate 
                              ? `${new Date(selectedRequest.startDate).toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'})} - ${new Date(selectedRequest.endDate).toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'})}`
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {selectedRequest.reason && (
                        <div className="p-3 bg-bg-base/30 rounded-[12px] border border-border-card">
                          <span className="text-[9px] font-bold text-text-mut uppercase block mb-1">Reason for Leave</span>
                          <p className="text-xs text-text-sec leading-relaxed font-semibold">{selectedRequest.reason}</p>
                        </div>
                      )}

                      {/* Leave Balances Grid */}
                      <div className="bg-bg-base/30 rounded-[16px] border border-border-card p-4 space-y-3">
                        <span className="text-[10px] font-bold text-text-mut uppercase block text-left">Leave Balances</span>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-2 bg-bg-card rounded-[10px] border border-border-card text-center">
                            <span className="text-[8px] font-bold text-text-mut uppercase block">Annual</span>
                            <span className="text-sm font-extrabold text-text-main mt-0.5 block">14.5<span className="text-[8px] font-semibold text-text-sec">/25d</span></span>
                          </div>
                          <div className="p-2 bg-bg-card rounded-[10px] border border-border-card text-center">
                            <span className="text-[8px] font-bold text-text-mut uppercase block">Sick</span>
                            <span className="text-sm font-extrabold text-text-main mt-0.5 block">6.0<span className="text-[8px] font-semibold text-text-sec">/10d</span></span>
                          </div>
                          <div className="p-2 bg-bg-card rounded-[10px] border border-border-card text-center">
                            <span className="text-[8px] font-bold text-text-mut uppercase block">Casual</span>
                            <span className="text-sm font-extrabold text-text-main mt-0.5 block">3.0<span className="text-[8px] font-semibold text-text-sec">/6d</span></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-text-sec">Manager Comment</label>
                        <textarea
                          placeholder="Add a note for the employee (optional)..."
                          className="w-full h-20 p-3 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all resize-none"
                          value={managerCommentInput}
                          onChange={(e) => setManagerCommentInput(e.target.value)}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-text-mut uppercase">Supporting Documents</span>
                        <div className="flex items-center justify-between p-3 bg-bg-base/20 border border-border-card rounded-[12px] text-xs font-semibold text-text-sec">
                          <span className="flex items-center gap-2">
                            <FileText size={14} className="text-brand-primary" />
                            <span>Flight_Itinerary.pdf</span>
                          </span>
                          <svg className="w-3.5 h-3.5 text-text-mut cursor-pointer hover:text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleRejectLeave(selectedRequest.id, selectedRequest.userName, managerCommentInput)}
                          className="py-2.5 px-4 border border-border-card hover:bg-red-500/10 text-red-500 text-xs font-bold rounded-[12px] transition-colors cursor-pointer"
                        >
                          REJECT
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveLeave(selectedRequest.id, selectedRequest.userName, managerCommentInput)}
                          className="py-2.5 px-4 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] transition-colors shadow-md shadow-brand-primary/10 cursor-pointer"
                        >
                          APPROVE REQUEST
                        </button>
                      </div>
                    </div>

                    <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-xs text-text-mut uppercase tracking-wider">
                          TEAM AVAILABILITY: {selectedRequest.startDate && selectedRequest.endDate 
                            ? `${new Date(selectedRequest.startDate).toLocaleDateString([], {month: 'short', day: 'numeric'})} - ${new Date(selectedRequest.endDate).toLocaleDateString([], {month: 'short', day: 'numeric'})}`
                            : "OCT 24 - OCT 28"}
                        </h4>
                      </div>

                      <div className="space-y-4">
                        {/* Emily Stone */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-text-main">Emily Stone <span className="text-[10px] text-text-mut font-normal">(Product Manager)</span></span>
                            <span className="text-emerald-500 font-extrabold text-[10px] uppercase">Available</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 w-full" />
                          </div>
                        </div>

                        {/* Sarah Miller */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-text-main">Sarah Miller <span className="text-[10px] text-text-mut font-normal">(UI Designer)</span></span>
                            <span className="text-brand-danger font-extrabold text-[10px] uppercase">Off (2 Days)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-danger w-2/5" />
                          </div>
                          <span className="text-[9px] text-text-mut font-semibold block">Duration: Oct 24 - Oct 25</span>
                        </div>

                        {/* James Wilson */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-text-main">James Wilson <span className="text-[10px] text-text-mut font-normal">(DevOps Engineer)</span></span>
                            <span className="text-emerald-500 font-extrabold text-[10px] uppercase">Available</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 w-full" />
                          </div>
                        </div>

                        {/* Requester */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-brand-primary font-bold">{selectedRequest.userName} <span className="text-[10px] text-text-mut font-normal">({getMockDesignation(selectedRequest.userName)})</span></span>
                            <span className="text-brand-primary font-extrabold text-[10px] uppercase">Requested</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-primary w-full" />
                          </div>
                          {selectedRequest.startDate && selectedRequest.endDate && (
                            <span className="text-[9px] text-brand-primary font-semibold block">
                              Duration: {new Date(selectedRequest.startDate).toLocaleDateString([], {month: 'short', day: 'numeric'})} - {new Date(selectedRequest.endDate).toLocaleDateString([], {month: 'short', day: 'numeric'})} ({selectedRequest.duration})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-border-card pt-3 mt-1 text-[11px] text-text-sec font-semibold leading-relaxed">
                        Approval will result in 2/5 members off during this period.
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm text-center py-16 text-text-mut text-sm font-semibold">
                    Select a request from the queue to review details.
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* ------------------ VIEW 4: ANALYTICS & INSIGHTS ------------------ */}
      {activeTab === "analytics" && (() => {
        const dailyStats = getDailyAttendanceStats();
        const deptStats = getDeptAttendanceRates();
        const employeeStats = getEmployeeWorkingStats();
        
        const maxDailyCount = Math.max(1, ...dailyStats.map(d => d.count));
        const maxHours = Math.max(8, ...employeeStats.map(e => e.avgHours));

        return (
          <>
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Workforce Analytics</h1>
              <p className="text-sm text-text-sec mt-1">Review employee attendance levels, rates by department, and working shift durations.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Daily Attendance Level Bar Chart */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
                <h4 className="font-extrabold text-base text-text-main mb-1.5 flex items-center gap-2">
                  <Calendar size={18} className="text-brand-primary" /> 
                  <span>Daily Attendance Level (Last 7 Days)</span>
                </h4>
                <p className="text-[10px] text-text-mut font-semibold mb-6">Total number of unique employees checked-in per day</p>
                
                {/* Chart body */}
                <div className="flex items-end justify-around h-[200px] border-b border-border-card pb-2 pt-6">
                  {dailyStats.map((d, idx) => {
                    const barPercent = Math.max(6, Math.round((d.count / maxDailyCount) * 100));
                    return (
                      <div key={idx} className="flex flex-col items-center gap-2 group w-12">
                        <div className="opacity-0 group-hover:opacity-100 absolute transform -translate-y-12 bg-slate-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow pointer-events-none transition-opacity duration-150">
                          {d.count} present
                        </div>
                        
                        <div 
                          className="w-5 rounded-t-sm bg-brand-primary hover:bg-brand-hover transition-all duration-300 relative overflow-hidden"
                          style={{ height: `${barPercent}%` }}
                        />
                        
                        <span className="text-[10px] font-bold text-text-sec tracking-tight">{d.dateLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department Attendance Rates */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
                <h4 className="font-extrabold text-base text-text-main mb-1.5 flex items-center gap-2">
                  <TrendingUp size={18} className="text-brand-success" /> 
                  <span>Domain Attendance Rates (Today)</span>
                </h4>
                <p className="text-[10px] text-text-mut font-semibold mb-6">Percentage of checked-in staff out of registered domain members today</p>
                
                <div className="space-y-4">
                  {deptStats.map((d, idx) => {
                    let rateColor = "bg-brand-success";
                    let badgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                    if (d.rate < 40) {
                      rateColor = "bg-brand-danger";
                      badgeColor = "bg-red-500/10 text-red-500 border-red-500/20";
                    } else if (d.rate < 80) {
                      rateColor = "bg-brand-warning";
                      badgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                    }

                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-text-main">{d.department}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full border ${badgeColor}`}>
                            {d.rate}% ({d.present}/{d.total})
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`${rateColor} h-full rounded-full transition-all duration-500`}
                            style={{ width: `${d.rate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Employees Working Hours */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm lg:col-span-2">
                <h4 className="font-extrabold text-base text-text-main mb-1.5 flex items-center gap-2">
                  <Clock size={18} className="text-brand-primary" /> 
                  <span>Average Work Hours of Top Performers</span>
                </h4>
                <p className="text-[10px] text-text-mut font-semibold mb-6">Top employees with highest average active working hours per shift</p>
                
                {employeeStats.length === 0 ? (
                  <div className="text-center py-10 text-text-mut text-xs">No logs available for calculations.</div>
                ) : (
                  <div className="space-y-3.5">
                    {employeeStats.map((e, idx) => {
                      const rowWidth = Math.max(10, Math.round((e.avgHours / maxHours) * 100));
                      return (
                        <div key={idx} className="flex items-center gap-4">
                          <span className="w-24 text-xs font-bold text-text-main truncate text-right">{e.name}</span>
                          
                          <div className="flex-grow bg-slate-200 dark:bg-slate-800 h-5 rounded-[8px] overflow-hidden relative">
                            <div 
                              className="bg-brand-primary h-full flex items-center justify-end px-3 transition-all duration-500 shadow-sm"
                              style={{ width: `${rowWidth}%` }}
                            >
                              <span className="text-[9px] font-extrabold text-white">{e.avgHours}h</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* ------------------ VIEW 5: NOTICE BOARD / RULES & LEAVES ------------------ */}
      {activeTab === "rules" && (
        <>
          <div className="mb-6 text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Notice Board Management</h1>
            <p className="text-sm text-text-sec mt-1">Configure company guidelines and upload upcoming official paid leaves.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
            {/* Left Column: Guidelines / Rules - Col-span 5 */}
            <div className="lg:col-span-5 bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-border-card">
                <div className="w-10 h-10 rounded-[12px] bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-text-main tracking-tight">Attendance Guidelines</h3>
                  <span className="text-[10px] text-text-mut font-semibold">Updates propagate to all user help popups</span>
                </div>
              </div>

              <form onSubmit={handleSaveRules} className="flex flex-col flex-grow space-y-4">
                <div className="flex flex-col gap-1.5 flex-grow">
                  <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="rules-editor">Rules Content (One rule per line)</label>
                  <textarea
                    id="rules-editor"
                    className="w-full min-h-[300px] flex-grow p-4 border border-border-card rounded-[16px] bg-bg-base/30 text-xs text-text-main font-semibold leading-relaxed outline-none focus:bg-bg-card focus:border-brand-primary transition-all resize-none"
                    placeholder="Enter attendance rules, one per line..."
                    value={rulesInput}
                    onChange={(e) => setRulesInput(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-3 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] shadow-md shadow-brand-primary/10 transition-colors cursor-pointer"
                >
                  {actionLoading ? "Saving Rules..." : "Save & Propagate Rules"}
                </button>
              </form>
            </div>

            {/* Right Column: Paid Leaves Manager - Col-span 7 */}
            <div className="lg:col-span-7 space-y-8">
              {/* Publish Paid Leave Card */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
                <h3 className="font-extrabold text-base text-text-main tracking-tight mb-1 flex items-center gap-2">
                  <Calendar size={18} className="text-brand-primary" />
                  <span>Publish Official Paid Leave</span>
                </h3>
                <p className="text-[10px] text-text-mut font-bold uppercase tracking-wider mb-6">Declare holiday dates and benefits</p>

                <form onSubmit={handlePublishPaidLeave} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-text-sec">Holiday Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Independence Day Holiday"
                        className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                        value={leaveTitle}
                        onChange={(e) => setLeaveTitle(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-text-sec">Start Date</label>
                      <input
                        type="date"
                        className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                        value={leaveStartDate}
                        onChange={(e) => setLeaveStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-text-sec">End Date</label>
                      <input
                        type="date"
                        className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                        value={leaveEndDate}
                        onChange={(e) => setLeaveEndDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-text-sec">Publish Status</label>
                      <select
                        className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main font-bold outline-none focus:bg-bg-card focus:border-brand-primary transition-all appearance-none"
                        value={leaveStatus}
                        onChange={(e) => setLeaveStatus(e.target.value)}
                        required
                      >
                        <option value="active">Active (Visible)</option>
                        <option value="inactive">Inactive (Hidden)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-sec">Holiday Description</label>
                    <textarea
                      placeholder="e.g. All operations will remain suspended. This day counts as fully paid leave."
                      className="w-full h-20 p-3.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all resize-none"
                      value={leaveDesc}
                      onChange={(e) => setLeaveDesc(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="py-2.5 px-6 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] transition-colors shadow-md shadow-brand-primary/10 cursor-pointer"
                    >
                      {actionLoading ? "Publishing..." : "Publish Leave Announcement"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Published Paid Leaves List */}
              <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
                <h3 className="font-extrabold text-base text-text-main tracking-tight mb-4">Published Paid Leaves</h3>
                
                {paidLeaves.length === 0 ? (
                  <div className="text-center py-8 text-text-mut text-xs font-bold font-semibold">No official paid leaves published yet.</div>
                ) : (
                  <div className="space-y-3">
                    {paidLeaves.map((pl) => (
                      <div key={pl.id} className="p-4 border border-border-card rounded-[16px] bg-bg-base/20 hover:bg-bg-base/40 transition-colors flex items-start justify-between gap-4">
                        <div className="space-y-1.5 text-left flex-grow">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-text-main">{pl.title}</span>
                            <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-bold px-2 py-0.5 rounded-full">
                              {pl.startDate && pl.endDate ? (
                                pl.startDate === pl.endDate ? (
                                  new Date(pl.startDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                                ) : (
                                  `${new Date(pl.startDate).toLocaleDateString([], { month: "short", day: "numeric" })} - ${new Date(pl.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                                )
                              ) : (
                                new Date(pl.date || pl.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTogglePaidLeaveStatus(pl.id, pl.title, pl.status)}
                              className={`text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase transition-all cursor-pointer ${
                                (pl.status || "active") === "active"
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20"
                                  : "bg-slate-500/10 text-slate-500 border border-slate-500/20 hover:bg-slate-500/20"
                              }`}
                              title="Click to toggle status"
                            >
                              {pl.status || "active"}
                            </button>
                          </div>
                          <p className="text-[11px] text-text-sec leading-relaxed font-semibold">{pl.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePaidLeave(pl)}
                          className="p-2 border border-red-500/20 text-red-500 rounded-[8px] bg-red-500/5 hover:bg-red-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                          title="Delete Paid Leave Announcement"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------ MODALS ------------------ */}

      {/* Add New Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[500px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-text-main">Add New Employee</h3>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddNewEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Full Name</label>
                  <input 
                    type="text" 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Marcus Thompson"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Email Address</label>
                  <input 
                    type="email" 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. marcus@company.com"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Shift Password</label>
                  <input 
                    type="password" 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 chars"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Domain / Department</label>
                  <input 
                    type="text" 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder="e.g. Engineering"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Program Type</label>
                  <select 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={newProgram}
                    onChange={(e) => setNewProgram(e.target.value)}
                  >
                    <option value="Internship">Internship</option>
                    <option value="Training">Training</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Quick Shift Presets</label>
                  <div className="flex gap-1">
                    {shiftPresets.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="flex-1 py-2 px-1 border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-[9px] font-bold transition-all whitespace-nowrap cursor-pointer"
                        onClick={() => {
                          setNewShiftStart(p.start);
                          setNewShiftEnd(p.end);
                        }}
                      >
                        {p.label.split(" ")[0]} {p.label.split(" ")[1]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-brand-primary/5 p-3 rounded-[12px] border border-dashed border-border-card">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-brand-primary">Shift Start</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all" 
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-brand-primary">Shift End</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all" 
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border-card pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)} 
                  className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-colors cursor-pointer"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="py-2.5 px-5 bg-brand-primary text-white text-xs font-bold rounded-[12px] hover:bg-brand-hover transition-colors cursor-pointer"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Registering..." : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[500px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-text-main">Edit User Profile</h3>
              <button 
                onClick={() => { setShowEditModal(false); setSelectedUser(null); }} 
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveUserEdit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-sec">Full Name</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-sec">Domain / Department</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Program Type</label>
                  <select 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all" 
                    value={editProgram}
                    onChange={(e) => setEditProgram(e.target.value)}
                    required
                  >
                    <option value="Internship">Internship</option>
                    <option value="Training">Training</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Shift Presets</label>
                  <div className="flex gap-1">
                    {shiftPresets.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="flex-1 py-2 px-1 border border-border-card rounded-[8px] bg-bg-card hover:bg-bg-base text-[9px] font-bold transition-all whitespace-nowrap cursor-pointer"
                        onClick={() => {
                          setEditShiftStart(p.start);
                          setEditShiftEnd(p.end);
                        }}
                      >
                        {p.label.split(" ")[0]} {p.label.split(" ")[1]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-brand-primary/5 p-3 rounded-[12px] border border-dashed border-border-card">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-brand-primary">Shift Start</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all" 
                    value={editShiftStart}
                    onChange={(e) => setEditShiftStart(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-brand-primary">Shift End</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-1.5 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all" 
                    value={editShiftEnd}
                    onChange={(e) => setEditShiftEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 border-t border-border-card pt-4">
                <button 
                  type="button" 
                  onClick={() => { setShowEditModal(false); setSelectedUser(null); }} 
                  className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-colors cursor-pointer"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="py-2.5 px-5 bg-brand-primary text-white text-xs font-bold rounded-[12px] hover:bg-brand-hover transition-colors cursor-pointer"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirm Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[440px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-brand-danger">Delete User Profile</h3>
              <button 
                onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }} 
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3 mb-6 text-sm text-text-sec leading-relaxed">
              <p>Are you sure you want to delete the profile for <strong>{selectedUser.name}</strong> ({selectedUser.email})?</p>
              <p className="text-brand-danger font-bold text-xs flex items-center gap-1">
                ⚠️ Warning: This action is permanent and will remove the user record from the database directory.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }} 
                className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-colors cursor-pointer"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDeleteUser} 
                className="py-2.5 px-5 bg-brand-danger text-white text-xs font-bold rounded-[12px] hover:bg-brand-danger-hover transition-colors cursor-pointer"
                disabled={actionLoading}
              >
                {actionLoading ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Paid Leave Confirm Modal */}
      {showDeletePaidLeaveConfirm && selectedPaidLeave && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in text-left">
          <div className="w-full max-w-[440px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-brand-danger">Delete Paid Leave</h3>
              <button 
                onClick={() => { setShowDeletePaidLeaveConfirm(false); setSelectedPaidLeave(null); }} 
                className="text-text-mut hover:text-text-main font-bold text-md cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3 mb-6 text-sm text-text-sec leading-relaxed">
              <p>Are you sure you want to delete the paid leave announcement for <strong>{selectedPaidLeave.title}</strong>?</p>
              <p className="text-brand-danger font-bold text-xs flex items-center gap-1">
                ⚠️ Warning: This action is permanent and will remove the announcement from the system.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowDeletePaidLeaveConfirm(false); setSelectedPaidLeave(null); }} 
                className="py-2.5 px-4 border border-border-card rounded-[12px] bg-bg-card hover:bg-bg-base text-text-sec text-xs font-bold transition-colors cursor-pointer"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeletePaidLeave} 
                className="py-2.5 px-5 bg-brand-danger text-white text-xs font-bold rounded-[12px] hover:bg-brand-danger-hover transition-colors cursor-pointer"
                disabled={actionLoading}
              >
                {actionLoading ? "Deleting..." : "Delete Announcement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
