import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext"; // Vite cache bust
import { useToast } from "../context/ToastContext";
import { collection, onSnapshot, query, updateDoc, doc, where } from "firebase/firestore";
import { 
  db, 
  getDbType, 
  createNotification, 
  subscribeToTaskReports,
  subscribeToDailyReports,
  updateDailyReport
} from "../firebase";
import { useModal } from "../context/ModalContext";
import { Search, Plus, Calendar, Clock, Edit2, Trash2, CheckCircle, XCircle, ChevronRight, UserPlus, Users, X, FileText, Download, MessageSquare } from "lucide-react";
import jsPDF from "jspdf";
import logoImg from '../assets/zuna-logo.png';
import { addStandardPDFHeader } from "../utils/pdfHeader";
import * as XLSX from "xlsx";

export default function ProjectManagement() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [selectedUserForTeam, setSelectedUserForTeam] = useState("");
  const [adminProjectInput, setAdminProjectInput] = useState("");
  const [filterProject, setFilterProject] = useState("All");
  const [filterDesignation, setFilterDesignation] = useState("All");
  
  const [selectedPmProjects, setSelectedPmProjects] = useState([]);
  const [adminEditProjectsInput, setAdminEditProjectsInput] = useState("");
  const [editProjects, setEditProjects] = useState([]);
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTargetUser, setTaskTargetUser] = useState(null);
  
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState(1);
  const [newTaskProject, setNewTaskProject] = useState("");
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);

  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState(null);
  const [editDesignation, setEditDesignation] = useState("");

  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showMemberReportsModal, setShowMemberReportsModal] = useState(false);
  const [selectedMemberForReports, setSelectedMemberForReports] = useState(null);
  const [allTaskReports, setAllTaskReports] = useState({});

  const [memberFilterDate, setMemberFilterDate] = useState("");
  const [memberFilterMonth, setMemberFilterMonth] = useState("");
  const [memberFilterProject, setMemberFilterProject] = useState("All");

  // Daily Activity Log States
  const [activeSubTab, setActiveSubTab] = useState("team"); // "team" | "daily-logs"
  const [dailyReports, setDailyReports] = useState([]);
  const [logFilterEmployee, setLogFilterEmployee] = useState("All");
  const [logFilterMonth, setLogFilterMonth] = useState("All");
  const [logFilterStatus, setLogFilterStatus] = useState("All");
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [selectedReportForRemarks, setSelectedReportForRemarks] = useState(null);
  const [remarksText, setRemarksText] = useState("");
  const [remarksStatus, setRemarksStatus] = useState("Completed");
  const [logCurrentPage, setLogCurrentPage] = useState(1);

  const pmProjects = currentUser?.projects?.length ? currentUser.projects : (currentUser?.project ? [currentUser.project] : []);

  useEffect(() => {
    if (!currentUser) return;
    
    if (getDbType() === "firebase") {
      let qRef = collection(db, "users");
      if (currentUser.companyId) {
        qRef = query(qRef, where("companyId", "==", currentUser.companyId));
      }
      const unsubscribe = onSnapshot(qRef, (snapshot) => {
        const users = snapshot.docs.map(d => ({ ...d.data(), uid: d.id }));
        setAllUsers(users);
        
        if (currentUser.role === "admin") {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          const currentUserProjects = currentUser.projects?.length ? currentUser.projects : (currentUser.project ? [currentUser.project] : []);
          setTeamMembers(users.filter(u => {
            const uProjects = u.projects?.length ? u.projects : (u.project ? [u.project] : []);
            return uProjects.some(p => currentUserProjects.includes(p));
          }));
        }
        
        // Update taskTargetUser if it's currently selected
        if (taskTargetUser) {
          const updatedTarget = users.find(u => u.uid === taskTargetUser.uid);
          if (updatedTarget) setTaskTargetUser(updatedTarget);
        }
        
        setLoading(false);
      });
      return unsubscribe;
    } else {
      const handler = () => {
        let users = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
        if (currentUser.companyId) {
          users = users.filter(u => u.companyId === currentUser.companyId);
        }
        setAllUsers(users);
        
        if (currentUser.role === "admin") {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          const currentUserProjects = currentUser.projects?.length ? currentUser.projects : (currentUser.project ? [currentUser.project] : []);
          setTeamMembers(users.filter(u => {
            const uProjects = u.projects?.length ? u.projects : (u.project ? [u.project] : []);
            return uProjects.some(p => currentUserProjects.includes(p));
          }));
        }
        
        if (taskTargetUser) {
          const updatedTarget = users.find(u => u.uid === taskTargetUser.uid);
          if (updatedTarget) setTaskTargetUser(updatedTarget);
        }
        
        setLoading(false);
      };
      handler();
      window.addEventListener("local-auth-updated", handler);
      return () => window.removeEventListener("local-auth-updated", handler);
    }
  }, [currentUser, taskTargetUser?.uid]);

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

  // Subscribe to all daily reports
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToDailyReports(currentUser.companyId, (data) => {
      setDailyReports(data || []);
    });
    return unsubscribe;
  }, [currentUser]);

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
    const titleText = "Project Task Reports";
    const subtitleText = `Project Manager: ${currentUser.name} | Downloaded: ${new Date().toLocaleString()}`;
    const startY = await addStandardPDFHeader(doc, titleText, subtitleText);
    
    const tableData = [];
    teamMembers.forEach(m => {
      (m.tasks || []).forEach(t => {
        const status = t.completed ? "Done" : "Active";
        tableData.push([
          { content: m.name, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
          { content: t.title, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
          { content: status, styles: { fillColor: [243, 244, 246] } },
          { content: `${t.duration || 0}h`, styles: { fillColor: [243, 244, 246] } }
        ]);
        
        const reports = allTaskReports[t.id] || [];
        if (reports.length > 0) {
          reports.forEach(r => {
            tableData.push([
              "",
              { content: `Update: ${r.reportText}`, colSpan: 2, styles: { textColor: [60, 60, 60], cellPadding: { left: 10, top: 3, bottom: 3 } } },
              { content: new Date(r.timestamp).toLocaleString(), styles: { fontSize: 8, textColor: [120, 120, 120], cellPadding: { top: 3, bottom: 3 } } }
            ]);
          });
        } else {
          tableData.push([
            "",
            { content: "No updates reported yet", colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150], cellPadding: { left: 10, top: 3, bottom: 3 } } }
          ]);
        }
      });
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    autoTable(doc, {
      head: [["Employee", "Task Details", "Status", "Duration"]],
      body: tableData,
      startY: startY,
      styles: { fontSize: 9, font: "helvetica", cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10, halign: "left" },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 80 }, 2: { halign: 'center' }, 3: { halign: 'right' } },
      theme: 'grid',
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    doc.save(`Project_Reports_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadExcel = () => {
    const tableData = [];
    teamMembers.forEach(m => {
      (m.tasks || []).forEach(t => {
        const status = t.completed ? "Done" : "Active";
        tableData.push({
          "Employee": m.name,
          "Task Title": t.title,
          "Status": status,
          "Est. Hours": t.duration || 0,
          "Update Detail": "--- Task Summary ---",
          "Update Timestamp": ""
        });
        
        const reports = allTaskReports[t.id] || [];
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
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Project Reports");
    XLSX.writeFile(wb, `Project_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadDailyLogsPDF = async () => {
    const filteredReports = dailyReports.filter(r => {
      const isManaged = currentUser.role === "admin" || teamMembers.some(member => member.uid === r.userId);
      if (!isManaged) return false;

      const matchEmployee = logFilterEmployee === "All" || r.userId === logFilterEmployee;
      const matchMonth = logFilterMonth === "All" || new Date(r.date).getMonth() === parseInt(logFilterMonth, 10);
      const matchStatus = logFilterStatus === "All" || r.status === logFilterStatus;

      return matchEmployee && matchMonth && matchStatus;
    });

    if (filteredReports.length === 0) {
      return showToast("No daily logs to export.", "warning");
    }

    const doc = new jsPDF("l", "mm", "a4");
    const titleText = "DAILY REPORT LOG";
    const subtitleText = "Log each intern's daily activity below | All fields required | Rows auto-highlight based on status";
    const startY = await addStandardPDFHeader(doc, titleText, subtitleText, true);

    const bodyData = filteredReports.map((report, idx) => [
      idx + 1,
      report.userName || "—",
      report.date || "—",
      report.day || "—",
      `${report.hours || 0} h`,
      report.tasksCompleted || "—",
      report.issuesFaced || "—",
      report.supervisorRemarks || "—",
      report.status || "—"
    ]);

    autoTable(doc, {
      startY: startY + 5,
      head: [["#", "Candidate Name", "Date", "Day (Auto)", "Hours", "Tasks Completed", "Issues Faced", "Supervisor Remarks", "Status"]],
      body: bodyData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica", overflow: "linebreak" },
      headStyles: { fillColor: [42, 75, 124], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 35 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 15, halign: "center" },
        5: { cellWidth: 55 },
        6: { cellWidth: 42 },
        7: { cellWidth: 42 },
        8: { cellWidth: 30, halign: "center" }
      },
      didParseCell: (data) => {
        if (data.row.index >= 0) {
          const statusVal = data.row.cells[8].text[0];
          const setRowColors = (fillColor, textColor) => {
            Object.values(data.row.cells).forEach(cell => {
              cell.styles.fillColor = fillColor;
              cell.styles.textColor = textColor;
            });
          };

          if (statusVal === "Completed") {
            setRowColors([212, 237, 218], [21, 87, 36]);
          } else if (statusVal === "On Hold") {
            setRowColors([248, 215, 218], [114, 28, 36]);
          } else if (statusVal === "In Progress") {
            setRowColors([255, 243, 205], [133, 100, 4]);
          }
        }
      }
    });

    const fileName = `Daily_Report_Log_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
    showToast("PDF report generated successfully.", "success");
  };

  const handleDownloadDailyLogsExcel = () => {
    const filteredReports = dailyReports.filter(r => {
      const isManaged = currentUser.role === "admin" || teamMembers.some(member => member.uid === r.userId);
      if (!isManaged) return false;

      const matchEmployee = logFilterEmployee === "All" || r.userId === logFilterEmployee;
      const matchMonth = logFilterMonth === "All" || new Date(r.date).getMonth() === parseInt(logFilterMonth, 10);
      const matchStatus = logFilterStatus === "All" || r.status === logFilterStatus;

      return matchEmployee && matchMonth && matchStatus;
    });

    if (filteredReports.length === 0) {
      return showToast("No daily logs to export.", "warning");
    }

    const titleRow = ["DAILY REPORT LOG"];
    const subtitleRow = ["Log each intern's daily activity below | All fields required | Rows auto-highlight based on status"];
    const emptyRow = [];
    const headerRow = ["#", "Candidate Name", "Date", "Day (Auto)", "Hours", "Tasks Completed", "Issues Faced", "Supervisor Remarks", "Status"];

    const aoaData = [
      titleRow,
      subtitleRow,
      emptyRow,
      headerRow,
      ...filteredReports.map((report, idx) => [
        idx + 1,
        report.userName || "",
        report.date || "",
        report.day || "",
        report.hours || 0,
        report.tasksCompleted || "",
        report.issuesFaced || "",
        report.supervisorRemarks || "",
        report.status || ""
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Report Log");

    ws["!cols"] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 8 },
      { wch: 40 },
      { wch: 30 },
      { wch: 30 },
      { wch: 15 }
    ];

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
    ];

    const fileName = `Daily_Report_Log_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast("Excel spreadsheet generated successfully.", "success");
  };

  const handleSaveRemarks = async (e) => {
    e.preventDefault();
    if (!selectedReportForRemarks) return;

    try {
      await updateDailyReport(selectedReportForRemarks.id, {
        supervisorRemarks: remarksText,
        status: remarksStatus
      });
      
      await createNotification(
        selectedReportForRemarks.userId,
        "Daily Log Reviewed",
        `Your daily activity log for ${selectedReportForRemarks.date} was reviewed. Remarks: "${remarksText}".`,
        remarksStatus === "Completed" ? "success" : "info",
        "/task-management"
      );

      showToast("Supervisor remarks updated successfully!", "success");
      setShowRemarksModal(false);
      setSelectedReportForRemarks(null);
      setRemarksText("");
    } catch (err) {
      showToast("Failed to save remarks.", "error");
    }
  };

  const getFilteredMemberTasks = () => {
    if (!selectedMemberForReports || !selectedMemberForReports.tasks) return [];
    
    return selectedMemberForReports.tasks.map(task => {
      const reports = allTaskReports[task.id] || [];
      const filteredReports = reports.filter(r => {
        if (r.reportText.startsWith("Worked for") || r.reportText.startsWith("Auto-stopped")) return false;
        
        const reportDateObj = new Date(r.timestamp);
        
        if (memberFilterDate) {
          if (reportDateObj.toISOString().split('T')[0] !== memberFilterDate) return false;
        }
        
        if (memberFilterMonth) {
          const reportMonth = reportDateObj.toISOString().substring(0, 7);
          if (reportMonth !== memberFilterMonth) return false;
        }
        
        return true;
      });

      return {
        ...task,
        filteredReports
      };
    }).filter(task => {
      if (memberFilterProject !== "All" && task.project !== memberFilterProject) return false;
      if ((memberFilterDate || memberFilterMonth) && task.filteredReports.length === 0) return false;
      return true;
    });
  };

  const handleMemberDownloadPDF = async () => {
    if (!selectedMemberForReports) return;
    
    const filteredTasks = getFilteredMemberTasks();
    if (filteredTasks.length === 0) {
      showToast("No data to export with current filters", "warning");
      return;
    }

    const doc = new jsPDF();
    const titleText = `Reports: ${selectedMemberForReports.name}`;
    const subtitleText = `Project Manager: ${currentUser.name} | Downloaded: ${new Date().toLocaleString()}`;
    let startY = await addStandardPDFHeader(doc, titleText, subtitleText);

    let filtersApplied = [];
    if (memberFilterDate) filtersApplied.push(`Date: ${memberFilterDate}`);
    if (memberFilterMonth) filtersApplied.push(`Month: ${memberFilterMonth}`);
    if (memberFilterProject !== "All") filtersApplied.push(`Project: ${memberFilterProject}`);
    if (filtersApplied.length > 0) {
       doc.setFontSize(9);
       doc.setTextColor(80, 80, 80);
       doc.text(`Filters: ${filtersApplied.join(' | ')}`, 14, startY);
       startY += 6;
    }
    
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, startY - 2, 196, startY - 2);

    const tableData = [];
    filteredTasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push([
        { content: t.title + (t.project ? ` (${t.project})` : ""), styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
        { content: status, styles: { fillColor: [243, 244, 246], halign: 'center' } },
        { content: `${t.duration || 0}h`, styles: { fillColor: [243, 244, 246], halign: 'right' } }
      ]);
      
      if (t.filteredReports.length > 0) {
        t.filteredReports.forEach(r => {
          tableData.push([
            { content: `Update: ${r.reportText}`, colSpan: 2, styles: { textColor: [60, 60, 60], cellPadding: { left: 10, top: 3, bottom: 3 } } },
            { content: new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), styles: { fontSize: 8, textColor: [120, 120, 120], cellPadding: { top: 3, bottom: 3 }, halign: 'right' } }
          ]);
        });
      } else {
        tableData.push([
          { content: "No updates reported yet", colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150], cellPadding: { left: 10, top: 3, bottom: 3 } } }
        ]);
      }
    });

    autoTable(doc, {
      head: [["Task Details", "Status", "Duration"]],
      body: tableData,
      startY: startY,
      styles: { fontSize: 9, font: "helvetica", cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10, halign: "left" },
      columnStyles: { 0: { cellWidth: 115 }, 1: { halign: 'center', cellWidth: 25 }, 2: { halign: 'right', cellWidth: 42 } },
      theme: 'grid',
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    doc.save(`Reports_${selectedMemberForReports.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleMemberDownloadExcel = () => {
    if (!selectedMemberForReports) return;
    
    const filteredTasks = getFilteredMemberTasks();
    if (filteredTasks.length === 0) {
      showToast("No data to export with current filters", "warning");
      return;
    }

    const tableData = [];
    filteredTasks.forEach(t => {
      const status = t.completed ? "Done" : "Active";
      tableData.push({
        "Task Title": t.title,
        "Project": t.project || "",
        "Status": status,
        "Est. Hours": t.duration || 0,
        "Update Detail": "--- Task Summary ---",
        "Update Timestamp": ""
      });
      
      if (t.filteredReports.length > 0) {
        t.filteredReports.forEach(r => {
          tableData.push({
            "Task Title": "",
            "Project": "",
            "Status": "",
            "Est. Hours": "",
            "Update Detail": r.reportText,
            "Update Timestamp": new Date(r.timestamp).toLocaleString()
          });
        });
      } else {
        tableData.push({
          "Task Title": "",
          "Project": "",
          "Status": "",
          "Est. Hours": "",
          "Update Detail": "No updates reported yet",
          "Update Timestamp": ""
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Member Reports");
    XLSX.writeFile(wb, `Reports_${selectedMemberForReports.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    if (!selectedUserForTeam) return showToast("Please select a user", "warning");
    
    const targetProjects = currentUser.role === "admin" 
      ? adminProjectInput.split(',').map(s=>s.trim()).filter(Boolean)
      : selectedPmProjects;
      
    if (!targetProjects.length) return showToast("Please specify a project", "warning");

    try {
      if (getDbType() === "firebase") {
        const u = allUsers.find(user => user.uid === selectedUserForTeam);
        const currentProjects = u?.projects?.length ? u.projects : (u?.project ? [u.project] : []);
        const newProjects = [...new Set([...currentProjects, ...targetProjects])];
        
        const updates = { projects: newProjects, project: newProjects[0] || "" };
        if (currentUser.role === "admin") updates.isProjectManager = true;
        await updateDoc(doc(db, "users", selectedUserForTeam), updates);
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === selectedUserForTeam);
        if (idx !== -1) {
          const currentProjects = users[idx].projects?.length ? users[idx].projects : (users[idx].project ? [users[idx].project] : []);
          const newProjects = [...new Set([...currentProjects, ...targetProjects])];
          
          users[idx].projects = newProjects;
          users[idx].project = newProjects[0] || "";
          if (currentUser.role === "admin") users[idx].isProjectManager = true;
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      showToast(currentUser.role === "admin" ? "Project assigned successfully" : "Team member added successfully", "success");
      setShowAddTeamModal(false);
      setSelectedUserForTeam("");
      setAdminProjectInput("");
      setSelectedPmProjects([]);
    } catch (err) {
      showToast("Failed to add member", "error");
    }
  };

  const handleRemoveMember = async (member) => {
    showConfirm("Remove Team Member", `Are you sure you want to remove ${member.name} from the project?`, async () => {
      try {
        if (getDbType() === "firebase") {
          await updateDoc(doc(db, "users", member.uid), { projects: [], project: "", tasks: [], isProjectManager: false });
        } else {
          const users = JSON.parse(localStorage.getItem("att_users"));
          const idx = users.findIndex(u => u.uid === member.uid);
          if (idx !== -1) {
            users[idx].projects = [];
            users[idx].project = "";
            users[idx].tasks = [];
            users[idx].isProjectManager = false;
            localStorage.setItem("att_users", JSON.stringify(users));
            window.dispatchEvent(new Event("local-auth-updated"));
          }
        }
        showToast(`${member.name} removed from the project`, "success");
      } catch (err) {
        showToast("Failed to remove member", "error");
      }
    }, { confirmText: "Remove", cancelText: "Cancel" });
  };

  const openEditMemberModal = (member) => {
    setMemberToEdit(member);
    setEditDesignation(member.designation || member.jobType || "");
    const currentMemberProjects = member.projects?.length ? member.projects : (member.project ? [member.project] : []);
    if (currentUser?.role === "admin") {
      setAdminEditProjectsInput(currentMemberProjects.join(", "));
    } else {
      const sharedProjects = currentMemberProjects.filter(p => pmProjects.includes(p));
      setEditProjects(sharedProjects);
    }
    setShowEditMemberModal(true);
  };

  const handleSaveMemberEdit = async (e) => {
    e.preventDefault();
    try {
      let updatedProjects = [];
      const currentProjects = memberToEdit.projects?.length ? memberToEdit.projects : (memberToEdit.project ? [memberToEdit.project] : []);
      
      if (currentUser.role === "admin") {
        updatedProjects = adminEditProjectsInput.split(',').map(s=>s.trim()).filter(Boolean);
      } else {
        const nonPmProjects = currentProjects.filter(p => !pmProjects.includes(p));
        updatedProjects = [...new Set([...nonPmProjects, ...editProjects])];
      }

      const updates = { 
        designation: editDesignation,
        projects: updatedProjects,
        project: updatedProjects[0] || ""
      };
      
      if (updatedProjects.length === 0) {
        updates.isProjectManager = false;
      }

      if (getDbType() === "firebase") {
        await updateDoc(doc(db, "users", memberToEdit.uid), updates);
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === memberToEdit.uid);
        if (idx !== -1) {
          users[idx].designation = editDesignation;
          users[idx].projects = updatedProjects;
          users[idx].project = updatedProjects[0] || "";
          if (updatedProjects.length === 0) {
            users[idx].isProjectManager = false;
          }
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      showToast("Member updated successfully", "success");
      setShowEditMemberModal(false);
    } catch (err) {
      showToast("Failed to update member", "error");
    }
  };

  const openTaskModal = (user) => {
    setTaskTargetUser(user);
    setNewTaskTitle("");
    setNewTaskDuration(1);
    const uProjects = user.projects?.length ? user.projects : (user.project ? [user.project] : []);
    setNewTaskProject(uProjects.length > 0 ? uProjects[0] : "General Task");
    setEditingTaskIndex(null);
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return showToast("Task title is required", "warning");

    let currentTasks = [...(taskTargetUser.tasks || [])];
    
    if (editingTaskIndex !== null) {
      currentTasks[editingTaskIndex] = {
        ...currentTasks[editingTaskIndex],
        title: newTaskTitle,
        duration: newTaskDuration,
        project: newTaskProject
      };
    } else {
      currentTasks.push({
        id: "task_" + Date.now(),
        title: newTaskTitle,
        duration: newTaskDuration,
        project: newTaskProject,
        completed: false,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString()
      });
    }

    try {
      if (getDbType() === "firebase") {
        await updateDoc(doc(db, "users", taskTargetUser.uid), { tasks: currentTasks });
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === taskTargetUser.uid);
        if (idx !== -1) {
          users[idx].tasks = currentTasks;
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      
      if (editingTaskIndex === null) {
        await createNotification(
          taskTargetUser.uid,
          "New Task Assigned",
          `You have been assigned a new task: "${newTaskTitle}" (${newTaskDuration}h) by ${currentUser.name}.`,
          "task",
          "/dashboard?tab=tasks"
        );
        showToast("Task assigned & user notified", "success");
      } else {
        showToast("Task updated successfully", "success");
      }

      setNewTaskTitle("");
      setNewTaskDuration(1);
      setNewTaskProject("");
      setEditingTaskIndex(null);
    } catch (err) {
      showToast("Failed to save task", "error");
    }
  };

  const handleDeleteTask = async (taskIdx) => {
    showConfirm("Delete Task", "Are you sure you want to delete this task?", async () => {
      let currentTasks = taskTargetUser.tasks || [];
      currentTasks.splice(taskIdx, 1);
      
      try {
        if (getDbType() === "firebase") {
          await updateDoc(doc(db, "users", taskTargetUser.uid), { tasks: currentTasks });
        } else {
          const users = JSON.parse(localStorage.getItem("att_users"));
          const idx = users.findIndex(u => u.uid === taskTargetUser.uid);
          if (idx !== -1) {
            users[idx].tasks = currentTasks;
            localStorage.setItem("att_users", JSON.stringify(users));
            window.dispatchEvent(new Event("local-auth-updated"));
          }
        }
        showToast("Task deleted", "success");
      } catch (err) {
        showToast("Failed to delete task", "error");
      }
    }, { confirmText: "Delete", cancelText: "Cancel" });
  };

  const uniqueProjects = Array.from(new Set(teamMembers.flatMap(m => m.projects?.length ? m.projects : (m.project ? [m.project] : [])))).filter(Boolean);
  const uniqueDesignations = Array.from(new Set(teamMembers.map(m => m.designation || m.jobType || "Unassigned"))).filter(Boolean).sort();

  const filteredTeam = teamMembers.filter(m => {
    const matchesSearch = m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (m.designation || m.jobType || "Unassigned").toLowerCase().includes(searchQuery.toLowerCase());
    const mProjects = m.projects?.length ? m.projects : (m.project ? [m.project] : []);
    const matchesProject = filterProject === "All" || mProjects.includes(filterProject);
    const mDesignation = m.designation || m.jobType || "Unassigned";
    const matchesDesignation = filterDesignation === "All" || mDesignation === filterDesignation;
    return matchesSearch && matchesProject && matchesDesignation;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterProject, filterDesignation]);

  useEffect(() => {
    setLogCurrentPage(1);
  }, [logFilterEmployee, logFilterMonth, logFilterStatus]);

  const totalPages = Math.ceil(filteredTeam.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTeam = filteredTeam.slice(startIndex, startIndex + itemsPerPage);

  const filteredReports = dailyReports.filter(r => {
    const isManaged = currentUser?.role === "admin" || teamMembers.some(member => member.uid === r.userId);
    if (!isManaged) return false;

    const matchEmployee = logFilterEmployee === "All" || r.userId === logFilterEmployee;
    const matchMonth = logFilterMonth === "All" || new Date(r.date).getMonth() === parseInt(logFilterMonth, 10);
    const matchStatus = logFilterStatus === "All" || r.status === logFilterStatus;

    return matchEmployee && matchMonth && matchStatus;
  });

  const logsPerPage = 10;
  const logTotalPages = Math.ceil(filteredReports.length / logsPerPage) || 1;
  const logStartIndex = (logCurrentPage - 1) * logsPerPage;
  const paginatedLogs = filteredReports.slice(logStartIndex, logStartIndex + logsPerPage);

  const availableUsersToAdd = currentUser?.role === "admin"
    ? allUsers.filter(u => u.uid !== currentUser?.uid && u.role !== "admin")
    : allUsers.filter(u => {
        if (u.uid === currentUser?.uid || u.role === "admin") return false;
        const currentUserProjects = currentUser.projects?.length ? currentUser.projects : (currentUser.project ? [currentUser.project] : []);
        const uProjects = u.projects?.length ? u.projects : (u.project ? [u.project] : []);
        return !uProjects.some(p => currentUserProjects.includes(p));
      });

  if (!currentUser?.isProjectManager && currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <h2 className="text-xl font-bold text-text-main mb-2">Access Denied</h2>
        <p className="text-text-sec text-sm">You do not have Project Manager privileges.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-main tracking-tight">Project Management</h1>
          <p className="text-sm text-text-mut font-medium mt-1">
            {currentUser?.role === "admin" ? "Managing All Projects & Tasks" : (
              <>Managing Team for: <span className="font-bold text-brand-primary">{(currentUser.projects && currentUser.projects.length > 0) ? currentUser.projects.join(', ') : (currentUser.project || "Unassigned")}</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowReportsModal(true)}
            className="bg-bg-base hover:bg-bg-card border border-border-card text-text-main text-xs font-bold py-2.5 px-4 rounded-[12px] flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <FileText size={16} className="text-brand-primary" />
            <span>Project Reports</span>
          </button>
          <button 
            onClick={() => {
              setSelectedPmProjects(pmProjects.length > 0 ? [pmProjects[0]] : []);
              setShowAddTeamModal(true);
            }}
            className="bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold py-2.5 px-5 rounded-[12px] flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-primary/20 hover:shadow-brand-primary/40 cursor-pointer"
          >
            <UserPlus size={16} />
            <span>{currentUser?.role === "admin" ? "Assign Project" : "Add Team Member"}</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-border-card mb-6">
        <button
          onClick={() => setActiveSubTab("team")}
          className={`pb-3 px-6 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeSubTab === "team"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-mut hover:text-text-main"
          }`}
        >
          My Team
        </button>
        <button
          onClick={() => setActiveSubTab("daily-logs")}
          className={`pb-3 px-6 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeSubTab === "daily-logs"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-text-mut hover:text-text-main"
          }`}
        >
          Daily Activity Logs
        </button>
      </div>

      {activeSubTab === "team" ? (
        <div className="bg-bg-card border border-border-card rounded-[20px] shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-border-card bg-bg-base/30 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mut" />
            <input 
              type="text" 
              placeholder="Search team members..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm inset-shadow-sm"
            />
          </div>
          <div className="relative w-full sm:max-w-[200px] mt-2 sm:mt-0">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="w-full px-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm cursor-pointer"
            >
              <option value="All">All Projects</option>
              {uniqueProjects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="relative w-full sm:max-w-[200px] mt-2 sm:mt-0">
            <select
              value={filterDesignation}
              onChange={(e) => setFilterDesignation(e.target.value)}
              className="w-full px-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm cursor-pointer"
            >
              <option value="All">All Designations</option>
              {uniqueDesignations.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                <th className="p-4 font-bold">Employee</th>
                {currentUser?.role === "admin" && <th className="p-4 font-bold">Project</th>}
                <th className="p-4 font-bold">Designation</th>
                <th className="p-4 font-bold text-center">Tasks</th>
                <th className="p-4 font-bold text-center">Completion</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-text-mut text-sm">Loading team...</td>
                </tr>
              ) : filteredTeam.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-3 bg-brand-primary/10 p-3 rounded-full">
                        <Users size={36} className="text-brand-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-text-main">No Team Members Found</h3>
                      <p className="text-xs text-text-mut">Add members to your project to start assigning tasks.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTeam.map((member) => {
                  const tasks = member.tasks || [];
                  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
                  const totalTrackedHours = tasks.reduce((sum, t) => sum + calculateTimeSpent(allTaskReports[t.id] || []), 0);
                  
                  let progress = 0;
                  if (totalEstimatedHours > 0) {
                    progress = Math.min(100, Math.round((totalTrackedHours / totalEstimatedHours) * 100));
                  } else {
                    const completed = tasks.filter(t => t.completed).length;
                    progress = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
                  }

                  return (
                    <tr key={member.uid} className="border-b border-border-card/50 hover:bg-bg-base/30 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
                            {member.avatar ? (
                              <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />
                            ) : member.name ? member.name.substring(0,2) : "?"}
                          </div>
                          <div>
                            <div 
                              className="font-bold text-sm text-text-main cursor-pointer hover:text-brand-primary hover:underline transition-colors"
                              onClick={() => { setSelectedMemberForReports(member); setShowMemberReportsModal(true); }}
                              title="View Member Reports"
                            >
                              {member.name}
                            </div>
                            <div className="text-[10px] text-text-sec">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      {currentUser?.role === "admin" && (
                        <td className="p-4 text-xs font-medium text-text-main">
                          {member.projects && member.projects.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {member.projects.map(p => <span key={p} className="px-2 py-1 bg-brand-primary/10 text-brand-primary text-[10px] rounded-[6px]">{p}</span>)}
                            </div>
                          ) : member.project ? (
                            <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary text-[10px] rounded-[6px]">{member.project}</span>
                          ) : (
                            <span className="text-text-mut">Unassigned</span>
                          )}
                        </td>
                      )}
                      <td className="p-4 text-xs font-medium text-text-sec">
                        {member.designation || member.jobType || "Unassigned"}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold">
                          {tasks.length}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[10px] font-bold text-text-sec">{progress}%</span>
                          <div className="w-full max-w-[100px] h-1.5 bg-bg-base rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : progress > 0 ? 'bg-brand-primary' : 'bg-transparent'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openTaskModal(member)}
                            className="py-1.5 px-3 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-[8px] text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                            title="Manage Tasks"
                          >
                            <span>Tasks</span>
                            <ChevronRight size={14} />
                          </button>
                          <button
                            onClick={() => openEditMemberModal(member)}
                            className="p-1.5 bg-bg-base border border-border-card text-text-sec hover:text-brand-primary hover:border-brand-primary rounded-[8px] transition-colors cursor-pointer"
                            title="Edit Member Designation"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member)}
                            className="p-1.5 bg-bg-base border border-border-card text-text-sec hover:text-red-500 hover:border-red-500 hover:bg-red-500/5 rounded-[8px] transition-colors cursor-pointer"
                            title="Remove from Project"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-4 border-t border-border-card text-xs flex-wrap gap-4 px-4 pb-4">
            <span className="text-text-mut font-semibold">
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredTeam.length)} of {filteredTeam.length} entries
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-bg-card border border-border-card rounded-[8px] hover:bg-bg-base hover:text-brand-primary font-bold disabled:opacity-50 transition-colors cursor-pointer"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-7 h-7 rounded-[8px] font-bold transition-colors cursor-pointer ${
                    currentPage === i + 1 
                      ? "bg-brand-primary text-white" 
                      : "bg-bg-card border border-border-card text-text-sec hover:bg-bg-base hover:text-brand-primary"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-bg-card border border-border-card rounded-[8px] hover:bg-bg-base hover:text-brand-primary font-bold disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      ) : (
        <div className="bg-bg-card border border-border-card rounded-[20px] shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b border-border-card bg-bg-base/30 flex flex-col md:flex-row items-center gap-4">
            <div className="relative w-full md:max-w-[200px]">
              <select
                value={logFilterEmployee}
                onChange={(e) => setLogFilterEmployee(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm cursor-pointer"
              >
                <option value="All">All Employees</option>
                {teamMembers.map(m => (
                  <option key={m.uid} value={m.uid}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="relative w-full md:max-w-[180px] mt-2 md:mt-0">
              <select
                value={logFilterMonth}
                onChange={(e) => setLogFilterMonth(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm cursor-pointer"
              >
                <option value="All">All Months</option>
                <option value="0">January</option>
                <option value="1">February</option>
                <option value="2">March</option>
                <option value="3">April</option>
                <option value="4">May</option>
                <option value="5">June</option>
                <option value="6">July</option>
                <option value="7">August</option>
                <option value="8">September</option>
                <option value="9">October</option>
                <option value="10">November</option>
                <option value="11">December</option>
              </select>
            </div>
            <div className="relative w-full md:max-w-[180px] mt-2 md:mt-0">
              <select
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-card border border-border-card rounded-[12px] text-xs text-text-main outline-none focus:border-brand-primary transition-all shadow-sm cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>

            <div className="flex gap-3 w-full md:w-auto md:ml-auto mt-2 md:mt-0 justify-end">
              <button
                onClick={handleDownloadDailyLogsExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-[10px] flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer w-full sm:w-auto"
              >
                <Download size={14} />
                <span>Export Excel</span>
              </button>
              <button
                onClick={handleDownloadDailyLogsPDF}
                className="bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold py-2 px-3.5 rounded-[10px] flex items-center justify-center gap-1.5 transition-all shadow-md shadow-brand-primary/10 cursor-pointer w-full sm:w-auto"
              >
                <Download size={14} />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                  <th className="p-4 font-bold text-center">#</th>
                  <th className="p-4 font-bold">Candidate Name</th>
                  <th className="p-4 font-bold">Date</th>
                  <th className="p-4 font-bold">Day</th>
                  <th className="p-4 font-bold text-center">Hours</th>
                  <th className="p-4 font-bold">Tasks Completed</th>
                  <th className="p-4 font-bold">Issues Faced</th>
                  <th className="p-4 font-bold">Supervisor Remarks</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-text-mut text-sm">
                      No daily logs found matching selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((report, idx) => {
                    let statusBadge = "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
                    if (report.status === "On Hold") {
                      statusBadge = "bg-red-500/10 text-red-500 border border-red-500/20";
                    } else if (report.status === "In Progress") {
                      statusBadge = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
                    }
                    return (
                      <tr key={report.id} className="border-b border-border-card/50 hover:bg-bg-base/30 transition-colors text-xs text-text-sec">
                        <td className="p-4 text-center font-bold text-text-mut">{logStartIndex + idx + 1}</td>
                        <td className="p-4 font-bold text-text-main">{report.userName}</td>
                        <td className="p-4 whitespace-nowrap">{report.date}</td>
                        <td className="p-4 whitespace-nowrap">{report.day}</td>
                        <td className="p-4 text-center whitespace-nowrap font-semibold text-text-main">{report.hours} h</td>
                        <td className="p-4 max-w-[200px] truncate" title={report.tasksCompleted}>{report.tasksCompleted}</td>
                        <td className="p-4 max-w-[150px] truncate" title={report.issuesFaced}>
                          {report.issuesFaced ? report.issuesFaced : <span className="text-text-mut/40 italic">None</span>}
                        </td>
                        <td className="p-4 max-w-[150px] truncate" title={report.supervisorRemarks}>
                          {report.supervisorRemarks ? report.supervisorRemarks : <span className="text-text-mut/40 italic">No remarks yet</span>}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusBadge}`}>
                            {report.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedReportForRemarks(report);
                              setRemarksText(report.supervisorRemarks || "");
                              setRemarksStatus(report.status || "Completed");
                              setShowRemarksModal(true);
                            }}
                            className="py-1 px-2.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-[6px] text-[10px] font-bold transition-all cursor-pointer"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {logTotalPages > 1 && (
            <div className="flex justify-between items-center pt-4 border-t border-border-card text-xs flex-wrap gap-4 px-4 pb-4">
              <span className="text-text-mut font-semibold">
                Showing {logStartIndex + 1} to {Math.min(logStartIndex + logsPerPage, filteredReports.length)} of {filteredReports.length} entries
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setLogCurrentPage(p => Math.max(1, p - 1))}
                  disabled={logCurrentPage === 1}
                  className="px-3 py-1.5 bg-bg-card border border-border-card rounded-[8px] hover:bg-bg-base hover:text-brand-primary font-bold disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Prev
                </button>
                {Array.from({ length: logTotalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setLogCurrentPage(i + 1)}
                    className={`w-7 h-7 rounded-[8px] font-bold transition-colors cursor-pointer ${
                      logCurrentPage === i + 1 
                        ? "bg-brand-primary text-white" 
                        : "bg-bg-card border border-border-card text-text-sec hover:bg-bg-base hover:text-brand-primary"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setLogCurrentPage(p => Math.min(logTotalPages, p + 1))}
                  disabled={logCurrentPage === logTotalPages}
                  className="px-3 py-1.5 bg-bg-card border border-border-card rounded-[8px] hover:bg-bg-base hover:text-brand-primary font-bold disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Team Member Modal */}
      {showAddTeamModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-6 animate-fade-in">
          <div className="w-full max-w-[400px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <UserPlus size={18} className="text-brand-primary" />
                Add to Team
              </h3>
              <button onClick={() => setShowAddTeamModal(false)} className="text-text-mut hover:text-text-main font-bold cursor-pointer"><X size={18} /></button>
            </div>
            
            <form onSubmit={handleAddTeamMember} className="space-y-4">
              {currentUser?.role === "admin" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Project Name (comma-separated for multiple)</label>
                  <input 
                    type="text" 
                    placeholder="Enter project name..."
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                    value={adminProjectInput}
                    onChange={(e) => setAdminProjectInput(e.target.value)}
                    required
                  />
                </div>
              )}
              {currentUser?.role !== "admin" && pmProjects.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-sec">Assign to Projects</label>
                  <div className="flex flex-wrap gap-3 mt-1 p-2 bg-bg-base/30 border border-border-card rounded-[12px]">
                    {pmProjects.map(p => (
                      <label key={p} className="flex items-center gap-1.5 text-xs text-text-main cursor-pointer hover:text-brand-primary transition-colors">
                        <input 
                          type="checkbox"
                          checked={selectedPmProjects.includes(p)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPmProjects([...selectedPmProjects, p]);
                            } else {
                              setSelectedPmProjects(selectedPmProjects.filter(proj => proj !== p));
                            }
                          }}
                          className="accent-brand-primary w-3.5 h-3.5 cursor-pointer"
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                  {selectedPmProjects.length === 0 && (
                    <p className="text-[10px] text-brand-warning mt-1">Please select at least one project.</p>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-sec">Select Employee</label>
                <select 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                  value={selectedUserForTeam}
                  onChange={(e) => setSelectedUserForTeam(e.target.value)}
                  required
                >
                  <option value="">-- Choose an employee --</option>
                  {availableUsersToAdd.map(u => (
                    <option key={u.uid} value={u.uid}>{u.name} ({u.designation || u.department || 'No dept'})</option>
                  ))}
                </select>
                {availableUsersToAdd.length === 0 && (
                  <p className="text-[10px] text-brand-warning mt-1">No available employees found.</p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border-card mt-4">
                <button type="button" onClick={() => setShowAddTeamModal(false)} className="py-2 px-4 border border-border-card rounded-[10px] text-xs font-bold text-text-sec hover:bg-bg-base cursor-pointer">Cancel</button>
                <button type="submit" disabled={!selectedUserForTeam || (currentUser?.role === "admin" && !adminProjectInput) || (currentUser?.role !== "admin" && selectedPmProjects.length === 0)} className="py-2 px-4 bg-brand-primary hover:bg-brand-hover text-white rounded-[10px] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50">
                  {currentUser?.role === "admin" ? "Assign Project" : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Manage Tasks Modal */}
      {showTaskModal && taskTargetUser && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-6 animate-fade-in">
          <div className="w-full max-w-[600px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4 flex-shrink-0">
              <h3 className="font-bold text-lg text-text-main">
                Tasks for <span className="text-brand-primary">{taskTargetUser.name}</span>
              </h3>
              <button onClick={() => setShowTaskModal(false)} className="text-text-mut hover:text-text-main font-bold cursor-pointer"><X size={18} /></button>
            </div>
            
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-grow space-y-6">
              
              <div className="bg-bg-base/50 p-4 rounded-[16px] border border-border-card">
                <h4 className="text-xs font-extrabold text-text-main uppercase tracking-wider mb-3">
                  {editingTaskIndex !== null ? "Edit Task" : "Assign New Task"}
                </h4>
                <form onSubmit={handleSaveTask} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-3 flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-text-sec">Task Title</label>
                      <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-border-card rounded-[10px] bg-bg-card text-xs text-text-main outline-none focus:border-brand-primary transition-all"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="e.g. Develop landing page UI"
                        required
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-text-sec">Project</label>
                      <select 
                        className="w-full px-3 py-2 border border-border-card rounded-[10px] bg-bg-card text-xs text-text-main outline-none focus:border-brand-primary transition-all"
                        value={newTaskProject}
                        onChange={(e) => setNewTaskProject(e.target.value)}
                        required
                      >
                        <option value="General Task">General Task</option>
                        {(taskTargetUser?.projects?.length ? taskTargetUser.projects : (taskTargetUser?.project ? [taskTargetUser.project] : [])).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-1 flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-text-sec">Hours</label>
                      <input 
                        type="number" 
                        min="0.5" step="0.5"
                        className="w-full px-3 py-2 border border-border-card rounded-[10px] bg-bg-card text-xs text-text-main outline-none focus:border-brand-primary transition-all"
                        value={newTaskDuration}
                        onChange={(e) => setNewTaskDuration(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    {editingTaskIndex !== null && (
                      <button 
                        type="button" 
                        onClick={() => { setEditingTaskIndex(null); setNewTaskTitle(""); setNewTaskDuration(1); setNewTaskProject(""); }}
                        className="py-1.5 px-3 border border-border-card rounded-[8px] text-[10px] font-bold text-text-sec hover:bg-bg-card cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className="py-1.5 px-4 bg-brand-primary text-white rounded-[8px] text-[10px] font-bold hover:bg-brand-hover transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {editingTaskIndex !== null ? <Edit2 size={12} /> : <Plus size={12} />}
                      <span>{editingTaskIndex !== null ? "Update Task" : "Assign Task"}</span>
                    </button>
                  </div>
                </form>
              </div>

              <div>
                <h4 className="text-xs font-extrabold text-text-main uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Current Tasks</span>
                  <span className="bg-bg-base px-2 py-0.5 rounded-full text-[10px]">
                    {taskTargetUser.tasks?.length || 0} Total
                  </span>
                </h4>
                
                {(!taskTargetUser.tasks || taskTargetUser.tasks.length === 0) ? (
                  <p className="text-xs text-text-mut text-center py-6 border border-dashed border-border-card rounded-[12px]">
                    No tasks assigned to this employee yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {taskTargetUser.tasks.map((task, idx) => (
                      <div key={task.id || idx} className={`p-3 rounded-[12px] border ${task.completed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-bg-card border-border-card'} flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-sm`}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {task.completed ? (
                              <CheckCircle size={16} className="text-emerald-500" />
                            ) : (
                              <Clock size={16} className="text-brand-primary" />
                            )}
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${task.completed ? 'text-text-sec line-through' : 'text-text-main'}`}>
                              {task.title}
                            </p>
                            {task.project && (
                              <p className="text-[9px] font-bold text-brand-primary mt-0.5 uppercase tracking-wider">{task.project}</p>
                            )}
                            <p className="text-[10px] text-text-mut mt-0.5">
                              Est. Duration: {task.duration || 0} hours
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 self-end sm:self-auto">
                          <button
                            onClick={() => {
                              setEditingTaskIndex(idx);
                              setNewTaskTitle(task.title);
                              setNewTaskDuration(task.duration || 1);
                              setNewTaskProject(task.project || "");
                            }}
                            className="p-1.5 text-text-sec hover:text-brand-primary hover:bg-brand-primary/10 rounded-[6px] transition-colors cursor-pointer"
                            title="Edit Task"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(idx)}
                            className="p-1.5 text-text-sec hover:text-red-500 hover:bg-red-500/10 rounded-[6px] transition-colors cursor-pointer"
                            title="Delete Task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Team Member Modal */}
      {showEditMemberModal && memberToEdit && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-6 animate-fade-in">
          <div className="w-full max-w-[400px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <Edit2 size={18} className="text-brand-primary" />
                Edit Team Member
              </h3>
              <button onClick={() => setShowEditMemberModal(false)} className="text-text-mut hover:text-text-main font-bold cursor-pointer"><X size={18} /></button>
            </div>
            
            <form onSubmit={handleSaveMemberEdit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-sec">Member Name</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-mut outline-none cursor-not-allowed"
                  value={memberToEdit.name}
                  disabled
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-sec">Designation / Role</label>
                <input 
                  type="text" 
                  placeholder="e.g. Frontend Developer"
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  required
                />
              </div>
              
              {currentUser?.role === "admin" ? (
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-xs font-bold text-text-sec">Assigned Projects (comma-separated)</label>
                  <input 
                    type="text" 
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                    value={adminEditProjectsInput}
                    onChange={(e) => setAdminEditProjectsInput(e.target.value)}
                  />
                </div>
              ) : pmProjects.length > 0 ? (
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-xs font-bold text-text-sec">Manage Assigned Projects</label>
                  <div className="flex flex-wrap gap-3 mt-1 p-2 bg-bg-base/30 border border-border-card rounded-[12px]">
                    {pmProjects.map(p => (
                      <label key={p} className="flex items-center gap-1.5 text-xs text-text-main cursor-pointer hover:text-brand-primary transition-colors">
                        <input 
                          type="checkbox"
                          checked={editProjects.includes(p)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditProjects([...editProjects, p]);
                            } else {
                              setEditProjects(editProjects.filter(proj => proj !== p));
                            }
                          }}
                          className="accent-brand-primary w-3.5 h-3.5 cursor-pointer"
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-4 border-t border-border-card mt-4">
                <button type="button" onClick={() => setShowEditMemberModal(false)} className="py-2 px-4 border border-border-card rounded-[10px] text-xs font-bold text-text-sec hover:bg-bg-base cursor-pointer">Cancel</button>
                <button type="submit" className="py-2 px-4 bg-brand-primary hover:bg-brand-hover text-white rounded-[10px] text-xs font-bold transition-colors cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Project Reports Modal */}
      {showReportsModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-4 sm:p-6 animate-fade-in">
          <div className="w-full max-w-[800px] bg-bg-card border border-border-card rounded-[24px] p-5 sm:p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setShowReportsModal(false)} 
              className="absolute top-4 right-4 p-1.5 text-text-mut hover:text-text-main font-bold cursor-pointer bg-bg-base hover:bg-bg-card rounded-[8px] transition-colors z-10"
            >
              <X size={16} />
            </button>
            
            <div className="flex flex-col items-center justify-center mb-5 border-b border-border-card pb-5 gap-3 flex-shrink-0 relative mt-2">
              <h3 className="font-bold text-xl text-text-main flex items-center justify-center gap-2 text-center w-full">
                <FileText size={20} className="text-brand-primary" />
                Project Reports
              </h3>
              <div className="flex items-center justify-center gap-3 w-full flex-wrap">
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
            
            <div className="overflow-auto pr-2 custom-scrollbar flex-grow">
              <div className="min-w-[500px]">
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
                  {teamMembers.flatMap(m => (m.tasks || []).map(t => ({...t, employeeName: m.name}))).length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-6 text-center text-xs text-text-mut">No tasks found in this project.</td>
                    </tr>
                  ) : (
                    teamMembers.flatMap(m => (m.tasks || []).map(t => ({...t, employeeName: m.name}))).map((task, idx) => (
                      <React.Fragment key={task.id || idx}>
                        <tr className="border-b border-border-card/50">
                          <td className="p-3 text-xs font-bold text-text-main">{task.employeeName}</td>
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
                              {parseFloat(Math.max(0, (task.duration || 0) - calculateTimeSpent(allTaskReports[task.id] || [])).toFixed(1))}h rem
                            </div>
                          </td>
                        </tr>
                        {(!allTaskReports[task.id] || allTaskReports[task.id].length === 0) ? (
                          <tr className="border-b border-border-card">
                            <td colSpan="4" className="p-3 bg-bg-base/30 text-center text-[10px] text-text-mut italic">
                              No updates reported yet
                            </td>
                          </tr>
                        ) : (
                          <tr className="border-b border-border-card">
                            <td colSpan="4" className="p-3 bg-bg-base/30">
                              <div className="pl-4 border-l-2 border-brand-primary/30 space-y-2">
                                {allTaskReports[task.id].filter(r => !r.reportText.startsWith("Worked for") && !r.reportText.startsWith("Auto-stopped")).map(r => (
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
      </div>,
      document.body
    )}

      {showMemberReportsModal && selectedMemberForReports && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-4 sm:p-6 animate-fade-in">
          <div className="w-full max-w-[700px] bg-bg-card border border-border-card rounded-[24px] p-5 sm:p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[90vh]">
            <button 
              onClick={() => { 
                setShowMemberReportsModal(false); 
                setSelectedMemberForReports(null); 
                setMemberFilterDate(""); 
                setMemberFilterMonth(""); 
                setMemberFilterProject("All"); 
              }} 
              className="absolute top-4 right-4 p-1.5 text-text-mut hover:text-text-main font-bold cursor-pointer bg-bg-base hover:bg-bg-card rounded-[8px] transition-colors z-10"
            >
              <X size={16} />
            </button>
            
            <div className="flex flex-col items-center justify-center mb-5 border-b border-border-card pb-5 gap-3 flex-shrink-0 relative mt-2">
              <h3 className="font-bold text-xl text-text-main flex items-center justify-center gap-2 text-center w-full">
                <FileText size={20} className="text-brand-primary" />
                Reports: {selectedMemberForReports.name}
              </h3>
              
              <div className="w-full mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-mut uppercase">Date Filter</label>
                  <input 
                    type="date" 
                    value={memberFilterDate} 
                    onChange={(e) => { setMemberFilterDate(e.target.value); setMemberFilterMonth(""); }}
                    className="w-full px-3 py-2 bg-bg-base border border-border-card rounded-[10px] text-xs text-text-main outline-none focus:border-brand-primary transition-all cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-mut uppercase">Month Filter</label>
                  <input 
                    type="month" 
                    value={memberFilterMonth} 
                    onChange={(e) => { setMemberFilterMonth(e.target.value); setMemberFilterDate(""); }}
                    className="w-full px-3 py-2 bg-bg-base border border-border-card rounded-[10px] text-xs text-text-main outline-none focus:border-brand-primary transition-all cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-mut uppercase">Project Filter</label>
                  <select 
                    value={memberFilterProject} 
                    onChange={(e) => setMemberFilterProject(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-base border border-border-card rounded-[10px] text-xs text-text-main outline-none focus:border-brand-primary transition-all cursor-pointer"
                  >
                    <option value="All">All Projects</option>
                    {Array.from(new Set(selectedMemberForReports.tasks?.map(t => t.project).filter(Boolean))).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 w-full flex-wrap mt-2">
                <button 
                  onClick={handleMemberDownloadPDF}
                  className="py-2 px-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-[10px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download size={14} />
                  <span>Download PDF</span>
                </button>
                <button 
                  onClick={handleMemberDownloadExcel}
                  className="py-2 px-4 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 rounded-[10px] text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download size={14} />
                  <span>Download Excel</span>
                </button>
              </div>
            </div>
            
            <div className="overflow-auto pr-2 custom-scrollbar flex-grow">
              <div className="min-w-[500px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                      <th className="p-3 font-bold w-1/2">Task Title</th>
                      <th className="p-3 font-bold text-center w-auto">Status</th>
                      <th className="p-3 font-bold text-right whitespace-nowrap">Est. / Rem.</th>
                    </tr>
                  </thead>
                  <tbody>
                  {getFilteredMemberTasks().length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-xs text-text-mut">No tasks match the selected filters.</td>
                    </tr>
                  ) : (
                    getFilteredMemberTasks().map((task, idx) => (
                      <React.Fragment key={task.id || idx}>
                        <tr className="border-b border-border-card/50">
                          <td className="p-3 text-xs text-text-main">
                            <div className="font-bold">{task.title}</div>
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
                              {parseFloat(Math.max(0, (task.duration || 0) - calculateTimeSpent(allTaskReports[task.id] || [])).toFixed(1))}h rem
                            </div>
                          </td>
                        </tr>
                        {task.filteredReports.length === 0 ? (
                          <tr className="border-b border-border-card">
                            <td colSpan="3" className="p-3 bg-bg-base/30 text-center text-[10px] text-text-mut italic">
                              No updates reported yet for selected filters
                            </td>
                          </tr>
                        ) : (
                          <tr className="border-b border-border-card">
                            <td colSpan="3" className="p-3 bg-bg-base/30">
                              <div className="pl-4 border-l-2 border-brand-primary/30 space-y-2">
                                {task.filteredReports.map(r => (
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
      </div>,
      document.body
    )}

      {/* Supervisor Remarks Modal */}
      {showRemarksModal && selectedReportForRemarks && createPortal(
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[99999] p-6 animate-fade-in text-left">
          <div className="w-full max-w-[480px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-4 border-b border-border-card pb-4 flex-shrink-0">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <FileText size={20} className="text-brand-primary" />
                <span>Review Daily Activity Log</span>
              </h3>
              <button onClick={() => { setShowRemarksModal(false); setSelectedReportForRemarks(null); }} className="text-text-mut hover:text-text-main font-bold cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveRemarks} className="flex-grow overflow-y-auto pr-1 space-y-4 pb-2 custom-scrollbar">
              <div className="bg-bg-base/50 p-4 rounded-[16px] border border-border-card space-y-2 text-xs">
                <div>
                  <span className="font-bold text-text-sec uppercase block">Employee Name:</span>
                  <span className="text-text-main font-semibold">{selectedReportForRemarks.userName}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-text-sec uppercase block">Date:</span>
                    <span className="text-text-main font-semibold">{selectedReportForRemarks.date} ({selectedReportForRemarks.day})</span>
                  </div>
                  <div>
                    <span className="font-bold text-text-sec uppercase block">Hours Worked:</span>
                    <span className="text-text-main font-semibold">{selectedReportForRemarks.hours} h</span>
                  </div>
                </div>
                <div>
                  <span className="font-bold text-text-sec uppercase block">Tasks Completed:</span>
                  <p className="text-text-main font-semibold mt-1 p-2 bg-bg-card border border-border-card/50 rounded-[8px] whitespace-pre-line">{selectedReportForRemarks.tasksCompleted}</p>
                </div>
                {selectedReportForRemarks.issuesFaced && (
                  <div>
                    <span className="font-bold text-brand-danger uppercase block">Issues Faced:</span>
                    <p className="text-text-main font-semibold mt-1 p-2 bg-bg-card border border-border-card/50 rounded-[8px] whitespace-pre-line">{selectedReportForRemarks.issuesFaced}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec">Status</label>
                <select 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all cursor-pointer"
                  value={remarksStatus}
                  onChange={(e) => setRemarksStatus(e.target.value)}
                >
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec">Supervisor Remarks *</label>
                <textarea 
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all min-h-[100px] resize-none"
                  placeholder="Provide supervisor remarks or feedback..."
                  value={remarksText}
                  onChange={(e) => setRemarksText(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-border-card flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowRemarksModal(false); setSelectedReportForRemarks(null); }}
                  className="py-2.5 px-4 bg-bg-base hover:bg-border-card text-text-sec text-xs font-bold rounded-[12px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] shadow-md shadow-brand-primary/10 transition-colors cursor-pointer"
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

