import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { db, getDbType, createNotification, addTaskReport, subscribeToTaskReports, startTaskTimer, stopTaskTimer } from "../firebase";
import { CheckCircle, Clock, Send, MessageSquare, Play, X, FileText, Download, Square, Activity } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

export default function TaskManagement() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAllReportsModal, setShowAllReportsModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [reportText, setReportText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // For storing fetched reports per task ID
  const [taskReports, setTaskReports] = useState({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    if (getDbType() === "firebase") {
      const unsubscribe = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          setTasks(docSnap.data().tasks || []);
        }
        setLoading(false);
      });
      return unsubscribe;
    } else {
      const handler = () => {
        const users = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
        const me = users.find(u => u.uid === currentUser.uid);
        if (me) setTasks(me.tasks || []);
        setLoading(false);
      };
      handler();
      window.addEventListener("local-auth-updated", handler);
      return () => window.removeEventListener("local-auth-updated", handler);
    }
  }, [currentUser]);

  // Subscribe to reports for all tasks
  useEffect(() => {
    if (!tasks.length) return;
    
    const unsubs = [];
    tasks.forEach(t => {
      const unsub = subscribeToTaskReports(t.id, (reports) => {
        setTaskReports(prev => ({ ...prev, [t.id]: reports }));
      });
      unsubs.push(unsub);
    });
    
    return () => {
      unsubs.forEach(fn => fn());
    };
  }, [tasks.length]);

  const handleMarkComplete = async (taskIdx, isComplete) => {
    let updatedTasks = [...tasks];
    updatedTasks[taskIdx].completed = isComplete;

    try {
      if (getDbType() === "firebase") {
        await updateDoc(doc(db, "users", currentUser.uid), { tasks: updatedTasks });
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === currentUser.uid);
        if (idx !== -1) {
          users[idx].tasks = updatedTasks;
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      showToast(isComplete ? "Task marked as completed!" : "Task marked as incomplete.", "success");
      
      // Notify PM if marked complete
      if (isComplete && updatedTasks[taskIdx].assignedBy) {
        await createNotification(
          updatedTasks[taskIdx].assignedBy,
          "Task Completed",
          `${currentUser.name} completed the task: "${updatedTasks[taskIdx].title}".`,
          "success",
          "/project-management"
        );
      }
    } catch (err) {
      showToast("Failed to update task", "error");
    }
  };

  const handleOpenReportModal = (task) => {
    setSelectedTask(task);
    setReportText("");
    setShowReportModal(true);
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportText.trim()) return showToast("Report text is empty", "warning");

    setSubmitting(true);
    try {
      await addTaskReport(selectedTask.id, currentUser.uid, selectedTask.assignedBy, reportText);
      
      if (selectedTask.assignedBy) {
        await createNotification(
          selectedTask.assignedBy,
          "New Task Update",
          `${currentUser.name} submitted an hourly update for "${selectedTask.title}".`,
          "info",
          "/project-management"
        );
      }
      
      showToast("Hourly report submitted successfully!", "success");
      setShowReportModal(false);
      setSelectedTask(null);
      setReportText("");
    } catch (err) {
      showToast("Failed to submit report", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.text("My Task Reports", 14, 15);
    
    const tableData = [];
    tasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push([t.title, status, `${t.duration || 0}h`]);
      
      const reports = taskReports[t.id] || [];
      reports.forEach(r => {
        tableData.push(["", `Report: ${r.reportText}`, new Date(r.timestamp).toLocaleDateString()]);
      });
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    doc.autoTable({
      head: [["Task Details", "Status", "Duration/Date"]],
      body: tableData,
      startY: 20,
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 100 } }
    });
    
    doc.save(`My_Reports_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadExcel = () => {
    const tableData = [];
    tasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push({
        "Task Title": t.title,
        "Status": status,
        "Est. Hours": t.duration || 0,
        "Report Detail": "",
        "Report Date": ""
      });
      
      const reports = taskReports[t.id] || [];
      reports.forEach(r => {
        tableData.push({
          "Task Title": "",
          "Status": "",
          "Est. Hours": "",
          "Report Detail": r.reportText,
          "Report Date": new Date(r.timestamp).toLocaleString()
        });
      });
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My Reports");
    XLSX.writeFile(wb, `My_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadSingleTaskPDF = (task) => {
    const doc = new jsPDF();
    doc.text(`Task Report: ${task.title}`, 14, 15);
    
    const tableData = [];
    const status = task.completed ? "Done" : "Active";
    tableData.push([task.title, status, `${task.duration || 0}h`]);
    
    const reports = taskReports[task.id] || [];
    reports.forEach(r => {
      tableData.push(["", `Report: ${r.reportText}`, new Date(r.timestamp).toLocaleDateString()]);
    });

    if (reports.length === 0) {
      showToast("No reports to export for this task", "warning");
      return;
    }

    doc.autoTable({
      head: [["Task Details", "Status", "Duration/Date"]],
      body: tableData,
      startY: 20,
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 100 } }
    });
    
    doc.save(`Task_Report_${task.title.replace(/\s+/g, '_').substring(0,10)}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-main tracking-tight">Task Management</h1>
          <p className="text-sm text-text-mut font-medium mt-1">
            Your current projects: <span className="font-bold text-brand-primary">{(currentUser.projects && currentUser.projects.length > 0) ? currentUser.projects.join(', ') : (currentUser.project || "Unassigned")}</span>
          </p>
        </div>
        <button 
          onClick={() => setShowAllReportsModal(true)}
          className="bg-bg-base hover:bg-bg-card border border-border-card text-text-main text-xs font-bold py-2.5 px-4 rounded-[12px] flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
        >
          <FileText size={16} className="text-brand-primary" />
          <span>My Reports</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10"><span className="text-text-mut">Loading tasks...</span></div>
      ) : tasks.length === 0 ? (
        <div className="bg-bg-card border border-border-card rounded-[20px] p-10 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle size={32} className="text-brand-primary" />
          </div>
          <h3 className="text-lg font-bold text-text-main">No Tasks Assigned</h3>
          <p className="text-xs text-text-sec max-w-sm mt-2">
            You currently have no tasks assigned to you for this project. Check back later or contact your Project Manager.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Tasks Column */}
          <div className="space-y-4">
            <h2 className="font-extrabold text-sm text-text-main uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-warning animate-pulse"></span>
              Active Tasks ({activeTasks.length})
            </h2>
            
            {activeTasks.length === 0 ? (
              <div className="p-6 border border-dashed border-border-card rounded-[16px] text-center text-text-mut text-xs">
                No active tasks.
              </div>
            ) : (
              activeTasks.map((task) => {
                const taskIdx = tasks.findIndex(t => t.id === task.id);
                return (
                  <div key={task.id} className="bg-bg-card border border-border-card rounded-[16px] p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary/60 group-hover:bg-brand-primary transition-colors"></div>
                    
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-text-main pr-4">{task.title}</h3>
                      <button 
                        onClick={() => handleMarkComplete(taskIdx, true)}
                        className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-border-card flex items-center justify-center text-transparent hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all cursor-pointer"
                        title="Mark as completed"
                      >
                        <CheckCircle size={14} />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-4 text-[10px] font-semibold text-text-sec mb-4">
                      <div className="flex items-center gap-1 bg-bg-base px-2 py-1 rounded-[6px]">
                        <Clock size={12} className="text-brand-primary" />
                        <span>Est: {task.duration || 0}h</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare size={12} />
                        <span>{taskReports[task.id]?.length || 0} Updates</span>
                      </div>
                      {task.timerStartedAt && (
                        <div className="flex items-center gap-1 bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-[6px] animate-pulse">
                          <Activity size={12} />
                          <span>
                            {(() => {
                              const elapsed = Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000);
                              const h = Math.floor(elapsed / 3600);
                              const m = Math.floor((elapsed % 3600) / 60);
                              const s = elapsed % 60;
                              return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-4 border-t border-border-card/50 flex justify-between items-center">
                      <div className="flex gap-2">
                        {!task.timerStartedAt ? (
                          <button 
                            onClick={() => startTaskTimer(currentUser.uid, task.id)}
                            className="py-1.5 px-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-[8px] text-[10px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Play size={12} />
                            <span>Start</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => stopTaskTimer(currentUser.uid, task.id, task.assignedBy)}
                            className="py-1.5 px-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-[8px] text-[10px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Square size={12} fill="currentColor" />
                            <span>Stop Timer</span>
                          </button>
                        )}
                      </div>
                      <button 
                        onClick={() => handleOpenReportModal(task)}
                        className="py-1.5 px-3 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-[8px] text-[10px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Send size={12} />
                        <span>Manual Update</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Completed Tasks Column */}
          <div className="space-y-4">
            <h2 className="font-extrabold text-sm text-text-main uppercase tracking-wider flex items-center gap-2 opacity-80">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Completed Tasks ({completedTasks.length})
            </h2>
            
            {completedTasks.length === 0 ? (
              <div className="p-6 border border-dashed border-border-card rounded-[16px] text-center text-text-mut text-xs">
                No completed tasks yet.
              </div>
            ) : (
              completedTasks.map((task) => {
                const taskIdx = tasks.findIndex(t => t.id === task.id);
                return (
                  <div key={task.id} className="bg-bg-base/30 border border-border-card rounded-[16px] p-4 relative overflow-hidden opacity-70 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <h3 className="font-bold text-text-sec line-through">{task.title}</h3>
                          <p className="text-[10px] text-text-mut mt-1">Est: {task.duration || 0}h</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleMarkComplete(taskIdx, false)}
                        className="text-[10px] font-bold text-brand-primary hover:underline cursor-pointer"
                      >
                        Re-open
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Hourly Report Modal */}
      {showReportModal && selectedTask && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[500px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4 flex-shrink-0">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <Play size={18} className="text-brand-primary" fill="currentColor" />
                Hourly Update
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDownloadSingleTaskPDF(selectedTask)}
                  className="py-1.5 px-3 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-[8px] text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Download Task Report"
                >
                  <Download size={13} />
                  <span>Download</span>
                </button>
                <button onClick={() => setShowReportModal(false)} className="text-text-mut hover:text-text-main font-bold cursor-pointer"><X size={18} /></button>
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-4 pb-4">
              <div className="bg-bg-base/50 p-3 rounded-[12px] border border-border-card">
                <p className="text-[10px] text-text-sec uppercase font-extrabold tracking-wider mb-1">Task</p>
                <p className="text-sm font-bold text-text-main">{selectedTask.title}</p>
              </div>

              {/* Previous Reports History */}
              {taskReports[selectedTask.id] && taskReports[selectedTask.id].length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-[10px] text-text-sec uppercase font-extrabold tracking-wider">Previous Updates</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar border border-border-card rounded-[12px] p-2 bg-bg-base/20">
                    {taskReports[selectedTask.id].map(r => (
                      <div key={r.id} className="bg-bg-card p-2 rounded-[8px] border border-border-card/50">
                        <p className="text-xs text-text-main">{r.reportText}</p>
                        <p className="text-[9px] text-text-mut mt-1 text-right">
                          {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitReport} className="pt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-sec uppercase tracking-wider">New Update</label>
                  <textarea 
                    className="w-full px-3 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all min-h-[100px] resize-none"
                    placeholder="E.g., Designed the hero section and started on the footer..."
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    required
                  ></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-2">
                  <button type="button" onClick={() => setShowReportModal(false)} className="py-2.5 px-4 border border-border-card rounded-[10px] text-xs font-bold text-text-sec hover:bg-bg-base cursor-pointer">Cancel</button>
                  <button type="submit" disabled={submitting || !reportText.trim()} className="py-2.5 px-5 bg-brand-primary hover:bg-brand-hover text-white rounded-[10px] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2">
                    <Send size={14} />
                    <span>{submitting ? "Sending..." : "Submit Report"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* All Reports Modal */}
      {showAllReportsModal && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[800px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-border-card pb-4 gap-4 flex-shrink-0">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <FileText size={18} className="text-brand-primary" />
                My Reports
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDownloadPDF}
                  className="py-1.5 px-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-[8px] text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>PDF</span>
                </button>
                <button 
                  onClick={handleDownloadExcel}
                  className="py-1.5 px-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 rounded-[8px] text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Excel</span>
                </button>
                <button onClick={() => setShowAllReportsModal(false)} className="p-1.5 text-text-mut hover:text-text-main font-bold cursor-pointer bg-bg-base rounded-[8px]"><X size={16} /></button>
              </div>
            </div>
            
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-grow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                    <th className="p-3 font-bold">Task Title</th>
                    <th className="p-3 font-bold">Status</th>
                    <th className="p-3 font-bold text-right">Est. Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-xs text-text-mut">No tasks found.</td>
                    </tr>
                  ) : (
                    tasks.map((task, idx) => (
                      <React.Fragment key={task.id || idx}>
                        <tr className="border-b border-border-card/50">
                          <td className="p-3 text-xs font-bold text-text-main">{task.title}</td>
                          <td className="p-3 text-xs">
                            {task.completed ? (
                              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-[6px]">Done</span>
                            ) : (
                              <span className="text-brand-primary font-bold bg-brand-primary/10 px-2 py-0.5 rounded-[6px]">Active</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-right font-medium text-text-sec">{task.duration}h</td>
                        </tr>
                        {taskReports[task.id] && taskReports[task.id].length > 0 && (
                          <tr className="border-b border-border-card">
                            <td colSpan="3" className="p-3 bg-bg-base/30">
                              <div className="pl-4 border-l-2 border-brand-primary/30 space-y-2">
                                {taskReports[task.id].map(r => (
                                  <div key={r.id} className="text-[10px]">
                                    <span className="font-bold text-text-sec">[{new Date(r.timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}]</span>
                                    <span className="text-text-main ml-2">{r.reportText}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
