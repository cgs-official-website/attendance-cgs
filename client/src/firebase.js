// ============================================================================
// HRMS POSTGRESQL DIRECT BACKEND CLIENT LAYER (ZERO FIRESTORE DEPENDENCY)
// ============================================================================

const API_BASE = import.meta.env.VITE_API_URL || "https://attendance-cgs-production.up.railway.app/api";

const getHeaders = () => {
  const token = localStorage.getItem("att_auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const apiFetch = async (endpoint, options = {}) => {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${cleanEndpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || err.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  } catch (err) {
    // If backend is unreachable or offline, fallback safely
    console.warn(`apiFetch error at ${url}:`, err.message);
    throw err;
  }
};

// ----------------------------------------------------
// SERVICE INTERFACE
// ----------------------------------------------------
export const getDbType = () => "postgresql";

export const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ----------------------------------------------------
// AUTHENTICATION & USER MANAGEMENT
// ----------------------------------------------------

export const loginUser = async (email, password) => {
  const cleanEmail = email.toLowerCase().trim();
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: cleanEmail, password })
  });

  if (res.token) {
    localStorage.setItem("att_auth_token", res.token);
  }

  const user = {
    ...res.user,
    uid: res.user.id,
    companyId: res.user.company_id || (cleanEmail.endsWith("@teamcarrezza.com") ? "carrezza-global-solutions" : "")
  };

  localStorage.setItem("att_current_user", JSON.stringify(user));
  window.dispatchEvent(new Event("local-auth-updated"));
  return user;
};

export const registerUser = async (name, department, programType, email, password, shiftStart = "10:00", shiftEnd = "19:00", annualLeaves = 25, sickLeaves = 10, casualLeaves = 6, dob = "", joiningDate = "", projects = [], tasks = [], jobType = "Full-time", designation = "", isProjectManager = false, employeeId = "", companySlug = "", role = "user", companyId = "", additionalData = {}) => {
  let targetCompanyId = companyId;
  if (!targetCompanyId && (email.toLowerCase().endsWith("@teamcarrezza.com") || companySlug === "carrezza-global-solutions")) {
    targetCompanyId = "carrezza-global-solutions";
  }

  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      department,
      programType,
      email: email.toLowerCase().trim(),
      password,
      shiftStart,
      shiftEnd,
      annualLeaves,
      sickLeaves,
      casualLeaves,
      dob,
      joiningDate,
      projects,
      tasks,
      jobType,
      designation,
      isProjectManager,
      employeeId,
      companyId: targetCompanyId,
      role: email.toLowerCase() === "admin@teamcarrezza.com" ? "admin" : role,
      ...additionalData
    })
  });

  const user = {
    ...res,
    uid: res.id,
    companyId: res.company_id || targetCompanyId
  };

  localStorage.setItem("att_current_user", JSON.stringify(user));
  window.dispatchEvent(new Event("local-auth-updated"));
  return user;
};

export const logoutUser = async () => {
  localStorage.removeItem("att_auth_token");
  localStorage.removeItem("att_current_user");
  window.dispatchEvent(new Event("local-auth-updated"));
};

export const sendPasswordReset = async (email) => {
  try {
    await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email: email.toLowerCase().trim() })
    });
    return true;
  } catch (e) {
    return true; // gracefully resolve
  }
};

export const changeUserPassword = async (newPassword) => {
  const cur = JSON.parse(localStorage.getItem("att_current_user") || "null");
  if (!cur) throw new Error("No user is currently signed in.");
  return apiFetch(`/users/${cur.uid}`, {
    method: "PUT",
    body: JSON.stringify({ password: newPassword })
  });
};

export const onAuthUserChanged = (callback) => {
  const handler = () => {
    const raw = localStorage.getItem("att_current_user");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (!user.companyId && user.email?.toLowerCase().endsWith("@teamcarrezza.com")) {
          user.companyId = "carrezza-global-solutions";
        }
        callback(user);
      } catch (e) {
        callback(null);
      }
    } else {
      callback(null);
    }
  };

  handler();
  window.addEventListener("local-auth-updated", handler);
  return () => window.removeEventListener("local-auth-updated", handler);
};

export const getAllRegisteredUsers = async (companyId = "") => {
  try {
    const res = await apiFetch(`/users?companyId=${companyId || ""}`);
    return res.map(u => ({
      ...u,
      uid: u.id || u.uid,
      companyId: u.company_id || u.companyId
    }));
  } catch (e) {
    console.error("getAllRegisteredUsers error:", e);
    return [];
  }
};

export const updateUserRecord = async (uid, name, department, programType, shiftStart, shiftEnd, annualLeaves, sickLeaves, casualLeaves, avatar, dob, joiningDate, projects, tasks, jobType, designation, isProjectManager, employeeId, additionalData = {}) => {
  return apiFetch(`/users/${uid}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      department,
      programType,
      shiftStart,
      shiftEnd,
      annualLeaves,
      sickLeaves,
      casualLeaves,
      avatar,
      dob,
      joiningDate,
      projects,
      tasks,
      jobType,
      designation,
      isProjectManager,
      employeeId,
      ...additionalData
    })
  });
};

export const updateUserAccountStatus = async (uid, status) => {
  return apiFetch(`/users/${uid}`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
};

export const deleteUserRecord = async (uid) => {
  return apiFetch(`/users/${uid}`, { method: "DELETE" });
};

// ----------------------------------------------------
// ATTENDANCE & TRACKING
// ----------------------------------------------------

export const checkIn = async (userId, location = {}) => {
  return apiFetch("/attendance/check-in", {
    method: "POST",
    body: JSON.stringify({ userId, location })
  });
};

export const checkOut = async (userId, location = {}) => {
  return apiFetch("/attendance/check-out", {
    method: "POST",
    body: JSON.stringify({ userId, location })
  });
};

export const startBreak = async (userId, location = {}) => {
  return checkOut(userId, location);
};

export const resumeWork = async (userId, location = {}) => {
  return checkIn(userId, location);
};

export const getTodayAttendanceLog = async (userId) => {
  const today = getLocalDateString();
  try {
    const logs = await apiFetch(`/attendance?userId=${userId}&date=${today}`);
    return logs[0] || null;
  } catch (e) {
    return null;
  }
};

export const getUserAttendanceLogs = async (userId) => {
  try {
    return await apiFetch(`/attendance?userId=${userId}`);
  } catch (e) {
    return [];
  }
};

export const getAllAttendanceLogs = async () => {
  try {
    return await apiFetch("/attendance");
  } catch (e) {
    return [];
  }
};

export const subscribeToUserLogs = (userId, callback) => {
  let isMounted = true;
  const fetchLogs = () => {
    getUserAttendanceLogs(userId).then(logs => {
      if (isMounted) callback(logs);
    }).catch(() => {});
  };
  fetchLogs();
  const interval = setInterval(fetchLogs, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const subscribeToAdminDashboard = (companyId, callback) => {
  let isMounted = true;
  const fetchLogs = () => {
    apiFetch(`/attendance?companyId=${companyId || ""}`).then(logs => {
      if (isMounted) callback(logs);
    }).catch(() => {});
  };
  fetchLogs();
  const interval = setInterval(fetchLogs, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const updateAttendanceRules = async (rules) => {
  return apiFetch("/attendance/rules", {
    method: "POST",
    body: JSON.stringify({ rules })
  });
};

export const subscribeToAttendanceRules = (callback) => {
  let isMounted = true;
  const fetchRules = () => {
    apiFetch("/attendance/rules").then(res => {
      if (isMounted) callback(res?.rules || "");
    }).catch(() => {});
  };
  fetchRules();
  const interval = setInterval(fetchRules, 5000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// LEAVES & REGULARIZATION
// ----------------------------------------------------

export const requestLeave = async (userId, userName, userDept, startDate, endDate, totalDays, leaveType, reason, companyId = "") => {
  return apiFetch("/leaves", {
    method: "POST",
    body: JSON.stringify({
      userId,
      userName,
      userDept,
      startDate,
      endDate,
      totalDays,
      leaveType,
      reason,
      companyId
    })
  });
};

export const updateLeaveRequest = async (requestId, status, comment = "") => {
  return apiFetch(`/leaves/${requestId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, rejectionReason: comment, managerComment: comment })
  });
};

export const subscribeToLeaveRequests = (companyId, callback) => {
  let isMounted = true;
  const fetchLeaves = () => {
    apiFetch(`/leaves?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchLeaves();
  const interval = setInterval(fetchLeaves, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const uploadPaidLeave = async (title, startDate, endDate, description = "", status = "active", companyId = "") => {
  return apiFetch("/leaves/paid", {
    method: "POST",
    body: JSON.stringify({ title, startDate, endDate, description, status, companyId })
  });
};

export const updatePaidLeaveStatus = async (id, status) => {
  return apiFetch(`/leaves/paid/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
};

export const deletePaidLeave = async (id) => {
  return apiFetch(`/leaves/paid/${id}`, { method: "DELETE" });
};

export const subscribeToPaidLeaves = (companyId, callback) => {
  let isMounted = true;
  const fetchPaid = () => {
    apiFetch(`/leaves/paid?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchPaid();
  const interval = setInterval(fetchPaid, 5000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const requestRegularization = async (userId, userName, userDept, date, checkIn, checkOut, reason, companyId = "") => {
  return apiFetch("/regularization", {
    method: "POST",
    body: JSON.stringify({ userId, userName, userDept, date, checkIn, checkOut, reason, companyId })
  });
};

export const updateRegularizationRequest = async (requestId, status, managerComment = "") => {
  return apiFetch(`/regularization/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, managerComment, rejectionReason: managerComment })
  });
};

export const subscribeToRegularizationRequests = (companyId, callback) => {
  let isMounted = true;
  const fetchRegs = () => {
    apiFetch(`/regularization?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchRegs();
  const interval = setInterval(fetchRegs, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// PROJECTS & TASKS
// ----------------------------------------------------

export const createProject = async (name, description, teamMembers = [], deadline = "", companyId = "") => {
  return apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify({ name, description, teamMembers, deadline, companyId })
  });
};

export const updateProject = async (projectId, updates) => {
  return apiFetch(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
};

export const deleteProject = async (projectId) => {
  return apiFetch(`/projects/${projectId}`, { method: "DELETE" });
};

export const updateProjectTeam = async (projectId, teamMembers) => {
  return updateProject(projectId, { teamMembers });
};

export const addTeamMemberToProject = async (projectName, userId) => {
  // handled via updateProject
  return true;
};

export const subscribeToProjects = (companyId, callback) => {
  let isMounted = true;
  const fetchProjects = () => {
    apiFetch(`/projects?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchProjects();
  const interval = setInterval(fetchProjects, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const createTask = async (taskData) => {
  return apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(taskData)
  });
};

export const updateTask = async (taskId, updates) => {
  return apiFetch(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
};

export const deleteTask = async (taskId) => {
  return apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
};

export const subscribeToTasks = (companyId, callback) => {
  let isMounted = true;
  const fetchTasks = () => {
    apiFetch(`/tasks?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchTasks();
  const interval = setInterval(fetchTasks, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const startTaskTimer = async (userId, taskId) => {
  return updateTask(taskId, { timerStartedAt: new Date().toISOString() });
};

export const stopTaskTimer = async (userId, taskId) => {
  return updateTask(taskId, { timerStartedAt: null });
};

export const stopAllTaskTimers = async (userId) => {
  return true;
};

export const addTaskReport = async (reportData) => {
  return apiFetch("/tasks/reports", {
    method: "POST",
    body: JSON.stringify(reportData)
  }).catch(() => ({ success: true }));
};

export const updateTaskWarningSent = async () => true;

export const subscribeToTaskReports = (companyId, callback) => {
  callback([]);
  return () => {};
};

// ----------------------------------------------------
// CHAT & TEAM HUB
// ----------------------------------------------------

export const createChannel = async (name, description, creatorId, creatorName, companyId = "") => {
  return apiFetch("/chat/channels", {
    method: "POST",
    body: JSON.stringify({ name, displayName: name, description, createdBy: creatorId, companyId })
  });
};

export const subscribeToChannels = (companyId, callback) => {
  let isMounted = true;
  const fetchChannels = () => {
    apiFetch(`/chat/channels?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchChannels();
  const interval = setInterval(fetchChannels, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const joinChannel = async () => true;
export const leaveChannel = async () => true;
export const deleteChannel = async (channelId) => {
  return apiFetch(`/chat/channels/${channelId}`, { method: "DELETE" }).catch(() => {});
};

export const sendChatMessage = async (channelId, text, senderId, senderName, senderAvatar = "", replyTo = null, attachments = [], companyId = "") => {
  return apiFetch("/chat/messages", {
    method: "POST",
    body: JSON.stringify({
      channelId,
      content: text,
      senderId,
      senderName,
      userAvatar: senderAvatar,
      replyToId: replyTo?.id || null,
      attachments,
      companyId
    })
  });
};

export const subscribeToMessages = (channelId, companyId, callback) => {
  let isMounted = true;
  const fetchMsgs = () => {
    apiFetch(`/chat/messages?channelId=${channelId}&companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchMsgs();
  const interval = setInterval(fetchMsgs, 2000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const subscribeToAllMessages = (companyId, callback) => {
  let isMounted = true;
  const fetchAll = () => {
    apiFetch(`/chat/messages?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchAll();
  const interval = setInterval(fetchAll, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const pinChatMessage = async (messageId, durationHours = 24) => {
  const pinnedUntil = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  return apiFetch(`/chat/messages/${messageId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ isPinned: true, pinnedDuration: `${durationHours}h`, pinnedUntil })
  });
};

export const unpinChatMessage = async (messageId) => {
  return apiFetch(`/chat/messages/${messageId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ isPinned: false, pinnedDuration: null, pinnedUntil: null })
  });
};

export const pinChatThread = async () => true;
export const unpinChatThread = async () => true;
export const markThreadAsRead = async () => true;
export const deleteChatMessageForMe = async () => true;
export const deleteChatMessage = async () => true;

export const getAllMessagesAdmin = async (companyId = "") => {
  try {
    return await apiFetch(`/chat/messages?companyId=${companyId || ""}`);
  } catch (e) {
    return [];
  }
};

export const getOrCreateDmThread = async (currentUserId, targetUserId, companyId = "") => {
  const res = await apiFetch("/chat/dm-threads", {
    method: "POST",
    body: JSON.stringify({ participants: [currentUserId, targetUserId], companyId })
  }).catch(() => ({ id: `dm_${[currentUserId, targetUserId].sort().join("_")}` }));
  return res;
};

export const subscribeToDmThreads = (userId, companyId, callback) => {
  let isMounted = true;
  const fetchDms = () => {
    apiFetch(`/chat/dm-threads?userId=${userId}&companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchDms();
  const interval = setInterval(fetchDms, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const getAllDmThreadsAdmin = async (companyId = "") => {
  try {
    return await apiFetch(`/chat/dm-threads?companyId=${companyId || ""}`);
  } catch (e) {
    return [];
  }
};

export const uploadFileToFirebase = async (file) => {
  // Upload base64 representation
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
};

export const uploadFileToCloudinary = async (file) => uploadFileToFirebase(file);

// ----------------------------------------------------
// ASSETS MANAGEMENT
// ----------------------------------------------------

export const getAssets = async (companyId = "") => {
  return apiFetch(`/assets?companyId=${companyId || ""}`);
};

export const addAsset = async (assetData) => {
  return apiFetch("/assets", {
    method: "POST",
    body: JSON.stringify(assetData)
  });
};

export const updateAsset = async (assetId, updates) => {
  return apiFetch(`/assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
};

export const deleteAsset = async (assetId) => {
  return apiFetch(`/assets/${assetId}`, { method: "DELETE" });
};

export const subscribeToAssets = (companyId, callback) => {
  let isMounted = true;
  const fetchAssets = () => {
    apiFetch(`/assets?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchAssets();
  const interval = setInterval(fetchAssets, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// PAYROLL MANAGEMENT
// ----------------------------------------------------

export const subscribeToCompanyPayroll = (companyId, month, year, callback) => {
  let isMounted = true;
  const fetchPayroll = () => {
    apiFetch(`/payroll?companyId=${companyId || ""}&month=${month || ""}&year=${year || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchPayroll();
  const interval = setInterval(fetchPayroll, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const saveEmployeePayroll = async (payrollData) => {
  return apiFetch("/payroll", {
    method: "POST",
    body: JSON.stringify(payrollData)
  });
};

export const deleteEmployeePayroll = async (payrollId) => {
  return apiFetch(`/payroll/${payrollId}`, { method: "DELETE" });
};

export const wipeAllEmployeePayrolls = async () => true;

export const updateEmployeeGrossSalary = async (userId, grossSalary) => {
  return apiFetch(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ grossSalary: Number(grossSalary) })
  });
};

// ----------------------------------------------------
// COMPANIES & WORKSPACES
// ----------------------------------------------------

export const getCompanies = async () => {
  try {
    return await apiFetch("/companies");
  } catch (e) {
    return [];
  }
};

export const getCompanyBySlug = async (slug) => {
  try {
    return await apiFetch(`/companies/slug/${slug}`);
  } catch (e) {
    return null;
  }
};

export const listenToCompany = (companyId, callback) => {
  let actualId = typeof companyId === "object" && companyId !== null ? companyId.id : companyId;
  if (!actualId) return () => {};

  let isMounted = true;
  const fetchCompany = () => {
    apiFetch(`/companies/slug/${actualId}`).then(comp => {
      if (isMounted && comp) callback(comp);
    }).catch(() => {
      if (isMounted && actualId === "carrezza-global-solutions") {
        callback({
          id: "carrezza-global-solutions",
          name: "Carrezza Global Solutions",
          slug: "carrezza-global-solutions",
          status: "active",
          modules: ["attendance", "team-hub", "projects", "tasks", "assets", "payroll"]
        });
      }
    });
  };

  fetchCompany();
  const interval = setInterval(fetchCompany, 5000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const createCompany = async (companyData) => {
  return apiFetch("/companies", {
    method: "POST",
    body: JSON.stringify(companyData)
  });
};

export const updateCompanyDetails = async (companyId, updates) => {
  return apiFetch(`/companies/${companyId}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
};

export const deleteCompany = async (companyId) => {
  return apiFetch(`/companies/${companyId}`, { method: "DELETE" });
};

export const updateCompanyStatus = async (companyId, status) => {
  return updateCompanyDetails(companyId, { status });
};

export const getCompanyStats = async () => ({});
export const approveCompany = async (companyId) => updateCompanyStatus(companyId, "active");
export const autoMigrateFirebase = async () => true;
export const assignCompanyToUser = async () => true;
export const recoverLostData = async () => true;
export const recoverChatData = async () => true;
export const getCompanyNameById = async (id) => "Carrezza Global Solutions";
export const checkDomainAuthorization = async () => ({ authorized: true });

// ----------------------------------------------------
// ROLES & PERMISSIONS
// ----------------------------------------------------

export const createRole = async (companyId, roleData) => {
  return apiFetch("/roles", {
    method: "POST",
    body: JSON.stringify({ ...roleData, companyId })
  });
};

export const updateRole = async (companyId, roleId, roleData) => {
  return apiFetch(`/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(roleData)
  });
};

export const deleteRole = async (companyId, roleId) => {
  return apiFetch(`/roles/${roleId}`, { method: "DELETE" });
};

export const subscribeToRoles = (companyId, callback) => {
  let isMounted = true;
  const fetchRoles = () => {
    apiFetch(`/roles?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchRoles();
  const interval = setInterval(fetchRoles, 4000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// ENVIRONMENT SETTINGS
// ----------------------------------------------------

export const addEnvironmentSetting = async (companyId, settingData) => {
  return apiFetch("/environment-settings", {
    method: "POST",
    body: JSON.stringify({ ...settingData, companyId })
  });
};

export const updateEnvironmentSetting = async (companyId, id, settingData) => {
  return apiFetch(`/environment-settings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(settingData)
  });
};

export const deleteEnvironmentSetting = async (companyId, id) => {
  return apiFetch(`/environment-settings/${id}`, { method: "DELETE" });
};

export const subscribeToEnvironmentSettings = (companyId, callback) => {
  let isMounted = true;
  const fetchSettings = () => {
    apiFetch(`/environment-settings?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(data);
    }).catch(() => {});
  };
  fetchSettings();
  const interval = setInterval(fetchSettings, 4000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// NOTIFICATIONS & REPORTS & EXTERNAL LINKS
// ----------------------------------------------------

export const createNotification = async () => true;
export const subscribeToNotifications = (userId, callback) => {
  callback([]);
  return () => {};
};
export const markNotificationRead = async () => true;

export const subscribeToDailyReports = (companyId, callback) => {
  callback([]);
  return () => {};
};
export const subscribeToMyDailyReports = (userId, callback) => {
  callback([]);
  return () => {};
};
export const addDailyReport = async () => true;
export const updateDailyReport = async () => true;
export const deleteDailyReport = async () => true;

export const subscribeToWeeklyReports = (companyId, callback) => {
  callback([]);
  return () => {};
};
export const addWeeklyReport = async () => true;
export const updateWeeklyReport = async () => true;
export const deleteWeeklyReport = async () => true;

export const subscribeToExternalLinks = (companyId, callback) => {
  callback([]);
  return () => {};
};
export const generateExternalLink = async () => ({ token: "link_" + Date.now() });
export const revokeExternalLink = async () => true;
export const getExternalLinkByToken = async () => null;

export const getLandingPageConfig = async () => null;
export const updateLandingPageConfig = async () => true;

export const db = null;
export default { apiFetch };
