import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext"; // Vite cache bust
import { useToast } from "../context/ToastContext";
import { collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { db, getDbType, createNotification, subscribeToTaskReports } from "../firebase";
import { Search, Plus, Calendar, Clock, Edit2, Trash2, CheckCircle, XCircle, ChevronRight, UserPlus, Users, X, FileText, Download } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

export default function ProjectManagement() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [selectedUserForTeam, setSelectedUserForTeam] = useState("");
  const [adminProjectInput, setAdminProjectInput] = useState("");
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTargetUser, setTaskTargetUser] = useState(null);
  
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState(1);
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);

  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState(null);
  const [editDesignation, setEditDesignation] = useState("");

  const [showReportsModal, setShowReportsModal] = useState(false);
  const [allTaskReports, setAllTaskReports] = useState({});

  useEffect(() => {
    if (!currentUser) return;
    
    if (getDbType() === "firebase") {
      const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
        const users = snapshot.docs.map(d => ({ ...d.data(), uid: d.id }));
        setAllUsers(users);
        
        if (currentUser.role === "admin") {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          setTeamMembers(users.filter(u => u.project === currentUser.project && u.uid !== currentUser.uid));
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
        const users = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
        setAllUsers(users);
        
        if (currentUser.role === "admin") {
          setTeamMembers(users.filter(u => u.role !== "admin"));
        } else {
          setTeamMembers(users.filter(u => u.project === currentUser.project && u.uid !== currentUser.uid));
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
    if (showReportsModal && teamMembers.length > 0) {
      const allTaskIds = teamMembers.flatMap(m => (m.tasks || []).map(t => t.id));
      const unsubs = [];
      const newReports = {};
      
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
  }, [showReportsModal, teamMembers]);

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.text("Project Task Reports", 14, 15);
    
    const tableData = [];
    teamMembers.forEach(m => {
      (m.tasks || []).forEach(t => {
        const status = t.completed ? "Done" : "Active";
        tableData.push([m.name, t.title, status, `${t.duration || 0}h`]);
        
        const reports = allTaskReports[t.id] || [];
        reports.forEach(r => {
          tableData.push(["", `Report: ${r.reportText}`, "", new Date(r.timestamp).toLocaleDateString()]);
        });
      });
    });

    if (tableData.length === 0) {
      showToast("No data to export", "warning");
      return;
    }

    doc.autoTable({
      head: [["Employee", "Task Details", "Status", "Duration/Date"]],
      body: tableData,
      startY: 20,
      styles: { fontSize: 9 },
      columnStyles: { 1: { cellWidth: 90 } }
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
          "Report Detail": "",
          "Report Date": ""
        });
        
        const reports = allTaskReports[t.id] || [];
        reports.forEach(r => {
          tableData.push({
            "Employee": "",
            "Task Title": "",
            "Status": "",
            "Est. Hours": "",
            "Report Detail": r.reportText,
            "Report Date": new Date(r.timestamp).toLocaleString()
          });
        });
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

  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    if (!selectedUserForTeam) return showToast("Please select a user", "warning");
    
    const targetProject = currentUser.role === "admin" ? adminProjectInput : currentUser.project;
    if (!targetProject) return showToast("Please specify a project", "warning");

    try {
      if (getDbType() === "firebase") {
        const updates = { project: targetProject };
        if (currentUser.role === "admin") updates.isProjectManager = true;
        await updateDoc(doc(db, "users", selectedUserForTeam), updates);
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === selectedUserForTeam);
        if (idx !== -1) {
          users[idx].project = targetProject;
          if (currentUser.role === "admin") users[idx].isProjectManager = true;
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      showToast(currentUser.role === "admin" ? "Project assigned successfully" : "Team member added successfully", "success");
      setShowAddTeamModal(false);
      setSelectedUserForTeam("");
      setAdminProjectInput("");
    } catch (err) {
      showToast("Failed to add member", "error");
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Are you sure you want to remove ${member.name} from the project?`)) return;
    
    try {
      if (getDbType() === "firebase") {
        await updateDoc(doc(db, "users", member.uid), { project: "", tasks: [] });
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === member.uid);
        if (idx !== -1) {
          users[idx].project = "";
          users[idx].tasks = [];
          localStorage.setItem("att_users", JSON.stringify(users));
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
      showToast(`${member.name} removed from the project`, "success");
    } catch (err) {
      showToast("Failed to remove member", "error");
    }
  };

  const openEditMemberModal = (member) => {
    setMemberToEdit(member);
    setEditDesignation(member.designation || member.jobType || "");
    setShowEditMemberModal(true);
  };

  const handleSaveMemberEdit = async (e) => {
    e.preventDefault();
    try {
      if (getDbType() === "firebase") {
        await updateDoc(doc(db, "users", memberToEdit.uid), { designation: editDesignation });
      } else {
        const users = JSON.parse(localStorage.getItem("att_users"));
        const idx = users.findIndex(u => u.uid === memberToEdit.uid);
        if (idx !== -1) {
          users[idx].designation = editDesignation;
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
    setEditingTaskIndex(null);
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return showToast("Task title is required", "warning");

    let currentTasks = taskTargetUser.tasks || [];
    
    if (editingTaskIndex !== null) {
      currentTasks[editingTaskIndex] = {
        ...currentTasks[editingTaskIndex],
        title: newTaskTitle,
        duration: newTaskDuration
      };
    } else {
      currentTasks.push({
        id: "task_" + Date.now(),
        title: newTaskTitle,
        duration: newTaskDuration,
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
      setEditingTaskIndex(null);
    } catch (err) {
      showToast("Failed to save task", "error");
    }
  };

  const handleDeleteTask = async (taskIdx) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    
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
  };

  const filteredTeam = teamMembers.filter(m => 
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.designation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const availableUsersToAdd = currentUser?.role === "admin"
    ? allUsers.filter(u => u.uid !== currentUser?.uid && u.role !== "admin")
    : allUsers.filter(u => u.project !== currentUser?.project && u.uid !== currentUser?.uid && u.role !== "admin");

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
              <>Managing Team for: <span className="font-bold text-brand-primary">{currentUser.project || "Unassigned"}</span></>
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
            onClick={() => setShowAddTeamModal(true)}
            className="bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold py-2.5 px-5 rounded-[12px] flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-primary/20 hover:shadow-brand-primary/40 cursor-pointer"
          >
            <UserPlus size={16} />
            <span>{currentUser?.role === "admin" ? "Assign Project" : "Add Team Member"}</span>
          </button>
        </div>
      </div>

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
                filteredTeam.map((member) => {
                  const tasks = member.tasks || [];
                  const completed = tasks.filter(t => t.completed).length;
                  const total = tasks.length;
                  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

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
                            <div className="font-bold text-sm text-text-main">{member.name}</div>
                            <div className="text-[10px] text-text-sec">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      {currentUser?.role === "admin" && (
                        <td className="p-4 text-xs font-medium text-text-main">
                          {member.project ? (
                            <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-[6px]">{member.project}</span>
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
                          {total}
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
      </div>

      {/* Add Team Member Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
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
                  <label className="text-xs font-bold text-text-sec">Project Name</label>
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
                <button type="submit" disabled={!selectedUserForTeam || (currentUser?.role === "admin" && !adminProjectInput)} className="py-2 px-4 bg-brand-primary hover:bg-brand-hover text-white rounded-[10px] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50">
                  {currentUser?.role === "admin" ? "Assign Project" : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Tasks Modal */}
      {showTaskModal && taskTargetUser && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-text-sec">Duration (Hours)</label>
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
                        onClick={() => { setEditingTaskIndex(null); setNewTaskTitle(""); setNewTaskDuration(1); }}
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
        </div>
      )}

      {/* Edit Team Member Modal */}
      {showEditMemberModal && memberToEdit && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
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
              <div className="flex justify-end gap-3 pt-4 border-t border-border-card mt-4">
                <button type="button" onClick={() => setShowEditMemberModal(false)} className="py-2 px-4 border border-border-card rounded-[10px] text-xs font-bold text-text-sec hover:bg-bg-base cursor-pointer">Cancel</button>
                <button type="submit" className="py-2 px-4 bg-brand-primary hover:bg-brand-hover text-white rounded-[10px] text-xs font-bold transition-colors cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Reports Modal */}
      {showReportsModal && (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/65 backdrop-blur-[12px] flex items-center justify-center z-[1000] p-6 animate-fade-in">
          <div className="w-full max-w-[800px] bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl animate-scale-up relative overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-border-card pb-4 gap-4 flex-shrink-0">
              <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                <FileText size={18} className="text-brand-primary" />
                Project Reports
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
                <button onClick={() => setShowReportsModal(false)} className="p-1.5 text-text-mut hover:text-text-main font-bold cursor-pointer bg-bg-base rounded-[8px]"><X size={16} /></button>
              </div>
            </div>
            
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-grow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-base/50 text-[10px] uppercase tracking-wider text-text-mut border-b border-border-card">
                    <th className="p-3 font-bold">Employee</th>
                    <th className="p-3 font-bold">Task Title</th>
                    <th className="p-3 font-bold">Status</th>
                    <th className="p-3 font-bold text-right">Est. Hours</th>
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
                          <td className="p-3 text-xs text-text-main">{task.title}</td>
                          <td className="p-3 text-xs">
                            {task.completed ? (
                              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-[6px]">Done</span>
                            ) : (
                              <span className="text-brand-primary font-bold bg-brand-primary/10 px-2 py-0.5 rounded-[6px]">Active</span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-right font-medium text-text-sec">{task.duration}h</td>
                        </tr>
                        {allTaskReports[task.id] && allTaskReports[task.id].length > 0 && (
                          <tr className="border-b border-border-card">
                            <td colSpan="4" className="p-3 bg-bg-base/30">
                              <div className="pl-4 border-l-2 border-brand-primary/30 space-y-2">
                                {allTaskReports[task.id].map(r => (
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
