import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocs,
  serverTimestamp,
  deleteDoc,
  limit,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { getDownloadURL, uploadBytesResumable, ref as storageRef, deleteObject } from "firebase/storage";
import { getStorage } from "firebase/storage";
import { uploadFileToB2, isB2Configured } from "./utils/b2Storage";

// Firebase Configuration
// Replace these with your actual Firebase project settings
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if credentials are still placeholder
const isDummy = 
  !firebaseConfig.apiKey || 
  firebaseConfig.apiKey === "" || 
  firebaseConfig.apiKey.includes("YOUR_") || 
  !firebaseConfig.projectId ||
  firebaseConfig.projectId.includes("YOUR_");

let app, auth, db, dbType, storage;

if (!isDummy) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    dbType = "firebase";
    console.log("Firebase initialized successfully in production mode.");
  } catch (error) {
    console.error("Firebase initialization failed, falling back to Local Simulation Mode:", error);
    dbType = "local";
  }
} else {
  dbType = "local";
  console.log("Running in Local Simulation Mode. Replace config in src/firebase.js to connect to Live Firebase.");
}


// ----------------------------------------------------
// LOCAL SIMULATION ENGINE (localStorage based)
// ----------------------------------------------------
const localDb = {
  getUsers: () => {
    const users = localStorage.getItem("att_users");
    const parsed = users ? JSON.parse(users) : [];
    // Ensure admin user exists
    if (!parsed.some(u => u.email === "admin@teamcarrezza.com")) {
      parsed.push({
        uid: "admin-uid-12345",
        name: "Super Admin",
        email: "admin@teamcarrezza.com",
        department: "Administration",
        programType: "Internship",
        role: "admin",
        createdAt: new Date().toISOString()
      });
      localStorage.setItem("att_users", JSON.stringify(parsed));
    }
    return parsed;
  },
  
  saveUser: (user) => {
    const users = localDb.getUsers();
    users.push(user);
    localStorage.setItem("att_users", JSON.stringify(users));
  },
  
  getAttendance: () => {
    const logs = localStorage.getItem("att_logs");
    return logs ? JSON.parse(logs) : [];
  },
  
  saveAttendance: (logs) => {
    localStorage.setItem("att_logs", JSON.stringify(logs));
  },

  getCurrentUser: () => {
    const cur = localStorage.getItem("att_current_user");
    return cur ? JSON.parse(cur) : null;
  },

  setCurrentUser: (user) => {
    if (user) {
      localStorage.setItem("att_current_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("att_current_user");
    }
  }
};

// Seed admin user in Local DB on load
if (dbType === "local") {
  localDb.getUsers();
}

// Subscriptions storage for simulation
const authListeners = new Set();
const attendanceListeners = new Set();
const noticeListeners = new Set();

// Helper to notify simulation listeners
const notifyAuthListeners = (user) => {
  authListeners.forEach(cb => cb(user));
};
const notifyAttendanceListeners = () => {
  attendanceListeners.forEach(cb => cb(localDb.getAttendance()));
};
const notifyNoticeListeners = () => {
  noticeListeners.forEach(cb => cb());
};

// ----------------------------------------------------
// SERVICE INTERFACE (Differentiates between Real Firebase & Simulation)
// ----------------------------------------------------

export const getDbType = () => dbType;

/**
 * Register a new user
 */
export const registerUser = async (name, department, programType, email, password, shiftStart = "10:00", shiftEnd = "19:00", annualLeaves = 25, sickLeaves = 10, casualLeaves = 6, dob = "", joiningDate = "", project = "", tasks = [], jobType = "Full-time", designation = "", isProjectManager = false, employeeId = "") => {
  const role = email.toLowerCase() === "admin@teamcarrezza.com" ? "admin" : "user";
  
  if (dbType === "firebase") {
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') throw new Error("Email is already registered. Please log in instead.");
      if (error.code === 'auth/invalid-email') throw new Error("Please enter a valid email address.");
      if (error.code === 'auth/weak-password') throw new Error("Password must be at least 6 characters long.");
      throw new Error("Failed to register. Please try again.");
    }
    const user = userCredential.user;
    
    // Fallback: update display name in Auth so it is always present
    try {
      await updateProfile(user, { displayName: name });
    } catch (e) {
      console.warn("Failed to set displayName on auth user:", e);
    }
    
    // Save additional details in Firestore
    const userData = {
      uid: user.uid,
      name,
      department,
      programType,
      email: email.toLowerCase(),
      role,
      shiftStart,
      shiftEnd,
      annualLeaves: Number(annualLeaves),
      sickLeaves: Number(sickLeaves),
      casualLeaves: Number(casualLeaves),
      createdAt: new Date().toISOString(),
      dob,
      joiningDate,
      project,
      tasks,
      jobType,
      designation,
      isProjectManager,
      employeeId
    };
    
    await setDoc(doc(db, "users", user.uid), userData);
    return userData;
  } else {
    // Local DB Mode
    const users = localDb.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Email already registered");
    }
    
    const newUser = {
      uid: "user_" + Math.random().toString(36).substr(2, 9),
      name,
      department,
      programType,
      email: email.toLowerCase(),
      role,
      shiftStart,
      shiftEnd,
      annualLeaves: Number(annualLeaves),
      sickLeaves: Number(sickLeaves),
      casualLeaves: Number(casualLeaves),
      createdAt: new Date().toISOString(),
      dob,
      joiningDate,
      project,
      tasks,
      jobType,
      designation,
      isProjectManager,
      employeeId,
      password // storing hashed or plain in local storage for local verification
    };
    
    localDb.saveUser(newUser);
    localDb.setCurrentUser(newUser);
    notifyAuthListeners(newUser);
    return newUser;
  }
};

/**
 * Log in a user
 */
export const loginUser = async (email, password) => {
  const cleanEmail = email.toLowerCase();
  const role = cleanEmail === "admin@teamcarrezza.com" ? "admin" : "user";
  

  
  if (dbType === "firebase") {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;
      
      // Fetch profile from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        return userDoc.data();
      } else {
        const userData = {
          uid: user.uid,
          name: cleanEmail === "admin@teamcarrezza.com" ? "Super Admin" : user.displayName || "User",
          department: cleanEmail === "admin@teamcarrezza.com" ? "Administration" : "Unknown",
          programType: "Internship",
          email: cleanEmail,
          role,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, "users", user.uid), userData);
        return userData;
      }
    } catch (error) {
      // Intercept admin@teamcarrezza.com / 12345678 failure to auto-create on first run
      if (cleanEmail === "admin@teamcarrezza.com" && password === "12345678" && 
          (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found")) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          const user = userCredential.user;
          const userData = {
            uid: user.uid,
            name: "Super Admin",
            department: "Administration",
            programType: "Internship",
            email: cleanEmail,
            role: "admin",
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, "users", user.uid), userData);
          return userData;
        } catch (createErr) {
          throw error; // Throw original sign in error if creation fails (e.g. email exists but password was wrong)
        }
      }
      throw error;
    }
  } else {
    // Local DB Mode
    const users = localDb.getUsers();
    
    // Default admin checks
    if (cleanEmail === "admin@teamcarrezza.com" && password === "12345678") {
      const adminUser = users.find(u => u.email === "admin@teamcarrezza.com");
      localDb.setCurrentUser(adminUser);
      notifyAuthListeners(adminUser);
      return adminUser;
    }
    
    const foundUser = users.find(u => u.email === cleanEmail && u.password === password);
    if (!foundUser) {
      throw new Error("Invalid email or password");
    }
    
    localDb.setCurrentUser(foundUser);
    notifyAuthListeners(foundUser);
    return foundUser;
  }
};

/**
 * Log out user
 */
export const logoutUser = async () => {
  if (dbType === "firebase") {
    await signOut(auth);
  } else {
    localDb.setCurrentUser(null);
    notifyAuthListeners(null);
  }
};

/**
 * Subscribe to authentication state changes
 */
export const onAuthUserChanged = (callback) => {
  if (dbType === "firebase") {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch Firestore profile
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          callback(userDoc.data());
        } else {
          // Default fallbacks and automatic profile synchronization
          const role = firebaseUser.email === "admin@teamcarrezza.com" ? "admin" : "user";
          const fallbackData = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email.split("@")[0] || "User",
            email: firebaseUser.email,
            role,
            department: "Engineering",
            programType: "Internship",
            createdAt: new Date().toISOString()
          };
          
          // Auto-sync write to Firestore
          setDoc(doc(db, "users", firebaseUser.uid), fallbackData)
            .then(() => {
              console.log("Auto-synchronized missing Firestore user profile document.");
            })
            .catch((err) => {
              console.warn("Could not auto-synchronize missing user document:", err);
            });

          callback(fallbackData);
        }
      } else {
        callback(null);
      }
    });
  } else {
    authListeners.add(callback);
    // Initial trigger
    const cur = localDb.getCurrentUser();
    callback(cur);
    return () => {
      authListeners.delete(callback);
    };
  }
};

// ----------------------------------------------------
// ATTENDANCE LOGS ACTIONS
// ----------------------------------------------------

// Calculate current date string locally
const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Check In
 */
export const checkIn = async (user, location) => {
  const dateStr = getLocalDateString();
  
  let checkInDate = new Date();
  if (user && user.shiftStart) {
    const [shiftH, shiftM] = user.shiftStart.split(":").map(Number);
    const shiftStartToday = new Date();
    shiftStartToday.setHours(shiftH, shiftM, 0, 0);
    
    const shiftStartPlusOneHour = new Date(shiftStartToday.getTime() + 60 * 60 * 1000);
    
    if (checkInDate >= shiftStartToday && checkInDate <= shiftStartPlusOneHour) {
      checkInDate = shiftStartToday;
    }
  }
  const timeStr = checkInDate.toISOString();
  
  const recordId = `${user.uid}_${dateStr}`;
  const data = {
    id: recordId,
    userId: user.uid,
    userName: user.name,
    userDept: user.department,
    programType: user.programType,
    date: dateStr,
    checkInTime: timeStr,
    checkInLocation: location,
    checkOutTime: null,
    checkOutLocation: null,
    status: "checked-in",
    breaks: [],
    totalWorkingMinutes: 0,
    shortBreakBalance: 1800, // 30 mins in seconds
    longBreakBalance: 1800   // 30 mins in seconds
  };

  if (dbType === "firebase") {
    // Check if document already exists
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().checkInTime) {
      throw new Error("You have already checked in today.");
    }
    await setDoc(docRef, data);
    return data;
  } else {
    const logs = localDb.getAttendance();
    if (logs.some(log => log.userId === user.uid && log.date === dateStr)) {
      throw new Error("You have already checked in today.");
    }
    logs.push(data);
    localDb.saveAttendance(logs);
    notifyAttendanceListeners();
    return data;
  }
};

/**
 * Check Out
 */
export const checkOut = async (userId, location) => {
  const dateStr = getLocalDateString();
  const recordId = `${userId}_${dateStr}`;
  const timeStr = new Date().toISOString();

  if (dbType === "firebase") {
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error("No check-in record found for today.");
    }
    
    const currentData = docSnap.data();
    if (currentData.checkOutTime) {
      throw new Error("You have already checked out today.");
    }
    
    // If user is on break, resume first or close break
    let updatedBreaks = [...(currentData.breaks || [])];
    let status = "checked-out";
    if (currentData.status === "on-break") {
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
      if (activeBreakIndex !== -1) {
        updatedBreaks[activeBreakIndex].resumeTime = timeStr;
        updatedBreaks[activeBreakIndex].resumeLocation = location;
      }
    }
    
    // Calculate total working minutes
    const workingMinutes = calculateWorkingMinutes(currentData.checkInTime, timeStr, updatedBreaks);
    
    const updates = {
      checkOutTime: timeStr,
      checkOutLocation: location,
      status: "checked-out",
      breaks: updatedBreaks,
      totalWorkingMinutes: workingMinutes
    };
    
    await updateDoc(docRef, updates);
    return { ...currentData, ...updates };
  } else {
    const logs = localDb.getAttendance();
    const logIndex = logs.findIndex(log => log.id === recordId);
    
    if (logIndex === -1) {
      throw new Error("No check-in record found for today.");
    }
    
    const currentData = logs[logIndex];
    if (currentData.checkOutTime) {
      throw new Error("You have already checked out today.");
    }
    
    let updatedBreaks = [...(currentData.breaks || [])];
    if (currentData.status === "on-break") {
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
      if (activeBreakIndex !== -1) {
        updatedBreaks[activeBreakIndex].resumeTime = timeStr;
        updatedBreaks[activeBreakIndex].resumeLocation = location;
      }
    }
    
    const workingMinutes = calculateWorkingMinutes(currentData.checkInTime, timeStr, updatedBreaks);
    
    logs[logIndex] = {
      ...currentData,
      checkOutTime: timeStr,
      checkOutLocation: location,
      status: "checked-out",
      breaks: updatedBreaks,
      totalWorkingMinutes: workingMinutes
    };
    
    localDb.saveAttendance(logs);
    notifyAttendanceListeners();
    return logs[logIndex];
  }
};

/**
 * Start Break
 * breakType: 'short' (20 mins) | 'long' (40 mins)
 */
export const startBreak = async (userId, breakType, location) => {
  const dateStr = getLocalDateString();
  const recordId = `${userId}_${dateStr}`;
  const startTimeStr = new Date().toISOString();

  if (dbType === "firebase") {
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error("No active attendance record to start a break.");
    }
    
    const currentData = docSnap.data();
    if (currentData.status !== "checked-in") {
      throw new Error("Must be checked in to start a break.");
    }

    const balance = breakType === "short"
      ? (currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800)
      : (currentData.longBreakBalance !== undefined ? currentData.longBreakBalance : 1800);

    if (balance <= 0) {
      throw new Error(`You have no remaining balance for today's ${breakType} break.`);
    }

    const endTimeStr = new Date(new Date(startTimeStr).getTime() + balance * 1000).toISOString();
    
    const newBreak = {
      type: breakType,
      startTime: startTimeStr,
      startLocation: location,
      resumeTime: null,
      resumeLocation: null,
      initialBalance: balance
    };
    
    const updatedBreaks = [...(currentData.breaks || []), newBreak];
    const updates = {
      status: "on-break",
      breaks: updatedBreaks,
      currentBreakTimerEnd: endTimeStr
    };
    
    await updateDoc(docRef, updates);
    return { ...currentData, ...updates };
  } else {
    const logs = localDb.getAttendance();
    const logIndex = logs.findIndex(log => log.id === recordId);
    
    if (logIndex === -1) {
      throw new Error("No active attendance record to start a break.");
    }
    
    const currentData = logs[logIndex];
    if (currentData.status !== "checked-in") {
      throw new Error("Must be checked in to start a break.");
    }

    const balance = breakType === "short"
      ? (currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800)
      : (currentData.longBreakBalance !== undefined ? currentData.longBreakBalance : 1800);

    if (balance <= 0) {
      throw new Error(`You have no remaining balance for today's ${breakType} break.`);
    }

    const endTimeStr = new Date(new Date(startTimeStr).getTime() + balance * 1000).toISOString();
    
    const newBreak = {
      type: breakType,
      startTime: startTimeStr,
      startLocation: location,
      resumeTime: null,
      resumeLocation: null,
      initialBalance: balance
    };
    
    const updatedBreaks = [...(currentData.breaks || []), newBreak];
    logs[logIndex] = {
      ...currentData,
      status: "on-break",
      breaks: updatedBreaks,
      currentBreakTimerEnd: endTimeStr
    };
    
    localDb.saveAttendance(logs);
    notifyAttendanceListeners();
    return logs[logIndex];
  }
};

/**
 * Resume Work
 */
export const resumeWork = async (userId, location) => {
  const dateStr = getLocalDateString();
  const recordId = `${userId}_${dateStr}`;
  const timeStr = new Date().toISOString();

  if (dbType === "firebase") {
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error("No active attendance record found.");
    }
    
    const currentData = docSnap.data();
    if (currentData.status !== "on-break") {
      throw new Error("You are not currently on a break.");
    }
    
    const updatedBreaks = [...(currentData.breaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
    
    if (activeBreakIndex === -1) {
      throw new Error("No active break record found.");
    }
    
    const activeBreak = updatedBreaks[activeBreakIndex];
    activeBreak.resumeTime = timeStr;
    activeBreak.resumeLocation = location;

    const durationSeconds = Math.max(0, Math.floor((new Date(timeStr).getTime() - new Date(activeBreak.startTime).getTime()) / 1000));
    activeBreak.duration = Math.round(durationSeconds / 60);
    activeBreak.durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));

    let newShortBalance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    let newLongBalance = currentData.longBreakBalance !== undefined ? currentData.longBreakBalance : 1800;

    if (activeBreak.type === "short") {
      newShortBalance = Math.max(0, newShortBalance - durationSeconds);
    } else {
      newLongBalance = Math.max(0, newLongBalance - durationSeconds);
    }
    
    const updates = {
      status: "checked-in",
      breaks: updatedBreaks,
      currentBreakTimerEnd: null,
      shortBreakBalance: newShortBalance,
      longBreakBalance: newLongBalance
    };
    
    await updateDoc(docRef, updates);
    return { ...currentData, ...updates };
  } else {
    const logs = localDb.getAttendance();
    const logIndex = logs.findIndex(log => log.id === recordId);
    
    if (logIndex === -1) {
      throw new Error("No active attendance record found.");
    }
    
    const currentData = logs[logIndex];
    if (currentData.status !== "on-break") {
      throw new Error("You are not currently on a break.");
    }
    
    const updatedBreaks = [...(currentData.breaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
    
    if (activeBreakIndex === -1) {
      throw new Error("No active break record found.");
    }
    
    const activeBreak = updatedBreaks[activeBreakIndex];
    activeBreak.resumeTime = timeStr;
    activeBreak.resumeLocation = location;

    const durationSeconds = Math.max(0, Math.floor((new Date(timeStr).getTime() - new Date(activeBreak.startTime).getTime()) / 1000));
    activeBreak.duration = Math.round(durationSeconds / 60);
    activeBreak.durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));

    let newShortBalance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    let newLongBalance = currentData.longBreakBalance !== undefined ? currentData.longBreakBalance : 1800;

    if (activeBreak.type === "short") {
      newShortBalance = Math.max(0, newShortBalance - durationSeconds);
    } else {
      newLongBalance = Math.max(0, newLongBalance - durationSeconds);
    }
    
    logs[logIndex] = {
      ...currentData,
      status: "checked-in",
      breaks: updatedBreaks,
      currentBreakTimerEnd: null,
      shortBreakBalance: newShortBalance,
      longBreakBalance: newLongBalance
    };
    
    localDb.saveAttendance(logs);
    notifyAttendanceListeners();
    return logs[logIndex];
  }
};

/**
 * Get Today's Log for a User
 */
export const getTodayAttendanceLog = async (userId) => {
  const dateStr = getLocalDateString();
  const recordId = `${userId}_${dateStr}`;
  
  if (dbType === "firebase") {
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } else {
    const logs = localDb.getAttendance();
    return logs.find(log => log.id === recordId) || null;
  }
};

/**
 * Get All Logs for a specific User
 */
export const getUserAttendanceLogs = async (userId) => {
  if (dbType === "firebase") {
    const qRef = query(
      collection(db, "attendance"), 
      where("userId", "==", userId),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(qRef);
    return snapshot.docs.map(doc => doc.data());
  } else {
    return localDb.getAttendance()
      .filter(log => log.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
};

/**
 * Get All Registered Users (Admin only)
 */
export const getAllRegisteredUsers = async () => {
  if (dbType === "firebase") {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map(doc => doc.data());
  } else {
    return localDb.getUsers();
  }
};

/**
 * Update a user record (Admin edit user)
 */
export const updateUserRecord = async (uid, name, department, programType, shiftStart, shiftEnd, annualLeaves, sickLeaves, casualLeaves, avatar, dob, joiningDate, project, tasks, jobType, designation, isProjectManager, employeeId) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "users", uid);
    const updates = {
      name,
      department,
      programType,
      shiftStart,
      shiftEnd,
      annualLeaves: Number(annualLeaves),
      sickLeaves: Number(sickLeaves),
      casualLeaves: Number(casualLeaves)
    };
    if (avatar !== undefined) updates.avatar = avatar;
    if (dob !== undefined) updates.dob = dob;
    if (joiningDate !== undefined) updates.joiningDate = joiningDate;
    if (project !== undefined) updates.project = project;
    if (tasks !== undefined) updates.tasks = tasks;
    if (jobType !== undefined) updates.jobType = jobType;
    if (designation !== undefined) updates.designation = designation;
    if (isProjectManager !== undefined) updates.isProjectManager = isProjectManager;
    if (employeeId !== undefined) updates.employeeId = employeeId;
    await updateDoc(docRef, updates);
  } else {
    const users = localDb.getUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx !== -1) {
      const updatedData = {
        ...users[idx],
        name,
        department,
        programType,
        shiftStart,
        shiftEnd,
        annualLeaves: Number(annualLeaves),
        sickLeaves: Number(sickLeaves),
        casualLeaves: Number(casualLeaves)
      };
      if (avatar !== undefined) updatedData.avatar = avatar;
      if (dob !== undefined) updatedData.dob = dob;
      if (joiningDate !== undefined) updatedData.joiningDate = joiningDate;
      if (project !== undefined) updatedData.project = project;
      if (tasks !== undefined) updatedData.tasks = tasks;
      if (jobType !== undefined) updatedData.jobType = jobType;
      if (designation !== undefined) updatedData.designation = designation;
      if (isProjectManager !== undefined) updatedData.isProjectManager = isProjectManager;
      if (employeeId !== undefined) updatedData.employeeId = employeeId;
      users[idx] = updatedData;
      localStorage.setItem("att_users", JSON.stringify(users));
      
      // Update local storage current user profile if currently logged in user is updated
      const cur = localDb.getCurrentUser();
      if (cur && cur.uid === uid) {
        const updatedUser = { 
          ...cur, 
          name, 
          department, 
          programType, 
          shiftStart, 
          shiftEnd, 
          annualLeaves: Number(annualLeaves), 
          sickLeaves: Number(sickLeaves), 
          casualLeaves: Number(casualLeaves) 
        };
        if (avatar !== undefined) updatedUser.avatar = avatar;
        if (dob !== undefined) updatedUser.dob = dob;
        if (joiningDate !== undefined) updatedUser.joiningDate = joiningDate;
        if (project !== undefined) updatedUser.project = project;
        if (tasks !== undefined) updatedUser.tasks = tasks;
        if (jobType !== undefined) updatedUser.jobType = jobType;
        if (designation !== undefined) updatedUser.designation = designation;
        if (isProjectManager !== undefined) updatedUser.isProjectManager = isProjectManager;
        localDb.setCurrentUser(updatedUser);
        notifyAuthListeners(updatedUser);
      }
    }
  }
};

/**
 * Delete a user record (Admin delete user)
 */
export const deleteUserRecord = async (uid) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "users", uid);
    await deleteDoc(docRef);
  } else {
    const users = localDb.getUsers();
    const filtered = users.filter(u => u.uid !== uid);
    localStorage.setItem("att_users", JSON.stringify(filtered));
  }
};

/**
 * Get All Attendance Logs (Admin only)
 */
export const getAllAttendanceLogs = async () => {
  if (dbType === "firebase") {
    const snapshot = await getDocs(query(collection(db, "attendance"), orderBy("date", "desc")));
    return snapshot.docs.map(doc => doc.data());
  } else {
    return localDb.getAttendance().sort((a, b) => b.date.localeCompare(a.date));
  }
};

/**
 * Real-time listener for user attendance logs (User view)
 */
export const subscribeToUserLogs = (userId, callback) => {
  if (dbType === "firebase") {
    const qRef = query(
      collection(db, "attendance"), 
      where("userId", "==", userId)
    );
    return onSnapshot(qRef, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      // Sort in js to avoid index creation issue
      logs.sort((a, b) => b.date.localeCompare(a.date));
      callback(logs);
    });
  } else {
    const handler = () => {
      const logs = localDb.getAttendance()
        .filter(log => log.userId === userId)
        .sort((a, b) => b.date.localeCompare(a.date));
      callback(logs);
    };
    attendanceListeners.add(handler);
    handler(); // initial fire
    return () => {
      attendanceListeners.delete(handler);
    };
  }
};

/**
 * Real-time listener for ALL logs and user statuses (Admin dashboard)
 */
export const subscribeToAdminDashboard = (callback) => {
  if (dbType === "firebase") {
    const attCollection = collection(db, "attendance");
    return onSnapshot(attCollection, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      logs.sort((a, b) => b.date.localeCompare(a.date));
      callback(logs);
    });
  } else {
    const handler = () => {
      const logs = localDb.getAttendance().sort((a, b) => b.date.localeCompare(a.date));
      callback(logs);
    };
    attendanceListeners.add(handler);
    handler(); // initial fire
    return () => {
      attendanceListeners.delete(handler);
    };
  }
};

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------

/**
 * Calculate active working minutes
 * (Total checkout - checkin) minus sum of all breaks durations (start to resume time)
 */
function calculateWorkingMinutes(checkInTime, checkOutTime, breaks) {
  const checkInDate = new Date(checkInTime);
  const checkOutDate = new Date(checkOutTime);
  let diffMs = checkOutDate.getTime() - checkInDate.getTime();
  
  // If the user forgets to check out and the elapsed time exceeds 9 hours,
  // automatically record exactly 8 hours of working time.
  if (diffMs > 9 * 60 * 60 * 1000) {
    return 480; // 8 hours in minutes
  }
  
  let breakMs = 0;
  if (breaks && breaks.length > 0) {
    breaks.forEach(b => {
      if (b.startTime) {
        const start = new Date(b.startTime);
        const end = b.resumeTime ? new Date(b.resumeTime) : new Date(checkOutTime);
        breakMs += (end.getTime() - start.getTime());
      }
    });
  }
  
  const workingMs = diffMs - breakMs;
  return Math.max(0, parseFloat((workingMs / 60000).toFixed(1)));
}

// ----------------------------------------------------
// DYNAMIC LEAVE REQUESTS, PAID LEAVES, AND RULES APIs
// ----------------------------------------------------

// 1. Paid Leaves Announcements
export const uploadPaidLeave = async (title, startDate, endDate, description, status = "active") => {
  const newLeave = {
    id: dbType === "firebase" ? "" : "pl-" + Math.random().toString(36).substr(2, 9),
    title,
    startDate,
    endDate,
    status,
    description,
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "paid_leaves"), newLeave);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_paid_leaves") 
      ? JSON.parse(localStorage.getItem("att_paid_leaves")) 
      : [];
    current.push(newLeave);
    localStorage.setItem("att_paid_leaves", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

export const updatePaidLeaveStatus = async (id, status) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "paid_leaves", id), { status });
  } else {
    const current = localStorage.getItem("att_paid_leaves") 
      ? JSON.parse(localStorage.getItem("att_paid_leaves")) 
      : [];
    const index = current.findIndex(item => item.id === id);
    if (index !== -1) {
      current[index].status = status;
      localStorage.setItem("att_paid_leaves", JSON.stringify(current));
      notifyNoticeListeners();
    }
  }
};

export const deletePaidLeave = async (id) => {
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "paid_leaves", id));
  } else {
    const current = localStorage.getItem("att_paid_leaves") 
      ? JSON.parse(localStorage.getItem("att_paid_leaves")) 
      : [];
    const filtered = current.filter(item => item.id !== id);
    localStorage.setItem("att_paid_leaves", JSON.stringify(filtered));
    notifyNoticeListeners();
  }
};

export const subscribeToPaidLeaves = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(collection(db, "paid_leaves"), (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      const list = localStorage.getItem("att_paid_leaves")
        ? JSON.parse(localStorage.getItem("att_paid_leaves"))
        : [
            { id: "pl-default-1", title: "New Year Paid Holiday", startDate: "2026-01-01", endDate: "2026-01-01", status: "active", description: "Official paid leave for New Year Day celebration.", createdAt: new Date().toISOString() }
          ];
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

// 2. Attendance Rules
export const updateAttendanceRules = async (rulesText) => {
  if (dbType === "firebase") {
    await setDoc(doc(db, "settings", "attendance_rules"), { rules: rulesText, updatedAt: new Date().toISOString() });
  } else {
    localStorage.setItem("att_attendance_rules", JSON.stringify({ rules: rulesText, updatedAt: new Date().toISOString() }));
    notifyNoticeListeners();
  }
};

export const subscribeToAttendanceRules = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(doc(db, "settings", "attendance_rules"), (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data().rules);
      } else {
        callback("");
      }
    });
  } else {
    const handler = () => {
      const data = localStorage.getItem("att_attendance_rules");
      if (data) {
        callback(JSON.parse(data).rules);
      } else {
        const defaultRules = 
          "1. Working Hours: Standard working hours are standard based on employee profiles. Be punctual.\n" +
          "2. Late Threshold: Checking in 15+ minutes after shift start marks your shift as Late.\n" +
          "3. Break Limits: Short break is capped at 20 mins. Long break is capped at 40 mins. Overstays affect metrics.\n" +
          "4. Geofencing: All check events require GPS validation. Attempting to check out of office bounds is flagged.\n" +
          "5. Leave Submission: Official leaves must be requested 48 hours prior to start.";
        callback(defaultRules);
      }
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

// 3. Leave Requests
export const requestLeave = async (userId, userName, userDept, type, duration, startDate, endDate, reason, avatar, isEmergency = false) => {
  const req = {
    id: dbType === "firebase" ? "" : "lr-" + Math.random().toString(36).substr(2, 9),
    userId,
    userName,
    userDept,
    type,
    duration,
    startDate: startDate || "",
    endDate: endDate || "",
    reason: reason || "",
    avatar: avatar || "",
    status: "pending",
    isEmergency,
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "leave_requests"), req);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_leave_requests")
      ? JSON.parse(localStorage.getItem("att_leave_requests"))
      : [];
    current.push(req);
    localStorage.setItem("att_leave_requests", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

const parseDurationDays = (durationStr) => {
  if (!durationStr) return 1;
  const match = String(durationStr).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 1;
};

export const updateLeaveRequest = async (id, status, managerComment) => {
  const updates = { status, updatedAt: new Date().toISOString() };
  if (managerComment !== undefined) {
    updates.managerComment = managerComment;
  }

  if (dbType === "firebase") {
    if (status === "approved") {
      const docRef = doc(db, "leave_requests", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().status !== "approved") {
        const reqData = docSnap.data();
        const userDocRef = doc(db, "users", reqData.userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const days = parseDurationDays(reqData.duration);
          let field = "annualLeaves";
          if (reqData.type === "Sick Leave") field = "sickLeaves";
          else if (reqData.type === "Casual Leave" || reqData.isEmergency) field = "casualLeaves";
          const currentBal = userData[field] !== undefined ? Number(userData[field]) : (field === "annualLeaves" ? 25 : (field === "sickLeaves" ? 10 : 6));
          await updateDoc(userDocRef, { [field]: Math.max(0, currentBal - days) });
        }
      }
    }
    await updateDoc(doc(db, "leave_requests", id), updates);
  } else {
    const current = localStorage.getItem("att_leave_requests")
      ? JSON.parse(localStorage.getItem("att_leave_requests"))
      : [];
    const index = current.findIndex(r => r.id === id);
    if (index !== -1) {
      if (status === "approved" && current[index].status !== "approved") {
        const reqData = current[index];
        const users = localDb.getUsers();
        const uIdx = users.findIndex(u => u.uid === reqData.userId);
        if (uIdx !== -1) {
          const days = parseDurationDays(reqData.duration);
          let field = "annualLeaves";
          if (reqData.type === "Sick Leave") field = "sickLeaves";
          else if (reqData.type === "Casual Leave" || reqData.isEmergency) field = "casualLeaves";
          const currentBal = users[uIdx][field] !== undefined ? Number(users[uIdx][field]) : (field === "annualLeaves" ? 25 : (field === "sickLeaves" ? 10 : 6));
          users[uIdx][field] = Math.max(0, currentBal - days);
          localStorage.setItem("att_users", JSON.stringify(users));
          const cur = localDb.getCurrentUser();
          if (cur && cur.uid === reqData.userId) {
            cur[field] = users[uIdx][field];
            localDb.setCurrentUser(cur);
            notifyAuthListeners(cur);
          }
        }
      }
      current[index].status = status;
      current[index].updatedAt = new Date().toISOString();
      if (managerComment !== undefined) {
        current[index].managerComment = managerComment;
      }
      localStorage.setItem("att_leave_requests", JSON.stringify(current));
      notifyNoticeListeners();
    }
  }
};

export const subscribeToLeaveRequests = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(collection(db, "leave_requests"), (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_leave_requests")
        ? JSON.parse(localStorage.getItem("att_leave_requests"))
        : [];
      // Clean up any existing dummy leave requests if they are stored in localStorage
      const originalLength = list.length;
      list = list.filter(item => item.id !== "l1" && item.id !== "l2" && item.id !== "l3");
      if (list.length !== originalLength) {
        localStorage.setItem("att_leave_requests", JSON.stringify(list));
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

// 4. Time Regularization APIs
export const requestRegularization = async (userId, userName, userDept, date, checkInTime, checkOutTime, reason) => {
  const req = {
    id: dbType === "firebase" ? "" : "reg-" + Math.random().toString(36).substr(2, 9),
    userId,
    userName,
    userDept,
    date,
    checkInTime,
    checkOutTime,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "regularization_requests"), req);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_regularizations")
      ? JSON.parse(localStorage.getItem("att_regularizations"))
      : [];
    current.push(req);
    localStorage.setItem("att_regularizations", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

export const updateRegularizationRequest = async (id, status, managerComment) => {
  const updates = { status, updatedAt: new Date().toISOString() };
  if (managerComment !== undefined) {
    updates.managerComment = managerComment;
  }

  if (dbType === "firebase") {
    const docRef = doc(db, "regularization_requests", id);
    await updateDoc(docRef, updates);
    
    if (status === "approved") {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const reqData = docSnap.data();
        
        // Write standard attendance record
        const recordId = `${reqData.userId}_${reqData.date}`;
        const checkInIso = new Date(`${reqData.date}T${reqData.checkInTime}:00`).toISOString();
        const checkOutIso = new Date(`${reqData.date}T${reqData.checkOutTime}:00`).toISOString();
        const rawDiff = (new Date(checkOutIso).getTime() - new Date(checkInIso).getTime()) / 60000;
        const workingMinutes = Math.min(rawDiff >= 540 ? rawDiff - 60 : rawDiff, 480);
        
        const attendanceData = {
          id: recordId,
          userId: reqData.userId,
          userName: reqData.userName,
          userDept: reqData.userDept,
          date: reqData.date,
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          status: "checked-out",
          breaks: [],
          totalWorkingMinutes: workingMinutes,
          shortBreakBalance: 1800,
          longBreakBalance: 1800
        };
        
        await setDoc(doc(db, "attendance", recordId), attendanceData);
      }
    }
  } else {
    const current = localStorage.getItem("att_regularizations")
      ? JSON.parse(localStorage.getItem("att_regularizations"))
      : [];
    const index = current.findIndex(r => r.id === id);
    if (index !== -1) {
      current[index].status = status;
      current[index].updatedAt = new Date().toISOString();
      if (managerComment !== undefined) {
        current[index].managerComment = managerComment;
      }
      localStorage.setItem("att_regularizations", JSON.stringify(current));
      
      if (status === "approved") {
        const reqData = current[index];
        const recordId = `${reqData.userId}_${reqData.date}`;
        const checkInIso = new Date(`${reqData.date}T${reqData.checkInTime}:00`).toISOString();
        const checkOutIso = new Date(`${reqData.date}T${reqData.checkOutTime}:00`).toISOString();
        const rawDiff = (new Date(checkOutIso).getTime() - new Date(checkInIso).getTime()) / 60000;
        const workingMinutes = Math.min(rawDiff >= 540 ? rawDiff - 60 : rawDiff, 480);
        
        const attendanceData = {
          id: recordId,
          userId: reqData.userId,
          userName: reqData.userName,
          userDept: reqData.userDept,
          date: reqData.date,
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          status: "checked-out",
          breaks: [],
          totalWorkingMinutes: workingMinutes,
          shortBreakBalance: 1800,
          longBreakBalance: 1800
        };
        
        const logs = localDb.getAttendance();
        const logIdx = logs.findIndex(log => log.id === recordId);
        if (logIdx !== -1) {
          logs[logIdx] = attendanceData;
        } else {
          logs.push(attendanceData);
        }
        localDb.saveAttendance(logs);
        notifyAttendanceListeners();
      }
      notifyNoticeListeners();
    }
  }
};

export const subscribeToRegularizationRequests = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(collection(db, "regularization_requests"), (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      const list = localStorage.getItem("att_regularizations")
        ? JSON.parse(localStorage.getItem("att_regularizations"))
        : [];
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

// ============================================================
// TEAM HUB — Channels, Direct Messages & File Sharing
// ============================================================

// --- Listeners for realtime simulation ---
const channelListeners = new Set();
const messageListeners = {};
const allMessagesListeners = new Set();

const notifyChannelListeners = () => channelListeners.forEach(cb => cb());
const notifyMessageListeners = (threadId) => {
  if (messageListeners[threadId]) {
    messageListeners[threadId].forEach(cb => cb());
  }
};
const notifyAllMessagesListeners = () => allMessagesListeners.forEach(cb => cb());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "att_messages") {
      Object.keys(messageListeners).forEach(threadId => {
        notifyMessageListeners(threadId);
      });
      notifyAllMessagesListeners();
    } else if (e.key === "att_channels" || e.key === "att_dm_threads") {
      notifyChannelListeners();
    }
  });
}

// --- Local DB helpers for Team Hub ---
const getLocalChannels = () => {
  const raw = localStorage.getItem("att_channels");
  const channels = raw ? JSON.parse(raw) : [];
  // Seed a default General channel
  if (!channels.some(c => c.id === "general")) {
    channels.push({
      id: "general",
      name: "general",
      description: "Company-wide announcements and updates",
      createdBy: "admin-uid-12345",
      createdByName: "Super Admin",
      memberIds: [],
      isPrivate: false,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem("att_channels", JSON.stringify(channels));
  }
  return channels;
};

const saveLocalChannels = (channels) => {
  localStorage.setItem("att_channels", JSON.stringify(channels));
};

const getLocalMessages = () => {
  const raw = localStorage.getItem("att_messages");
  return raw ? JSON.parse(raw) : [];
};

const saveLocalMessages = (messages) => {
  localStorage.setItem("att_messages", JSON.stringify(messages));
};

const getLocalDmThreads = () => {
  const raw = localStorage.getItem("att_dm_threads");
  return raw ? JSON.parse(raw) : [];
};

const saveLocalDmThreads = (threads) => {
  localStorage.setItem("att_dm_threads", JSON.stringify(threads));
};

// Seed on load
if (dbType === "local") {
  getLocalChannels();
}

// ============================================================
// CHANNEL FUNCTIONS
// ============================================================

/**
 * Create a new channel (admin only)
 */
export const createChannel = async (name, description, creatorId, creatorName) => {
  const channelData = {
    id: dbType === "firebase" ? "" : "ch-" + Math.random().toString(36).substr(2, 9),
    name: name.toLowerCase().replace(/\s+/g, "-"),
    displayName: name,
    description: description || "",
    createdBy: creatorId,
    createdByName: creatorName,
    memberIds: [creatorId],
    isPrivate: false,
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "channels"), channelData);
    await updateDoc(docRef, { id: docRef.id });
    return { ...channelData, id: docRef.id };
  } else {
    const channels = getLocalChannels();
    channels.push(channelData);
    saveLocalChannels(channels);
    notifyChannelListeners();
    return channelData;
  }
};

/**
 * Subscribe to channels list (real-time)
 */
export const subscribeToChannels = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(collection(db, "channels"), orderBy("createdAt", "asc")),
      (snapshot) => {
        const list = snapshot.docs.map(d => d.data());
        callback(list);
      }
    );
  } else {
    const handler = () => callback(getLocalChannels());
    channelListeners.add(handler);
    handler();
    return () => channelListeners.delete(handler);
  }
};

/**
 * Join a channel
 */
export const joinChannel = async (channelId, userId) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "channels", channelId), {
      memberIds: arrayUnion(userId)
    });
  } else {
    const channels = getLocalChannels();
    const idx = channels.findIndex(c => c.id === channelId);
    if (idx !== -1 && !channels[idx].memberIds.includes(userId)) {
      channels[idx].memberIds.push(userId);
      saveLocalChannels(channels);
      notifyChannelListeners();
    }
  }
};

/**
 * Leave a channel
 */
export const leaveChannel = async (channelId, userId) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "channels", channelId), {
      memberIds: arrayRemove(userId)
    });
  } else {
    const channels = getLocalChannels();
    const idx = channels.findIndex(c => c.id === channelId);
    if (idx !== -1) {
      channels[idx].memberIds = channels[idx].memberIds.filter(id => id !== userId);
      saveLocalChannels(channels);
      notifyChannelListeners();
    }
  }
};

/**
 * Delete a channel (admin only)
 */
export const deleteChannel = async (channelId) => {
  if (channelId === "general") return; // Never delete general
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "channels", channelId));
  } else {
    const channels = getLocalChannels().filter(c => c.id !== channelId);
    saveLocalChannels(channels);
    notifyChannelListeners();
  }
};

// ============================================================
// MESSAGES FUNCTIONS
// ============================================================

/**
 * Send a message to a channel or DM thread
 */
export const sendChatMessage = async (threadId, threadType, senderId, senderName, senderAvatar, text, fileData) => {
  const msg = {
    id: dbType === "firebase" ? "" : "msg-" + Math.random().toString(36).substr(2, 9),
    threadId,
    threadType, // 'channel' or 'dm'
    senderId,
    senderName,
    senderAvatar: senderAvatar || "",
    text: text || "",
    fileData: fileData || null, // { name, url, driveId, size, mimeType }
    isDeleted: false,
    timestamp: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "messages"), msg);
    await updateDoc(docRef, { id: docRef.id });
    return { ...msg, id: docRef.id };
  } else {
    const messages = getLocalMessages();
    messages.push(msg);
    saveLocalMessages(messages);
    notifyMessageListeners(threadId);
    notifyAllMessagesListeners();
    return msg;
  }
};

/**
 * Subscribe to messages for a thread (real-time)
 */
export const subscribeToMessages = (threadId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(
        collection(db, "messages"),
        where("threadId", "==", threadId),
        where("isDeleted", "==", false)
      ),
      (snapshot) => {
        const msgs = snapshot.docs.map(d => d.data());
        msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        callback(msgs);
      },
      (error) => {
        console.error("Firestore subscribeToMessages failed:", error);
      }
    );
  } else {
    if (!messageListeners[threadId]) {
      messageListeners[threadId] = new Set();
    }
    const handler = () => {
      const all = getLocalMessages()
        .filter(m => m.threadId === threadId && !m.isDeleted)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      callback(all);
    };
    messageListeners[threadId].add(handler);
    handler();

    // Polling interval as a robust fallback for other views/tabs in simulation mode
    const pollId = setInterval(() => {
      handler();
    }, 3000);

    return () => {
      clearInterval(pollId);
      if (messageListeners[threadId]) {
        messageListeners[threadId].delete(handler);
      }
    };
  }
};

/**
 * Subscribe to all chat messages (real-time) across channels and DMs
 */
export const subscribeToAllMessages = (callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(
        collection(db, "messages"),
        where("isDeleted", "==", false)
      ),
      (snapshot) => {
        const msgs = snapshot.docs.map(d => d.data());
        msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        callback(msgs);
      },
      (error) => {
        console.error("Firestore subscribeToAllMessages failed:", error);
      }
    );
  } else {
    const handler = () => {
      const all = getLocalMessages()
        .filter(m => !m.isDeleted)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      callback(all);
    };
    allMessagesListeners.add(handler);
    handler();

    // Polling interval as a robust fallback in simulation mode
    const pollId = setInterval(() => {
      handler();
    }, 3000);

    return () => {
      clearInterval(pollId);
      allMessagesListeners.delete(handler);
    };
  }
};

/**
 * Delete a message (admin moderation or sender)
 */
export const deleteChatMessage = async (messageId) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "messages", messageId), { isDeleted: true, text: "[Message deleted]", fileData: null });
  } else {
    const messages = getLocalMessages();
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      messages[idx].isDeleted = true;
      messages[idx].text = "[Message deleted]";
      messages[idx].fileData = null;
      saveLocalMessages(messages);
      // Notify all thread listeners
      Object.values(messageListeners).forEach(set => set.forEach(cb => cb()));
      notifyAllMessagesListeners();
    }
  }
};

/**
 * Get all messages (admin only — for monitoring)
 */
export const getAllMessagesAdmin = async () => {
  if (dbType === "firebase") {
    const snapshot = await getDocs(
      query(collection(db, "messages"), orderBy("timestamp", "desc"))
    );
    return snapshot.docs.map(d => d.data());
  } else {
    return getLocalMessages().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
};

// ============================================================
// DIRECT MESSAGE THREAD FUNCTIONS
// ============================================================

/**
 * Get or create a DM thread between two users
 */
export const getOrCreateDmThread = async (userAId, userBId, userAName, userBName) => {
  // Canonical ID — always sorted so order doesn't matter
  const threadId = [userAId, userBId].sort().join("_dm_");

  if (dbType === "firebase") {
    const docRef = doc(db, "dm_threads", threadId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      const thread = {
        id: threadId,
        participantIds: [userAId, userBId],
        participantNames: { [userAId]: userAName, [userBId]: userBName },
        createdAt: new Date().toISOString()
      };
      await setDoc(docRef, thread);
      return thread;
    }
    return snap.data();
  } else {
    const threads = getLocalDmThreads();
    const existing = threads.find(t => t.id === threadId);
    if (existing) return existing;
    const thread = {
      id: threadId,
      participantIds: [userAId, userBId],
      participantNames: { [userAId]: userAName, [userBId]: userBName },
      createdAt: new Date().toISOString()
    };
    threads.push(thread);
    saveLocalDmThreads(threads);
    return thread;
  }
};

/**
 * Get all DM threads for a user
 */
export const subscribeToDmThreads = (userId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(collection(db, "dm_threads"), where("participantIds", "array-contains", userId)),
      (snapshot) => {
        callback(snapshot.docs.map(d => d.data()));
      }
    );
  } else {
    const handler = () => {
      const threads = getLocalDmThreads().filter(t => t.participantIds.includes(userId));
      callback(threads);
    };
    channelListeners.add(handler); // reuse same notification bus
    handler();
    return () => channelListeners.delete(handler);
  }
};

/**
 * Get all DM threads (admin only)
 */
export const getAllDmThreadsAdmin = async () => {
  if (dbType === "firebase") {
    const snapshot = await getDocs(collection(db, "dm_threads"));
    return snapshot.docs.map(d => d.data());
  } else {
    return getLocalDmThreads();
  }
};

/**
 * Upload a file to Firebase Storage (or Base64 data URL if local mode)
 * @param {File} file
 * @returns {Promise<{ id: string, name: string, url: string, mimeType: string, size: number }>}
 */
export const uploadFileToFirebase = async (file) => {
  if (isB2Configured()) {
    try {
      return await uploadFileToB2(file);
    } catch (error) {
      console.warn("B2 Upload failed, falling back to Firebase/Local:", error);
      // Fall through to existing logic
    }
  }

  if (dbType === "firebase") {
    try {
      if (!storage) {
        throw new Error("Firebase Storage is not initialized.");
      }
      // Generate a unique path/filename
      const uniqueId = Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      const fileExtension = file.name.split(".").pop() || "bin";
      const filePath = `chat_files/${uniqueId}.${fileExtension}`;
      const fileRef = storageRef(storage, filePath);
      
      // Upload bytes with resumable task so we can cancel it on timeout
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          try {
            uploadTask.cancel(); // Abort the upload to stop background retries
          } catch (e) {
            console.error("Failed to cancel upload task:", e);
          }
          reject(new Error("Firebase Storage upload timed out after 20 seconds."));
        }, 20000)
      );

      // Race the upload task against the timeout
      await Promise.race([uploadTask, timeoutPromise]);
      
      // Get public/read download URL
      const downloadUrl = await getDownloadURL(fileRef);
      
      return {
        id: uniqueId,
        name: file.name,
        url: downloadUrl,
        mimeType: file.type || "application/octet-stream",
        size: file.size
      };
    } catch (storageError) {
      console.warn("Firebase Storage upload failed, falling back to local Base64 upload:", storageError);
      // Fallback to base64 encoding if file is small enough to fit in Firestore (Firestore limit is 1MB)
      if (file.size > 800 * 1024) {
        throw new Error("File is too large to upload. Please select an image under 800KB.");
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            id: "fb-fallback-" + Date.now(),
            name: file.name,
            url: reader.result, // base64 data URL
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            isFallback: true
          });
        };
        reader.onerror = (err) => {
          reject(new Error("Failed to read file locally: " + err.message));
        };
        reader.readAsDataURL(file);
      });
    }
  } else {
    // Local DB Mode: Convert file to Base64 Data URL so it is fully self-contained!
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          id: "local-" + Date.now(),
          name: file.name,
          url: reader.result, // base64 data URL
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          isLocal: true
        });
      };
      reader.onerror = (err) => {
        reject(new Error("Failed to read file locally: " + err.message));
      };
      reader.readAsDataURL(file);
    });
  }
};

// ----------------------------------------------------
// PROJECT & TASK MANAGEMENT: TASK REPORTS
// ----------------------------------------------------

export const addTaskReport = async (taskId, employeeId, pmId, reportText) => {
  const reportData = {
    taskId,
    employeeId,
    pmId,
    reportText,
    timestamp: new Date().toISOString()
  };

  if (dbType === "firebase") {
    await addDoc(collection(db, "task_reports"), reportData);
  } else {
    const current = localStorage.getItem("att_task_reports")
      ? JSON.parse(localStorage.getItem("att_task_reports"))
      : [];
    reportData.id = "report_" + Date.now();
    current.push(reportData);
    localStorage.setItem("att_task_reports", JSON.stringify(current));
    // Provide an event listener hook if we need real-time local updates
    window.dispatchEvent(new Event("local-reports-updated"));
  }
};

export const subscribeToTaskReports = (taskId, callback) => {
  if (dbType === "firebase") {
    const q = query(collection(db, "task_reports"), where("taskId", "==", taskId), orderBy("timestamp", "asc"));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(list);
    });
  } else {
    const handler = () => {
      const current = localStorage.getItem("att_task_reports")
        ? JSON.parse(localStorage.getItem("att_task_reports"))
        : [];
      const list = current.filter(r => r.taskId === taskId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      callback(list);
    };
    handler();
    window.addEventListener("local-reports-updated", handler);
    return () => window.removeEventListener("local-reports-updated", handler);
  }
};

// ----------------------------------------------------
// GENERIC NOTIFICATIONS
// ----------------------------------------------------

export const createNotification = async (userId, title, message, type = "info", link = "") => {
  const notifData = {
    userId,
    title,
    message,
    type,
    link,
    read: false,
    timestamp: new Date().toISOString()
  };

  if (dbType === "firebase") {
    await addDoc(collection(db, "notifications"), notifData);
  } else {
    const current = localStorage.getItem("att_notifications")
      ? JSON.parse(localStorage.getItem("att_notifications"))
      : [];
    notifData.id = "notif_" + Date.now();
    current.push(notifData);
    localStorage.setItem("att_notifications", JSON.stringify(current));
    window.dispatchEvent(new Event("local-notifications-updated"));
  }
};

export const subscribeToNotifications = (userId, callback) => {
  if (dbType === "firebase") {
    const q = query(collection(db, "notifications"), where("userId", "==", userId), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(list);
    });
  } else {
    const handler = () => {
      const current = localStorage.getItem("att_notifications")
        ? JSON.parse(localStorage.getItem("att_notifications"))
        : [];
      const list = current.filter(n => n.userId === userId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(list);
    };
    handler();
    window.addEventListener("local-notifications-updated", handler);
    return () => window.removeEventListener("local-notifications-updated", handler);
  }
};

export const markNotificationRead = async (notifId) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "notifications", notifId);
    await updateDoc(docRef, { read: true });
  } else {
    const current = localStorage.getItem("att_notifications")
      ? JSON.parse(localStorage.getItem("att_notifications"))
      : [];
    const index = current.findIndex(n => n.id === notifId);
    if (index !== -1) {
      current[index].read = true;
      localStorage.setItem("att_notifications", JSON.stringify(current));
      window.dispatchEvent(new Event("local-notifications-updated"));
    }
  }
};

export { db };
