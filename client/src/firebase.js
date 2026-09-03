// ============================================================================
// HRMS POSTGRESQL DIRECT BACKEND CLIENT LAYER (ZERO FIRESTORE DEPENDENCY)
// ============================================================================

const PRODUCTION_API_URL = "https://attendance-cgs-production.up.railway.app/api";
const LOCAL_API_URL = "http://localhost:5000/api";

const getHeaders = () => {
  const token = localStorage.getItem("att_auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

// Resilient API Fetch with Local/Railway auto-fallback
export const apiFetch = async (endpoint, options = {}) => {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // Determine candidate URLs
  const candidateUrls = [];
  if (isLocal) {
    candidateUrls.push(`http://localhost:5005/api${cleanEndpoint}`);
    candidateUrls.push(`${LOCAL_API_URL}${cleanEndpoint}`);
  }
  if (import.meta.env.VITE_API_URL) {
    const envBase = import.meta.env.VITE_API_URL.replace(/\/+$/, "");
    candidateUrls.push(`${envBase}${cleanEndpoint}`);
  }
  candidateUrls.push(`${PRODUCTION_API_URL}${cleanEndpoint}`);

  // Remove duplicates
  const uniqueUrls = [...new Set(candidateUrls)];

  let lastError = null;

  for (const url of uniqueUrls) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...getHeaders(),
          ...(options.headers || {})
        }
      });

      if (response.ok) {
        return await response.json();
      }

      const err = await response.json().catch(() => ({ error: response.statusText }));
      const errorMsg = err.error || err.message || `Request failed with status ${response.status}`;

      // If it is an authoritative response (400, 401, 403, 404, 409, 500 from active local server), throw immediately
      if (response.status < 500 || isLocal) {
        throw new Error(errorMsg);
      }

      lastError = new Error(errorMsg);
    } catch (err) {
      if (err.message && !err.message.includes("Failed to fetch") && !err.message.includes("NetworkError") && !err.message.includes("fetch failed")) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to fetch ${endpoint}`);
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
  return apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email: email.toLowerCase().trim() })
  });
};

export const confirmPasswordReset = async (token, newPassword) => {
  return apiFetch("/auth/confirm-reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
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
          user.company_id = "carrezza-global-solutions";
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
    return Array.isArray(res) ? res.map(u => ({
      ...u,
      uid: u.id || u.uid,
      companyId: u.company_id || u.companyId
    })) : [];
  } catch (e) {
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

export const startBreak = async (userId, location = {}) => checkOut(userId, location);
export const resumeWork = async (userId, location = {}) => checkIn(userId, location);

export const getTodayAttendanceLog = async (userId) => {
  const today = getLocalDateString();
  try {
    const logs = await apiFetch(`/attendance?userId=${userId}&date=${today}`);
    return Array.isArray(logs) ? (logs[0] || null) : null;
  } catch (e) {
    return null;
  }
};

export const getUserAttendanceLogs = async (userId) => {
  try {
    const res = await apiFetch(`/attendance?userId=${userId}`);
    return Array.isArray(res) ? res : [];
  } catch (e) {
    return [];
  }
};

export const getAllAttendanceLogs = async () => {
  try {
    const res = await apiFetch("/attendance");
    return Array.isArray(res) ? res : [];
  } catch (e) {
    return [];
  }
};

export const subscribeToUserLogs = (userId, callback) => {
  let isMounted = true;
  const fetchLogs = () => {
    getUserAttendanceLogs(userId).then(logs => {
      if (isMounted) callback(logs);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
      if (isMounted) callback(Array.isArray(logs) ? logs : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
    }).catch(() => {
      if (isMounted) callback("");
    });
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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

export const updateProjectTeam = async (projectId, teamMembers) => updateProject(projectId, { teamMembers });
export const addTeamMemberToProject = async () => true;

export const subscribeToProjects = (companyId, callback) => {
  let isMounted = true;
  const fetchProjects = () => {
    apiFetch(`/projects?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
  };
  fetchTasks();
  const interval = setInterval(fetchTasks, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const startTaskTimer = async (userId, taskId) => updateTask(taskId, { timerStartedAt: new Date().toISOString() });
export const stopTaskTimer = async (userId, taskId) => updateTask(taskId, { timerStartedAt: null });
export const stopAllTaskTimers = async () => true;

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
      if (isMounted) {
        callback(Array.isArray(data) && data.length > 0 ? data : [
          { id: "general", name: "general", displayName: "General", description: "General company discussions", is_private: false }
        ]);
      }
    }).catch(() => {
      if (isMounted) {
        callback([
          { id: "general", name: "general", displayName: "General", description: "General company discussions", is_private: false }
        ]);
      }
    });
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
export const deleteChannel = async (channelId) => apiFetch(`/chat/channels/${channelId}`, { method: "DELETE" }).catch(() => {});

export const sendChatMessage = async (...args) => {
  let channelId, content, senderId, senderName, senderAvatar, attachments, companyId;
  if (typeof args[1] === "string" && (args[1] === "channel" || args[1] === "dm" || typeof args[5] === "string")) {
    // Called with: (threadId, threadType, senderId, senderName, senderAvatar, text, fileData, companyId)
    channelId = args[0];
    senderId = args[2];
    senderName = args[3];
    senderAvatar = args[4];
    content = args[5];
    const fileData = args[6];
    companyId = args[7];
    attachments = fileData ? [fileData] : [];
  } else {
    // Called with: (channelId, text, senderId, senderName, senderAvatar, replyTo, attachments, companyId)
    channelId = args[0];
    content = args[1];
    senderId = args[2];
    senderName = args[3];
    senderAvatar = args[4];
    attachments = args[6] || [];
    companyId = args[7];
  }

  const res = await apiFetch("/chat/messages", {
    method: "POST",
    body: JSON.stringify({
      channelId,
      content,
      senderId,
      senderName,
      userAvatar: senderAvatar,
      attachments,
      companyId
    })
  });

  return res ? {
    ...res,
    text: res.content || res.text || content || "",
    senderAvatar: res.user_avatar || res.senderAvatar || senderAvatar || "",
    fileData: (res.file_url || res.fileUrl) ? {
      url: res.file_url || res.fileUrl,
      name: res.file_name || res.fileName || "Attachment",
      type: res.file_type || res.fileType || ""
    } : (attachments?.[0] || null),
    isPinned: Boolean(res.reactions?.pinned?.isPinned || res.isPinned),
    pinExpiresAt: res.reactions?.pinned?.pinExpiresAt || res.reactions?.pinned?.pinnedUntil || res.pinExpiresAt || null,
    pinDurationDays: res.reactions?.pinned?.pinDurationDays || res.pinDurationDays || null,
    pinnedAt: res.reactions?.pinned?.pinnedAt || res.pinnedAt || null,
    pinnedBy: res.reactions?.pinned?.pinnedBy || res.pinnedBy || null
  } : res;
};

const mapMessageData = (m) => {
  if (!m) return m;
  const pinned = m.reactions?.pinned || {};
  const isPinned = m.isPinned !== undefined ? Boolean(m.isPinned) : Boolean(pinned.isPinned);
  const pinExpiresAt = m.pinExpiresAt || pinned.pinExpiresAt || pinned.pinnedUntil || null;
  const pinDurationDays = m.pinDurationDays || pinned.pinDurationDays || null;
  const pinnedAt = m.pinnedAt || pinned.pinnedAt || null;
  const pinnedBy = m.pinnedBy || pinned.pinnedBy || null;

  return {
    ...m,
    text: m.text ?? m.content ?? "",
    senderAvatar: m.senderAvatar ?? m.user_avatar ?? "",
    fileData: m.fileData || ((m.file_url || m.fileUrl) ? {
      url: m.file_url || m.fileUrl,
      name: m.file_name || m.fileName || "Attachment",
      type: m.file_type || m.fileType || ""
    } : null),
    isPinned,
    pinExpiresAt,
    pinDurationDays,
    pinnedAt,
    pinnedBy
  };
};

export const subscribeToMessages = (channelId, companyIdOrCallback, maybeCallback) => {
  let companyId = "";
  let callback = null;
  if (typeof companyIdOrCallback === "function") {
    callback = companyIdOrCallback;
    companyId = "";
  } else {
    companyId = companyIdOrCallback || "";
    callback = maybeCallback;
  }

  let isMounted = true;
  const fetchMsgs = () => {
    if (!channelId) return;
    apiFetch(`/chat/messages?channelId=${channelId}&companyId=${companyId || ""}`).then(data => {
      if (isMounted && typeof callback === "function") {
        const msgs = Array.isArray(data) ? data.map(mapMessageData) : [];
        callback(msgs);
      }
    }).catch(() => {
      if (isMounted && typeof callback === "function") callback([]);
    });
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
      if (isMounted && typeof callback === "function") {
        const msgs = Array.isArray(data) ? data.map(mapMessageData) : [];
        callback(msgs);
      }
    }).catch(() => {
      if (isMounted && typeof callback === "function") callback([]);
    });
  };
  fetchAll();
  const interval = setInterval(fetchAll, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const pinChatMessage = async (messageId, durationDays = 1, pinnedBy = "", threadId = "") => {
  const days = typeof durationDays === "number" ? durationDays : 1;
  const pinExpiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  return apiFetch(`/chat/messages/${messageId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({
      isPinned: true,
      pinDurationDays: days,
      pinExpiresAt,
      pinnedUntil: pinExpiresAt,
      pinnedBy: pinnedBy || "User",
      pinnedAt: new Date().toISOString()
    })
  });
};

export const unpinChatMessage = async (messageId) => {
  return apiFetch(`/chat/messages/${messageId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({
      isPinned: false,
      pinDurationDays: null,
      pinExpiresAt: null,
      pinnedUntil: null,
      pinnedBy: null,
      pinnedAt: null
    })
  });
};

export const pinChatThread = async () => true;
export const unpinChatThread = async () => true;
export const markThreadAsRead = async () => true;
export const deleteChatMessageForMe = async () => true;
export const deleteChatMessage = async () => true;

export const getAllMessagesAdmin = async (companyId = "") => {
  try {
    const res = await apiFetch(`/chat/messages?companyId=${companyId || ""}`);
    return Array.isArray(res) ? res : [];
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
    const res = await apiFetch(`/chat/dm-threads?companyId=${companyId || ""}`);
    return Array.isArray(res) ? res : [];
  } catch (e) {
    return [];
  }
};

export const uploadFileToFirebase = async (file) => {
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
  try {
    const res = await apiFetch(`/assets?companyId=${companyId || ""}`);
    return Array.isArray(res) ? res : [];
  } catch (e) {
    return [];
  }
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
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

export const deleteEmployeePayroll = async (payrollId) => apiFetch(`/payroll/${payrollId}`, { method: "DELETE" });
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
    const res = await apiFetch("/companies");
    return Array.isArray(res) ? res : [];
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
          modules: ["attendance", "team-hub", "projects", "tasks", "assets", "payroll", "external-links", "roles"]
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

export const deleteCompany = async (companyId) => apiFetch(`/companies/${companyId}`, { method: "DELETE" });
export const updateCompanyStatus = async (companyId, status) => updateCompanyDetails(companyId, { status });

export const getCompanyStats = async () => ({});
export const approveCompany = async (companyId) => updateCompanyStatus(companyId, "active");
export const autoMigrateFirebase = async () => true;
export const assignCompanyToUser = async () => true;
export const recoverLostData = async () => true;
export const recoverChatData = async () => true;
export const getCompanyNameById = async () => "Carrezza Global Solutions";
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

export const deleteRole = async (companyId, roleId) => apiFetch(`/roles/${roleId}`, { method: "DELETE" });

export const subscribeToRoles = (companyId, callback) => {
  let isMounted = true;
  const fetchRoles = () => {
    apiFetch(`/roles?companyId=${companyId || ""}`).then(data => {
      if (isMounted) {
        callback(Array.isArray(data) && data.length > 0 ? data : [
          { id: "role_admin", name: "Admin", permissions: { all: true } },
          { id: "role_employee", name: "Employee", permissions: { attendance: true, leaves: true, teamHub: true, tasks: true } }
        ]);
      }
    }).catch(() => {
      if (isMounted) {
        callback([
          { id: "role_admin", name: "Admin", permissions: { all: true } },
          { id: "role_employee", name: "Employee", permissions: { attendance: true, leaves: true, teamHub: true, tasks: true } }
        ]);
      }
    });
  };
  fetchRoles();
  const interval = setInterval(fetchRoles, 5000);
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

export const deleteEnvironmentSetting = async (companyId, id) => apiFetch(`/environment-settings/${id}`, { method: "DELETE" });

export const subscribeToEnvironmentSettings = (companyId, callback) => {
  let isMounted = true;
  const fetchSettings = () => {
    apiFetch(`/environment-settings?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
  };
  fetchSettings();
  const interval = setInterval(fetchSettings, 5000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

// ----------------------------------------------------
// EXTERNAL LINKS
// ----------------------------------------------------

export const subscribeToExternalLinks = (companyId, callback) => {
  let isMounted = true;
  const fetchLinks = () => {
    apiFetch(`/external-links?companyId=${companyId || ""}`).then(data => {
      if (isMounted) callback(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (isMounted) callback([]);
    });
  };
  fetchLinks();
  const interval = setInterval(fetchLinks, 3000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
};

export const generateExternalLink = async (clientName, clientEmail, projectId, projectName, pmId, pmName, channelId, companyId) => {
  return apiFetch("/external-links", {
    method: "POST",
    body: JSON.stringify({
      clientName,
      clientEmail,
      projectId,
      projectName,
      pmId,
      pmName,
      channelId,
      companyId
    })
  });
};

export const revokeExternalLink = async (linkId, companyId) => {
  return apiFetch(`/external-links/${linkId}/revoke`, {
    method: "PATCH",
    body: JSON.stringify({ companyId })
  });
};

export const getExternalLinkByToken = async (token) => {
  try {
    return await apiFetch(`/external-links/token/${token}`);
  } catch (e) {
    return null;
  }
};

// ----------------------------------------------------
// NOTIFICATIONS & REPORTS
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

export const getLandingPageConfig = async () => null;
export const updateLandingPageConfig = async () => true;

export const db = null;
export default { apiFetch };
