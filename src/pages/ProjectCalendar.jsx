import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useModal } from "../context/ModalContext";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { 
  db, 
  getDbType, 
  subscribeToTaskReports,
  subscribeToDailyReports,
  updateDailyReport
} from "../firebase";
import { 
  ChevronLeft, 
  ChevronRight, 
  Lock, 
  User, 
  Briefcase, 
  Clock, 
  FileText, 
  CheckCircle, 
  X, 
  MessageSquare,
  ClipboardList,
  AlertCircle
} from "lucide-react";

export default function ProjectCalendar() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { showConfirm } = useModal();

  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyReports, setDailyReports] = useState([]);
  const [allTaskReports, setAllTaskReports] = useState({});

  // Calendar navigation states
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Filters
  const [filterProject, setFilterProject] = useState("All");
  const [filterEmployee, setFilterEmployee] = useState("All");

  // Remarks Modal State
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [selectedReportForRemarks, setSelectedReportForRemarks] = useState(null);
  const [remarksText, setRemarksText] = useState("");
  const [remarksStatus, setRemarksStatus] = useState("Completed");

  const isAdmin = currentUser?.role === "admin";
  const pmProjects = currentUser?.projects?.length ? currentUser.projects : (currentUser?.project ? [currentUser.project] : []);

  // Fetch Team Members (matching PM projects, or all users for admin)
  useEffect(() => {
    if (!currentUser) return;

    if (getDbType() === "firebase") {
      const qRef = query(collection(db, "users"), where("companyId", "==", currentUser.companyId));
      const unsubscribe = onSnapshot(qRef, (snapshot) => {
        const users = snapshot.docs.map(d => ({ ...d.data(), uid: d.id }));
        if (isAdmin) {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          setTeamMembers(users.filter(u => {
            const uProjects = u.projects?.length ? u.projects : (u.project ? [u.project] : []);
            return uProjects.some(p => pmProjects.includes(p));
          }));
        }
        setLoading(false);
      }, (err) => {
        console.error(err);
        setLoading(false);
      });
      return unsubscribe;
    } else {
      const handler = () => {
        let users = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
        if (currentUser.companyId) {
          users = users.filter(u => u.companyId === currentUser.companyId);
        }
        if (isAdmin) {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          setTeamMembers(users.filter(u => {
            const uProjects = u.projects?.length ? u.projects : (u.project ? [u.project] : []);
            return uProjects.some(p => pmProjects.includes(p));
          }));
        }
        setLoading(false);
      };
      handler();
      window.addEventListener("local-auth-updated", handler);
      return () => window.removeEventListener("local-auth-updated", handler);
    }
  }, [currentUser]);

  // Subscribe to task reports for all team members
  useEffect(() => {
    if (teamMembers.length > 0) {
      const allTaskIds = teamMembers.flatMap(m => (m.tasks || []).map(t => t.id));
      const unsubs = [];
      
      allTaskIds.forEach(taskId => {
        const unsub = subscribeToTaskReports(taskId, (reports) => {
          setAllTaskReports(prev => ({ ...prev, [taskId]: reports }));
        });
        unsubs.push(unsub);
      });
      
      return () => {
        unsubs.forEach(fn => fn());
      };
    }
  }, [teamMembers]);

  // Subscribe to daily work logs
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToDailyReports(currentUser.companyId, (data) => {
      setDailyReports(data || []);
    });
    return unsubscribe;
  }, [currentUser]);

  // Handle month toggle
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Helper: Get unique project names that PM manages or is visible
  const managedProjects = (() => {
    if (isAdmin) {
      const allProjs = new Set();
      teamMembers.forEach(m => {
        const projs = m.projects?.length ? m.projects : (m.project ? [m.project] : []);
        projs.forEach(p => allProjs.add(p));
      });
      return Array.from(allProjs);
    } else {
      return pmProjects;
    }
  })();

  // Filter daily reports and tasks
  const filteredDailyReports = dailyReports.filter(r => {
    // Filter by project
    if (filterProject !== "All") {
      if (r.projectName !== filterProject) return false;
    } else {
      // If PM, restrict to PM projects
      if (!isAdmin && !pmProjects.includes(r.projectName)) return false;
    }
    // Filter by employee
    if (filterEmployee !== "All" && r.userId !== filterEmployee) return false;

    return true;
  });

  // Get active tasks and their reports for all team members
  const activeTasksList = [];
  teamMembers.forEach(m => {
    if (filterEmployee !== "All" && m.uid !== filterEmployee) return;

    const uProjects = m.projects?.length ? m.projects : (m.project ? [m.project] : []);
    const matchingProjects = isAdmin ? uProjects : uProjects.filter(p => pmProjects.includes(p));
    
    if (filterProject !== "All" && !matchingProjects.includes(filterProject)) return;
    if (!isAdmin && matchingProjects.length === 0) return;

    (m.tasks || []).forEach(t => {
      if (filterProject !== "All" && t.project !== filterProject) return;
      if (!isAdmin && !pmProjects.includes(t.project)) return;

      const reports = allTaskReports[t.id] || [];
      activeTasksList.push({
        ...t,
        userId: m.uid,
        userName: m.name,
        reports
      });
    });
  });

  // Build Calendar grid
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // Day of week (0-6)
  
  const monthDays = [];
  // Padding cells for previous month days
  for (let i = 0; i < firstDayIndex; i++) {
    monthDays.push(null);
  }
  // Days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    monthDays.push(i);
  }
  // Padding cells to make weeks complete
  while (monthDays.length % 7 !== 0) {
    monthDays.push(null);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Helper to get activity state for a date
  const getDateActivity = (day) => {
    if (!day) return null;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const logs = filteredDailyReports.filter(r => r.date === dateStr);
    const tasksAssigned = activeTasksList.filter(t => t.assignedAt?.startsWith(dateStr));
    const taskReports = activeTasksList.flatMap(t => t.reports.filter(rep => rep.createdAt?.startsWith(dateStr)));

    return {
      dateStr,
      hasLogs: logs.length > 0,
      hasTasks: tasksAssigned.length > 0 || taskReports.length > 0,
      logs,
      tasks: tasksAssigned,
      taskReports
    };
  };

  // Activity for currently selected date
  const selectedActivity = (() => {
    if (!selectedDate) return { logs: [], tasks: [], taskReports: [] };
    const logs = filteredDailyReports.filter(r => r.date === selectedDate);
    const tasksAssigned = activeTasksList.filter(t => t.assignedAt?.startsWith(selectedDate));
    const taskReports = activeTasksList.flatMap(t => t.reports.filter(rep => rep.createdAt?.startsWith(selectedDate)));

    return {
      logs,
      tasks: tasksAssigned,
      taskReports
    };
  })();

  const handleOpenRemarks = (report) => {
    setSelectedReportForRemarks(report);
    setRemarksText(report.supervisorRemarks || "");
    setRemarksStatus(report.status || "Completed");
    setShowRemarksModal(true);
  };

  const handleSaveRemarks = async (e) => {
    e.preventDefault();
    if (!selectedReportForRemarks) return;

    try {
      await updateDailyReport(selectedReportForRemarks.id, {
        supervisorRemarks: remarksText,
        status: remarksStatus
      });
      showToast("Supervisor remarks updated successfully!", "success");
      setShowRemarksModal(false);
      setSelectedReportForRemarks(null);
    } catch (err) {
      console.error(err);
      showToast("Failed to update remarks: " + err.message, "error");
    }
  };

  return (
    <div className="animate-fade-in p-6 space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border-card pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-main flex items-center gap-3">
            <ClipboardList className="text-brand-primary shrink-0" size={32} />
            Project Calendar
          </h1>
          <p className="text-text-mut font-medium mt-1 text-sm">
            Track daily logs, tasks, and reports across your managed projects.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          {/* Project Filter */}
          <div className="flex flex-col gap-1 w-[180px]">
            <label className="text-[10px] font-bold text-text-mut uppercase">Filter Project</label>
            <select
              className="w-full bg-bg-card border border-border-card rounded-[12px] px-3.5 py-2.5 text-xs font-bold text-text-main focus:border-brand-primary outline-none transition-all cursor-pointer"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="All">All Projects</option>
              {managedProjects.map((p, idx) => (
                <option key={idx} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Employee Filter */}
          <div className="flex flex-col gap-1 w-[180px]">
            <label className="text-[10px] font-bold text-text-mut uppercase">Filter Team Member</label>
            <select
              className="w-full bg-bg-card border border-border-card rounded-[12px] px-3.5 py-2.5 text-xs font-bold text-text-main focus:border-brand-primary outline-none transition-all cursor-pointer"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
            >
              <option value="All">All Team Members</option>
              {teamMembers.map(m => (
                <option key={m.uid} value={m.uid}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-text-mut font-bold">Loading team reports...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column - Monthly Calendar Grid (Span 7) */}
          <div className="lg:col-span-7 bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary to-purple-500"></div>
            
            {/* Calendar Controls */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-text-main">
                {monthNames[currentMonth]} {currentYear}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={prevMonth}
                  className="p-2 border border-border-card rounded-[10px] bg-bg-base hover:bg-border-card hover:text-brand-primary text-text-sec transition-all cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => {
                    const today = new Date();
                    setCurrentMonth(today.getMonth());
                    setCurrentYear(today.getFullYear());
                    setSelectedDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
                  }}
                  className="px-3.5 py-1.5 border border-border-card rounded-[10px] bg-bg-base hover:bg-border-card hover:text-brand-primary text-xs font-bold text-text-sec transition-all cursor-pointer"
                >
                  Today
                </button>
                <button 
                  onClick={nextMonth}
                  className="p-2 border border-border-card rounded-[10px] bg-bg-base hover:bg-border-card hover:text-brand-primary text-text-sec transition-all cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-extrabold text-text-mut uppercase tracking-wider">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 gap-2">
              {monthDays.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square bg-bg-base/20 rounded-[14px] border border-dashed border-border-card/30"></div>;
                }

                const activity = getDateActivity(day);
                const isSelected = selectedDate === activity?.dateStr;
                const isToday = (() => {
                  const today = new Date();
                  return today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
                })();

                return (
                  <button
                    key={`day-${day}`}
                    onClick={() => setSelectedDate(activity?.dateStr)}
                    className={`aspect-square rounded-[14px] p-2 flex flex-col justify-between items-center transition-all relative border outline-none cursor-pointer ${
                      isSelected
                        ? "bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-[1.03]"
                        : isToday
                        ? "bg-brand-primary/10 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/20"
                        : "bg-bg-base/50 border-border-card text-text-main hover:bg-border-card hover:border-brand-primary/30"
                    }`}
                  >
                    {/* Day Number */}
                    <span className="text-xs font-bold self-start">{day}</span>

                    {/* Indicator dots */}
                    <div className="flex gap-1 justify-center mt-1">
                      {activity?.hasLogs && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} title="Submitted Logs"></span>
                      )}
                      {activity?.hasTasks && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} title="Tasks / Reports"></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column - Work Details Side Panel (Span 5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Selected Date Header Card */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl relative overflow-hidden">
              <h3 className="font-extrabold text-sm text-text-mut uppercase tracking-wider mb-1">Activity details</h3>
              <span className="text-xl font-black text-text-main">
                {selectedDate ? new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "No Date Selected"}
              </span>
            </div>

            {/* Daily logs section */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl space-y-4">
              <h4 className="font-extrabold text-base text-text-main flex items-center gap-2 border-b border-border-card pb-3">
                <FileText size={18} className="text-brand-primary" />
                Work logs ({selectedActivity.logs.length})
              </h4>

              {selectedActivity.logs.length === 0 ? (
                <div className="p-8 text-center text-text-mut border border-dashed border-border-card rounded-[16px] bg-bg-base/20">
                  <AlertCircle size={32} className="mx-auto mb-3 text-text-mut/50" />
                  <p className="text-xs font-bold">No daily work logs submitted for this date.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                  {selectedActivity.logs.map((log) => (
                    <div key={log.id} className="p-4 bg-bg-base/40 border border-border-card rounded-[16px] space-y-3 relative group">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary font-black flex items-center justify-center text-xs">
                            {log.userName ? log.userName.charAt(0).toUpperCase() : <User size={14} />}
                          </div>
                          <div>
                            <h5 className="text-xs font-black text-text-main">{log.userName}</h5>
                            <span className="text-[10px] text-text-mut font-bold">{log.projectName}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          log.status === "Completed" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        }`}>
                          {log.status}
                        </span>
                      </div>

                      <div className="space-y-2 border-t border-border-card/50 pt-2.5">
                        <div>
                          <span className="text-[9px] font-black text-text-mut uppercase block">Tasks Completed</span>
                          <p className="text-xs text-text-sec leading-normal mt-0.5 whitespace-pre-wrap">{log.tasksCompleted}</p>
                        </div>

                        {log.issuesFaced && (
                          <div>
                            <span className="text-[9px] font-black text-red-500 uppercase block">Issues Faced</span>
                            <p className="text-xs text-red-500/80 leading-normal mt-0.5 whitespace-pre-wrap">{log.issuesFaced}</p>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-[10px] text-text-mut font-bold bg-bg-base/30 p-2 rounded-[8px] border border-border-card/30">
                          <span className="flex items-center gap-1"><Clock size={12} /> Logged: {log.hours}h</span>
                        </div>

                        {log.supervisorRemarks && (
                          <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-[10px] p-3 text-left">
                            <span className="text-[9px] font-black text-brand-primary uppercase block">PM Remarks</span>
                            <p className="text-xs text-text-sec mt-1 italic">"{log.supervisorRemarks}"</p>
                          </div>
                        )}

                        <button 
                          onClick={() => handleOpenRemarks(log)}
                          className="w-full py-2 bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white text-[10px] font-bold rounded-[10px] transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                        >
                          <MessageSquare size={12} />
                          {log.supervisorRemarks ? "Edit Remarks" : "Add Supervisor Remarks"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks and Task Reports Section */}
            <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl space-y-4">
              <h4 className="font-extrabold text-base text-text-main flex items-center gap-2 border-b border-border-card pb-3">
                <CheckCircle size={18} className="text-brand-primary" />
                Tasks & reports ({selectedActivity.tasks.length + selectedActivity.taskReports.length})
              </h4>

              {selectedActivity.tasks.length === 0 && selectedActivity.taskReports.length === 0 ? (
                <div className="p-8 text-center text-text-mut border border-dashed border-border-card rounded-[16px] bg-bg-base/20">
                  <AlertCircle size={32} className="mx-auto mb-3 text-text-mut/50" />
                  <p className="text-xs font-bold">No active task logs or assignments on this date.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                  
                  {/* Tasks Assigned */}
                  {selectedActivity.tasks.map((task) => (
                    <div key={task.id} className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-[16px] space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase text-blue-500 px-2 py-0.5 rounded-full bg-blue-500/10 inline-block mb-1">New Assignment</span>
                          <h5 className="text-xs font-black text-text-main">{task.title}</h5>
                          <span className="text-[10px] text-text-mut font-bold">Assigned to: {task.userName} • Project: {task.project}</span>
                        </div>
                        <span className="text-xs font-bold text-blue-500 whitespace-nowrap">{task.duration}h</span>
                      </div>
                    </div>
                  ))}

                  {/* Task Reports submitted */}
                  {selectedActivity.taskReports.map((rep) => {
                    const task = activeTasksList.find(t => t.id === rep.taskId);
                    return (
                      <div key={rep.id} className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-[16px] space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-extrabold uppercase text-purple-500 px-2 py-0.5 rounded-full bg-purple-500/10 inline-block mb-1">Task Progress Report</span>
                            <h5 className="text-xs font-black text-text-main">{task?.title || "Unknown Task"}</h5>
                            <span className="text-[10px] text-text-mut font-bold">Logged by: {teamMembers.find(m => m.uid === rep.employeeId)?.name}</span>
                          </div>
                          <span className="text-[9px] text-text-mut font-bold">{new Date(rep.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-xs text-text-sec italic bg-bg-base/30 p-2.5 rounded-[10px] border border-border-card/30 mt-1">
                          "{rep.reportText}"
                        </p>
                      </div>
                    );
                  })}

                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* Supervisor Remarks Modal */}
      {showRemarksModal && selectedReportForRemarks && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fade-in">
          <div className="bg-bg-card border border-border-card rounded-[24px] p-6 w-full max-w-md shadow-2xl relative animate-scale-up">
            <button 
              onClick={() => { setShowRemarksModal(false); setSelectedReportForRemarks(null); }}
              className="absolute top-4 right-4 text-text-mut hover:text-text-main transition-colors bg-bg-base hover:bg-border-card p-1.5 rounded-full"
            >
              <X size={16} />
            </button>
            <h3 className="text-lg font-black text-text-main mb-2">Supervisor Remarks</h3>
            <p className="text-xs text-text-mut font-semibold mb-4">
              Providing remarks for <strong className="text-brand-primary">{selectedReportForRemarks.userName}</strong> on {selectedReportForRemarks.date}.
            </p>

            <form onSubmit={handleSaveRemarks} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec">Status</label>
                <select
                  className="w-full bg-bg-base border border-border-card rounded-[12px] px-3.5 py-2.5 text-xs font-bold text-text-main focus:border-brand-primary outline-none transition-all cursor-pointer"
                  value={remarksStatus}
                  onChange={(e) => setRemarksStatus(e.target.value)}
                >
                  <option value="Completed">Completed / Approved</option>
                  <option value="Working">Working / Needs Revisions</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec">Remarks</label>
                <textarea
                  required
                  rows={4}
                  value={remarksText}
                  onChange={(e) => setRemarksText(e.target.value)}
                  placeholder="Review feedback, standard comments, etc..."
                  className="w-full bg-bg-base border border-border-card rounded-[12px] px-3.5 py-2.5 text-xs text-text-main placeholder-text-mut focus:border-brand-primary outline-none transition-all resize-none font-bold"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowRemarksModal(false); setSelectedReportForRemarks(null); }}
                  className="flex-1 py-2.5 font-bold text-text-sec bg-bg-base hover:bg-border-card rounded-full text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 font-bold text-white bg-brand-primary hover:bg-brand-hover rounded-full text-xs transition-colors shadow-md shadow-brand-primary/10"
                >
                  Save Remarks
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
