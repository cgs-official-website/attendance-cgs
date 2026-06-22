import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { db, getDbType, createNotification, addTaskReport, subscribeToTaskReports, startTaskTimer, stopTaskTimer } from "../firebase";
import { CheckCircle, Clock, Send, MessageSquare, Play, X, FileText, Download, Square, Activity } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import logoImg from '../assets/zuna-logo.png';

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

  const calculateTimeSpent = (reports) => {
    if (!reports || reports.length === 0) return 0;
    let totalMinutes = 0;
    reports.forEach(r => {
      const matchH = r.reportText.match(/(\d+)\s*h/i);
      const matchM = r.reportText.match(/(\d+)\s*m/i);
      if (matchH) totalMinutes += parseInt(matchH[1], 10) * 60;
      if (matchM) totalMinutes += parseInt(matchM[1], 10);
    });
    return totalMinutes / 60; // returns hours
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF();
    
    const img = new Image();
    img.src = logoImg;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; 
    });

    let startY = 20;
    if (img.complete && img.naturalWidth > 0) {
      doc.addImage(img, 'PNG', 14, 10, 25, 25 * (img.naturalHeight / img.naturalWidth));
      startY = 40;
    }
    
    // Main Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(79, 70, 229);
    doc.text("My Task Reports", img.complete ? 45 : 14, 20);
    
    // Header Info
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    
    doc.setFont("helvetica", "bold");
    doc.text("Employee:", img.complete ? 45 : 14, 27);
    doc.setFont("helvetica", "normal");
    doc.text(` ${currentUser.name}`, img.complete ? 65 : 34, 27);

    doc.setFont("helvetica", "bold");
    doc.text("Downloaded:", img.complete ? 45 : 14, 32);
    doc.setFont("helvetica", "normal");
    doc.text(` ${new Date().toLocaleString()}`, img.complete ? 68 : 37, 32);

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 36, 196, 36);

    startY = img.complete ? 42 : 42;
    
    const tableData = [];
    tasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push([{ content: t.title, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } }, { content: status, styles: { fillColor: [243, 244, 246] } }, { content: `${t.duration || 0}h`, styles: { fillColor: [243, 244, 246] } }]);
      
      const reports = taskReports[t.id] || [];
      if (reports.length > 0) {
        reports.forEach(r => {
          tableData.push([
            { content: `Update: ${r.reportText}`, colSpan: 2, styles: { textColor: [60, 60, 60], cellPadding: { left: 14, top: 6, bottom: 6, right: 8 } } },
            { content: new Date(r.timestamp).toLocaleString(), styles: { fontSize: 8, textColor: [120, 120, 120], cellPadding: { left: 8, top: 6, bottom: 6, right: 8 } } }
          ]);
        });
      } else {
        tableData.push([
          { content: "No updates reported yet", colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150], cellPadding: { left: 14, top: 6, bottom: 6, right: 8 } } }
        ]);
      }
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    autoTable(doc, {
      head: [["Task Details", "Status", "Duration"]],
      body: tableData,
      startY: startY,
      styles: { fontSize: 9, font: "helvetica", cellPadding: 8, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10, halign: "left", cellPadding: 10 },
      columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'center' }, 2: { halign: 'right' } },
      theme: 'grid',
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    doc.save(`My_Reports_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadExcel = () => {
    const tableData = [];
    tasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push({
        "Employee": currentUser.name,
        "Task Title": t.title,
        "Status": status,
        "Est. Hours": t.duration || 0,
        "Update Detail": "--- Task Summary ---",
        "Update Timestamp": ""
      });
      
      const reports = taskReports[t.id] || [];
      if (reports.length > 0) {
        reports.forEach(r => {
          tableData.push({
            "Employee": "",
            "Task Title": "",
            "Status": "",
            "Est. Hours": "",
            "Update Detail": r.reportText,
            "Update Timestamp": new Date(r.timestamp).toLocaleString()
          });
        });
      } else {
        tableData.push({
          "Employee": "",
          "Task Title": "",
          "Status": "",
          "Est. Hours": "",
          "Update Detail": "No updates reported yet",
          "Update Timestamp": ""
        });
      }
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

  const handleDownloadSingleTaskPDF = async (task) => {
    const doc = new jsPDF();
    
    const img = new Image();
    img.src = logoImg;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; 
    });

    let startY = 20;
    if (img.complete && img.naturalWidth > 0) {
      doc.addImage(img, 'PNG', 14, 10, 25, 25 * (img.naturalHeight / img.naturalWidth));
      startY = 40;
    }
    
    // Main Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(79, 70, 229);
    doc.text(`Task Report: ${task.title}`, img.complete ? 45 : 14, 20);
    
    // Header Info
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    
    doc.setFont("helvetica", "bold");
    doc.text("Employee:", img.complete ? 45 : 14, 27);
    doc.setFont("helvetica", "normal");
    doc.text(` ${currentUser.name}`, img.complete ? 65 : 34, 27);

    doc.setFont("helvetica", "bold");
    doc.text("Downloaded:", img.complete ? 45 : 14, 32);
    doc.setFont("helvetica", "normal");
    doc.text(` ${new Date().toLocaleString()}`, img.complete ? 68 : 37, 32);

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 36, 196, 36);

    startY = img.complete ? 42 : 42;
    
    const tableData = [];
    const status = task.completed ? "Done" : "Active";
    tableData.push([{ content: task.title, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } }, { content: status, styles: { fillColor: [243, 244, 246] } }, { content: `${task.duration || 0}h`, styles: { fillColor: [243, 244, 246] } }]);
    
    const reports = taskReports[task.id] || [];
    if (reports.length > 0) {
      reports.forEach(r => {
        tableData.push([
          { content: `Update: ${r.reportText}`, colSpan: 2, styles: { textColor: [60, 60, 60], cellPadding: { left: 14, top: 6, bottom: 6, right: 8 } } },
          { content: new Date(r.timestamp).toLocaleString(), styles: { fontSize: 8, textColor: [120, 120, 120], cellPadding: { left: 8, top: 6, bottom: 6, right: 8 } } }
        ]);
      });
    } else {
      tableData.push([
        { content: "No updates reported yet", colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150], cellPadding: { left: 14, top: 6, bottom: 6, right: 8 } } }
      ]);
    }

    autoTable(doc, {
      head: [["Task Details", "Status", "Duration"]],
      body: tableData,
      startY: startY,
      styles: { fontSize: 9, font: "helvetica", cellPadding: 8, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10, halign: "left", cellPadding: 10 },
      columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'center' }, 2: { halign: 'right' } },
      theme: 'grid',
      alternateRowStyles: { fillColor: [248, 250, 252] }
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
                    
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-text-main pr-4">{task.title}</h3>
                      <button 
                        onClick={() => handleMarkComplete(taskIdx, true)}
                        className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-border-card flex items-center justify-center text-transparent hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all cursor-pointer"
                        title="Mark as completed"
                      >
                        <CheckCircle size={14} />
                      </button>
                    </div>
                    {task.project && (
                      <div className="mb-3">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-[4px] bg-brand-primary/10 text-brand-primary uppercase tracking-wider">{task.project}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4 text-[10px] font-semibold text-text-sec mb-4">
                      <div className="flex items-center gap-1 bg-bg-base px-2 py-1 rounded-[6px]">
                        <Clock size={12} className="text-brand-primary" />
                        <span>Est: {task.duration || 0}h | Rem: {parseFloat(Math.max(0, (task.duration || 0) - calculateTimeSpent(taskReports[task.id] || [])).toFixed(1))}h</span>
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
                              const elapsedThisSession = Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000);
                              const previousSeconds = Math.floor(calculateTimeSpent(taskReports[task.id] || []) * 3600);
                              const totalElapsed = elapsedThisSession + previousSeconds;
                              const h = Math.floor(totalElapsed / 3600);
                              const m = Math.floor((totalElapsed % 3600) / 60);
                              const s = totalElapsed % 60;
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
                          {task.project && <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] bg-bg-card border border-border-card text-text-mut uppercase">{task.project}</span>}
                          <p className="text-[10px] text-text-mut mt-1">
                            Est: {task.duration || 0}h | <span className="text-brand-primary font-bold">Rem: {parseFloat(Math.max(0, (task.duration || 0) - calculateTimeSpent(taskReports[task.id] || [])).toFixed(1))}h</span>
                          </p>
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
                    {taskReports[selectedTask.id].filter(r => !r.reportText.startsWith("Worked for") && !r.reportText.startsWith("Auto-stopped")).map(r => (
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

      {/* Tabular History directly on page */}
      <div className="mt-12 bg-bg-card border border-border-card rounded-[24px] p-5 sm:p-6 shadow-xl relative overflow-hidden flex flex-col">
            
            <div className="flex flex-col sm:flex-row items-center justify-between mb-5 border-b border-border-card pb-5 gap-3 flex-shrink-0 relative mt-2">
              <h3 className="font-bold text-xl text-text-main flex items-center gap-2 whitespace-nowrap">
                <FileText size={20} className="text-brand-primary" />
                My Task History
              </h3>
              <div className="flex items-center justify-end gap-3 w-full sm:w-auto flex-wrap">
                <button 
                  onClick={handleDownloadPDF}
                  className="py-2 px-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-[10px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download size={14} />
                  <span>Download PDF</span>
                </button>
                <button 
                  onClick={handleDownloadExcel}
                  className="py-2 px-4 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 rounded-[10px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download size={14} />
                  <span>Download Excel</span>
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                    <th className="p-3 font-bold w-1/4">Employee</th>
                    <th className="p-3 font-bold w-1/2">Task Title</th>
                    <th className="p-3 font-bold text-center w-auto">Status</th>
                    <th className="p-3 font-bold text-right whitespace-nowrap">Est. / Rem.</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-6 text-center text-xs text-text-mut">No tasks found.</td>
                    </tr>
                  ) : (
                    tasks.map((task, idx) => (
                      <React.Fragment key={task.id || idx}>
                        <tr className="border-b border-border-card/50">
                          <td className="p-3 text-xs font-bold text-text-main">{currentUser.name}</td>
                          <td className="p-3 text-xs text-text-main text-center">
                            <div>{task.title}</div>
                            {task.project && <div className="text-[9px] text-brand-primary font-bold mt-0.5">{task.project}</div>}
                          </td>
                          <td className="p-3 text-xs text-center">
                            {task.completed ? (
                              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-[6px]">Done</span>
                            ) : (
                              <span className="text-brand-primary font-bold bg-brand-primary/10 px-2 py-0.5 rounded-[6px]">Active</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-right">
                            <div className="font-bold text-text-main">{task.duration || 0}h</div>
                            <div className="text-[10px] text-brand-primary font-bold">
                              {parseFloat(Math.max(0, (task.duration || 0) - calculateTimeSpent(taskReports[task.id] || [])).toFixed(1))}h rem
                            </div>
                          </td>
                        </tr>
                        {(!taskReports[task.id] || taskReports[task.id].length === 0) ? (
                          <tr className="border-b border-border-card">
                            <td colSpan="4" className="p-3 bg-bg-base/30 text-center text-[10px] text-text-mut italic">
                              No updates reported yet
                            </td>
                          </tr>
                        ) : (
                          <tr className="border-b border-border-card">
                            <td colSpan="4" className="p-3 bg-bg-base/30">
                              <div className="pl-4 border-l-2 border-brand-primary/30 space-y-2">
                                {taskReports[task.id].filter(r => !r.reportText.startsWith("Worked for") && !r.reportText.startsWith("Auto-stopped")).map(r => (
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
  );
}
