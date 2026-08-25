import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser
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
import imageCompression from 'browser-image-compression';

// Firebase Configuration
// Replace these with your actual Firebase project settings
const firebaseConfig = {
  apiKey: "AIzaSyCzOxb3n4riIANnECaSEiPpghHw3ZttEdY",
  authDomain: "intern-attendance-web.firebaseapp.com",
  databaseURL: "https://intern-attendance-web-default-rtdb.firebaseio.com",
  projectId: "intern-attendance-web",
  storageBucket: "intern-attendance-web.firebasestorage.app",
  messagingSenderId: "490507892655",
  appId: "1:490507892655:web:e0bf453d2a6fa3ceeb215a",
  measurementId: "G-N91XTTC86C"
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
    let updated = false;
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
      updated = true;
    }
    // Ensure system admin user exists
    if (!parsed.some(u => u.email === "systemadmin@teamcarrezza.com")) {
      parsed.push({
        uid: "systemadmin-uid-12345",
        name: "System Admin",
        email: "systemadmin@teamcarrezza.com",
        department: "IT Infrastructure",
        programType: "Full-time",
        role: "admin",
        createdAt: new Date().toISOString()
      });
      updated = true;
    }
    if (updated) {
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
  },

  getRoles: () => {
    const roles = localStorage.getItem("att_roles");
    return roles ? JSON.parse(roles) : [];
  },

  saveRoles: (roles) => {
    localStorage.setItem("att_roles", JSON.stringify(roles));
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
const payrollListeners = new Set();

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
const notifyPayrollListeners = (companyId) => {
  payrollListeners.forEach(cb => cb(companyId));
};

// ----------------------------------------------------
// SERVICE INTERFACE (Differentiates between Real Firebase & Simulation)
// ----------------------------------------------------

export const getDbType = () => dbType;

/**
 * Register a new user
 */
export const registerUser = async (name, department, programType, email, password, shiftStart = "10:00", shiftEnd = "19:00", annualLeaves = 25, sickLeaves = 10, casualLeaves = 6, dob = "", joiningDate = "", projects = [], tasks = [], jobType = "Full-time", designation = "", isProjectManager = false, employeeId = "", companySlug = "", role = "user", companyId = "", additionalData = {}) => {
  const finalRole = email.toLowerCase() === "admin@teamcarrezza.com" ? "admin" : role;

  if (dbType === "firebase") {
    let userCredential;
    let secondaryAuth;
    let secondaryApp;
    try {
      try {
        secondaryApp = getApp("SecondaryAppInstance");
      } catch (err) {
        secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
      }
      secondaryAuth = getAuth(secondaryApp);
      userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') throw new Error("Email is already registered. Please log in instead.");
      if (error.code === 'auth/invalid-email') throw new Error("Please enter a valid email address.");
      if (error.code === 'auth/weak-password') throw new Error("Password must be at least 6 characters long.");
      throw new Error("Failed to register: " + error.message);
    }
    const user = userCredential.user;

    // Fallback: update display name in Auth so it is always present
    // We do this while still authenticated in the secondary app instance
    try {
      await updateProfile(user, { displayName: name });
    } catch (e) {
      console.warn("Failed to set displayName on auth user:", e);
    }

    // Resolve companySlug to companyId AFTER auth is established
    let finalCompanyId = companyId || "";
    if (!finalCompanyId && companySlug) {
      try {
        const company = await getCompanyBySlug(companySlug);
        if (company) {
          finalCompanyId = company.id;
        }
      } catch (e) {
        console.warn("Failed to resolve companySlug:", e);
      }
    }
    // Check if there is a verified domain auto-assignment
    if (!finalCompanyId) {
      try {
        const domainParts = email.split('@');
        if (domainParts.length === 2) {
          const userDomain = domainParts[1].toLowerCase();
          // Check public domains collection
          const domainsRef = collection(db, "companyDomains");
          const q = query(domainsRef, where("domain", "==", userDomain), where("status", "==", "VERIFIED"));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            finalCompanyId = snapshot.docs[0].data().companyId;
          }
        }
      } catch (err) {
        console.warn("Auto-assignment by domain failed", err);
      }
    }

    // Clean all properties to prevent undefined values in Firestore
    const cleanValue = (val, fallback = "") => (val === undefined || val === null) ? fallback : val;
    // Save additional details in Firestore
    const userData = {
      uid: user.uid,
      name: cleanValue(name),
      department: cleanValue(department),
      programType: cleanValue(programType),
      email: email.toLowerCase(),
      role: cleanValue(finalRole, "user"),
      shiftStart: cleanValue(shiftStart, "10:00"),
      shiftEnd: cleanValue(shiftEnd, "19:00"),
      annualLeaves: Number(cleanValue(annualLeaves, 25)),
      sickLeaves: Number(cleanValue(sickLeaves, 10)),
      casualLeaves: Number(cleanValue(casualLeaves, 6)),
      createdAt: new Date().toISOString(),
      dob: cleanValue(dob),
      joiningDate: cleanValue(joiningDate),
      projects: Array.isArray(projects) ? projects : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      jobType: cleanValue(jobType, "Full-time"),
      designation: cleanValue(designation),
      isProjectManager: !!isProjectManager,
      employeeId: cleanValue(employeeId),
      companyId: cleanValue(finalCompanyId),
      ...additionalData
    };

    try {
      // Use the secondary app instance's firestore so that the write request is sent
      // as the newly registered user (self-write), satisfying "request.auth.uid == userId" rules.
      const secondaryDb = getFirestore(secondaryApp);
      await setDoc(doc(secondaryDb, "users", user.uid), userData);

      // Sign out of secondary auth now that registration and profile creation is complete
      try {
        await signOut(secondaryAuth);
      } catch (e) {
        console.warn("Failed to sign out secondary auth:", e);
      }

      return userData;
    } catch (error) {
      console.error("Firestore setDoc failed during registration. Rolling back Auth account:", error);
      // Attempt to clean up the newly created Auth user so they aren't orphaned
      try {
        await deleteUser(user);
      } catch (delError) {
        console.error("Auth registration rollback failed:", delError);
      }
      throw new Error(`Failed to save employee profile: ${error.message}`);
    }
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
      role: finalRole,
      shiftStart,
      shiftEnd,
      annualLeaves: Number(annualLeaves),
      sickLeaves: Number(sickLeaves),
      casualLeaves: Number(casualLeaves),
      createdAt: new Date().toISOString(),
      dob,
      joiningDate,
      projects,
      tasks,
      jobType,
      designation,
      isProjectManager,
      employeeId,
      companyId: companySlug ? (localDb.getCompanies ? localDb.getCompanies() : (typeof getLocalCompanies === 'function' ? getLocalCompanies() : [])).find(c => c.slug?.toLowerCase() === companySlug.toLowerCase())?.id || "" : "",
      password,
      ...additionalData
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
        await setDoc(doc(db, "users", user.uid), userData, { merge: true });
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
          await setDoc(doc(db, "users", user.uid), userData, { merge: true });
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
    let unsubscribeSnapshot = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
      if (firebaseUser) {
        unsubscribeSnapshot = onSnapshot(doc(db, "users", firebaseUser.uid), (userDoc) => {
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

            // Auto-sync write to Firestore without overwriting existing critical data like companyId and tasks
            setDoc(doc(db, "users", firebaseUser.uid), fallbackData, { merge: true })
              .then(() => {
                console.log("Auto-synchronized missing Firestore user profile document.");
              })
              .catch((err) => {
                console.warn("Could not auto-synchronize missing user document:", err);
              });

            callback(fallbackData);
          }
        }, (error) => {
          console.error("Firestore user onSnapshot failed:", error);
        });
      } else {
        callback(null);
      }
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
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
export const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Check In
 */
export const checkIn = async (user, location) => {
  const dateStr = getLocalDateString();
  const checkInDate = new Date();
  const timeStr = checkInDate.toISOString();
  const recordId = `${user.uid}_${dateStr}`;

  let defaultBreakDur = 1800; // 30 mins
  let defaultBioDur = 900;    // 15 mins
  try {
    if (dbType === "firebase" && user.companyId) {
      const envRef = doc(db, "companies", user.companyId, "environmentSettings", "general");
      const envSnap = await getDoc(envRef);
      if (envSnap.exists()) {
        const envData = envSnap.data();
        if (envData?.workSettings?.breakDurationMinutes) {
           defaultBreakDur = envData.workSettings.breakDurationMinutes * 60;
           defaultBioDur = envData.workSettings.breakDurationMinutes * 60; // Make bio equal to the configured duration
        }

        if (envData?.workSettings?.enforceShiftTiming && envData?.workSettings?.shiftStartTime && envData?.workSettings?.shiftEndTime) {
          const now = new Date();
          const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

          const [startH, startM] = envData.workSettings.shiftStartTime.split(':').map(Number);
          const startTotalMinutes = startH * 60 + startM;

          const [endH, endM] = envData.workSettings.shiftEndTime.split(':').map(Number);
          const endTotalMinutes = endH * 60 + endM;

          // Note: this simple logic assumes shift does not cross midnight. 
          if (startTotalMinutes <= endTotalMinutes) {
            if (currentTotalMinutes < startTotalMinutes || currentTotalMinutes > endTotalMinutes) {
              throw new Error(`Check-in denied: You can only check in during your scheduled shift (${envData.workSettings.shiftStartTime} - ${envData.workSettings.shiftEndTime}).`);
            }
          } else {
            // Night shift handling (e.g. 22:00 to 06:00)
            if (currentTotalMinutes < startTotalMinutes && currentTotalMinutes > endTotalMinutes) {
              throw new Error(`Check-in denied: You can only check in during your scheduled shift (${envData.workSettings.shiftStartTime} - ${envData.workSettings.shiftEndTime}).`);
            }
          }
        }
      }
    }
  } catch (err) {
    if (err.message.includes("Check-in denied")) {
      throw err;
    }
    console.warn("Failed to load environment break settings during checkIn", err);
  }

  if (dbType === "firebase") {
    // Check if document already exists
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const existingData = docSnap.data();

      // If already actively checked in or on break
      if (existingData.status === "checked-in" || existingData.status === "on-break") {
        throw new Error("You are already checked in.");
      }

      // If user is re-checking in after checking out
      if (existingData.status === "checked-out" || existingData.checkOutTime) {
        const previousSession = {
          checkInTime: existingData.lastCheckInTime || existingData.checkInTime,
          checkInLocation: existingData.lastCheckInLocation || existingData.checkInLocation,
          checkOutTime: existingData.checkOutTime,
          checkOutLocation: existingData.checkOutLocation,
          workingMinutes: existingData.currentSessionWorkingMinutes || (existingData.totalWorkingMinutes - (existingData.accumulatedWorkingMinutes || 0)) || 0,
          breaks: existingData.currentSessionBreaks || []
        };

        const existingSessions = Array.isArray(existingData.sessions) ? existingData.sessions : [];
        const newSessions = [...existingSessions, previousSession];
        const prevAccumulated = (existingData.accumulatedWorkingMinutes || 0) + (previousSession.workingMinutes || 0);

        const updates = {
          lastCheckInTime: timeStr,
          lastCheckInLocation: location,
          checkOutTime: null,
          checkOutLocation: null,
          status: "checked-in",
          sessions: newSessions,
          accumulatedWorkingMinutes: prevAccumulated,
          currentSessionBreaks: [],
          currentSessionWorkingMinutes: 0,
          // Keep original first check-in time for records/punctuality
          checkInTime: existingData.checkInTime || timeStr,
          checkInLocation: existingData.checkInLocation || location,
          currentBreakTimerEnd: null
        };

        await updateDoc(docRef, updates);
        return { ...existingData, ...updates };
      }
    }

    const data = {
      id: recordId,
      userId: user.uid,
      userName: user.name,
      userDept: user.department,
      programType: user.programType,
      date: dateStr,
      checkInTime: timeStr,
      checkInLocation: location,
      lastCheckInTime: timeStr,
      lastCheckInLocation: location,
      checkOutTime: null,
      checkOutLocation: null,
      status: "checked-in",
      breaks: [],
      currentSessionBreaks: [],
      sessions: [],
      accumulatedWorkingMinutes: 0,
      currentSessionWorkingMinutes: 0,
      totalWorkingMinutes: 0,
      shortBreakBalance: defaultBreakDur,
      longBreakBalance: defaultBreakDur,
      bioBreakBalance: defaultBioDur,
      companyId: user.companyId || ""
    };

    await setDoc(docRef, data);
    return data;
  } else {
    const logs = localDb.getAttendance();
    const logIndex = logs.findIndex(log => log.userId === user.uid && log.date === dateStr);

    if (logIndex !== -1) {
      const existingData = logs[logIndex];
      if (existingData.status === "checked-in" || existingData.status === "on-break") {
        throw new Error("You are already checked in.");
      }

      if (existingData.status === "checked-out" || existingData.checkOutTime) {
        const previousSession = {
          checkInTime: existingData.lastCheckInTime || existingData.checkInTime,
          checkInLocation: existingData.lastCheckInLocation || existingData.checkInLocation,
          checkOutTime: existingData.checkOutTime,
          checkOutLocation: existingData.checkOutLocation,
          workingMinutes: existingData.currentSessionWorkingMinutes || (existingData.totalWorkingMinutes - (existingData.accumulatedWorkingMinutes || 0)) || 0,
          breaks: existingData.currentSessionBreaks || []
        };

        const existingSessions = Array.isArray(existingData.sessions) ? existingData.sessions : [];
        const newSessions = [...existingSessions, previousSession];
        const prevAccumulated = (existingData.accumulatedWorkingMinutes || 0) + (previousSession.workingMinutes || 0);

        const updatedLog = {
          ...existingData,
          lastCheckInTime: timeStr,
          lastCheckInLocation: location,
          checkOutTime: null,
          checkOutLocation: null,
          status: "checked-in",
          sessions: newSessions,
          accumulatedWorkingMinutes: prevAccumulated,
          currentSessionBreaks: [],
          currentSessionWorkingMinutes: 0,
          checkInTime: existingData.checkInTime || timeStr,
          checkInLocation: existingData.checkInLocation || location,
          currentBreakTimerEnd: null
        };

        logs[logIndex] = updatedLog;
        localDb.saveAttendance(logs);
        notifyAttendanceListeners();
        return updatedLog;
      }
    }

    const data = {
      id: recordId,
      userId: user.uid,
      userName: user.name,
      userDept: user.department,
      programType: user.programType,
      date: dateStr,
      checkInTime: timeStr,
      checkInLocation: location,
      lastCheckInTime: timeStr,
      lastCheckInLocation: location,
      checkOutTime: null,
      checkOutLocation: null,
      status: "checked-in",
      breaks: [],
      currentSessionBreaks: [],
      sessions: [],
      accumulatedWorkingMinutes: 0,
      currentSessionWorkingMinutes: 0,
      totalWorkingMinutes: 0,
      shortBreakBalance: 1800,
      longBreakBalance: 1800,
      bioBreakBalance: 900,
      companyId: user.companyId || ""
    };

    logs.push(data);
    localDb.saveAttendance(logs);
    notifyAttendanceListeners();
    return data;
  }
};

export const deleteCompany = async (companyId) => {
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "companies", companyId));
  } else {
    const companies = getLocalCompanies().filter(c => c.id !== companyId);
    saveLocalCompanies(companies);
  }
  return true;
};

export const updateCompanyStatus = async (companyId, status) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "companies", companyId), { status });
  } else {
    const companies = getLocalCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      companies[idx].status = status;
      saveLocalCompanies(companies);
    }
  }
  return true;
};

export const updateCompanyDetails = async (companyId, updates) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "companies", companyId), updates);
  } else {
    const companies = getLocalCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      companies[idx] = { ...companies[idx], ...updates };
      saveLocalCompanies(companies);
    }
  }
  return true;
};

/**
 * Check Out
 */
export const checkOut = async (userId, location) => {
  const dateStr = getLocalDateString();
  const recordId = `${userId}_${dateStr}`;
  const timeStr = new Date().toISOString();

  // Stop any active task timers before checking out
  await stopAllTaskTimers(userId);

  if (dbType === "firebase") {
    const docRef = doc(db, "attendance", recordId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("No check-in record found for today.");
    }

    const currentData = docSnap.data();
    if (currentData.status === "checked-out" && currentData.checkOutTime) {
      throw new Error("You have already checked out.");
    }

    // If user is on break, resume first or close break
    let updatedBreaks = [...(currentData.breaks || [])];
    let updatedCurrentSessionBreaks = [...(currentData.currentSessionBreaks || [])];
    if (currentData.status === "on-break") {
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
      if (activeBreakIndex !== -1) {
        updatedBreaks[activeBreakIndex].resumeTime = timeStr;
        updatedBreaks[activeBreakIndex].resumeLocation = location;
      }
      const activeSessionBreakIndex = updatedCurrentSessionBreaks.findIndex(b => !b.resumeTime);
      if (activeSessionBreakIndex !== -1) {
        updatedCurrentSessionBreaks[activeSessionBreakIndex].resumeTime = timeStr;
        updatedCurrentSessionBreaks[activeSessionBreakIndex].resumeLocation = location;
      }
    }

    // Calculate current session working minutes
    const sessionCheckIn = currentData.lastCheckInTime || currentData.checkInTime;
    const sessionBreaks = (currentData.sessions && currentData.sessions.length > 0)
      ? updatedCurrentSessionBreaks
      : updatedBreaks;
    const sessionWorkingMinutes = calculateWorkingMinutes(sessionCheckIn, timeStr, sessionBreaks);

    const prevAccumulated = currentData.accumulatedWorkingMinutes || 0;
    const totalWorkingMinutes = parseFloat((prevAccumulated + sessionWorkingMinutes).toFixed(1));

    const updates = {
      checkOutTime: timeStr,
      checkOutLocation: location,
      status: "checked-out",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedCurrentSessionBreaks,
      currentSessionWorkingMinutes: sessionWorkingMinutes,
      totalWorkingMinutes: totalWorkingMinutes
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
    if (currentData.status === "checked-out" && currentData.checkOutTime) {
      throw new Error("You have already checked out.");
    }

    let updatedBreaks = [...(currentData.breaks || [])];
    let updatedCurrentSessionBreaks = [...(currentData.currentSessionBreaks || [])];
    if (currentData.status === "on-break") {
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);
      if (activeBreakIndex !== -1) {
        updatedBreaks[activeBreakIndex].resumeTime = timeStr;
        updatedBreaks[activeBreakIndex].resumeLocation = location;
      }
      const activeSessionBreakIndex = updatedCurrentSessionBreaks.findIndex(b => !b.resumeTime);
      if (activeSessionBreakIndex !== -1) {
        updatedCurrentSessionBreaks[activeSessionBreakIndex].resumeTime = timeStr;
        updatedCurrentSessionBreaks[activeSessionBreakIndex].resumeLocation = location;
      }
    }

    const sessionCheckIn = currentData.lastCheckInTime || currentData.checkInTime;
    const sessionBreaks = (currentData.sessions && currentData.sessions.length > 0)
      ? updatedCurrentSessionBreaks
      : updatedBreaks;
    const sessionWorkingMinutes = calculateWorkingMinutes(sessionCheckIn, timeStr, sessionBreaks);

    const prevAccumulated = currentData.accumulatedWorkingMinutes || 0;
    const totalWorkingMinutes = parseFloat((prevAccumulated + sessionWorkingMinutes).toFixed(1));

    logs[logIndex] = {
      ...currentData,
      checkOutTime: timeStr,
      checkOutLocation: location,
      status: "checked-out",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedCurrentSessionBreaks,
      currentSessionWorkingMinutes: sessionWorkingMinutes,
      totalWorkingMinutes: totalWorkingMinutes
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

  // Find if there is any active task timer running before pausing
  let pausedTaskId = null;
  try {
    let userData = null;
    if (dbType === "firebase") {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        userData = userSnap.data();
      }
    } else {
      const users = localDb.getUsers();
      userData = users.find(u => u.uid === userId);
    }
    if (userData && userData.tasks) {
      const runningTask = userData.tasks.find(t => t.timerStartedAt);
      console.log("[startBreak] userData.tasks found:", userData.tasks);
      console.log("[startBreak] runningTask found:", runningTask);
      if (runningTask) {
        pausedTaskId = runningTask.id;
      }
    }
    console.log("[startBreak] Final determined pausedTaskId:", pausedTaskId);
  } catch (err) {
    console.error("Failed to query running task for break:", err);
  }

  // Stop any active task timers before starting a break
  await stopAllTaskTimers(userId);

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

    let balance;
    if (breakType === "short") {
      balance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    } else if (breakType === "bio") {
      balance = currentData.bioBreakBalance !== undefined ? currentData.bioBreakBalance : 900; // 15 mins
    } else {
      balance = currentData.longBreakBalance !== undefined ? Math.min(currentData.longBreakBalance, 1800) : 1800;
    }

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
    const updatedSessionBreaks = [...(currentData.currentSessionBreaks || []), newBreak];
    const updates = {
      status: "on-break",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedSessionBreaks,
      currentBreakTimerEnd: endTimeStr,
      pausedTaskId: pausedTaskId || null
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

    let balance;
    if (breakType === "short") {
      balance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    } else if (breakType === "bio") {
      balance = currentData.bioBreakBalance !== undefined ? currentData.bioBreakBalance : 900; // 15 mins
    } else {
      balance = currentData.longBreakBalance !== undefined ? Math.min(currentData.longBreakBalance, 1800) : 1800;
    }

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
    const updatedSessionBreaks = [...(currentData.currentSessionBreaks || []), newBreak];
    logs[logIndex] = {
      ...currentData,
      status: "on-break",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedSessionBreaks,
      currentBreakTimerEnd: endTimeStr,
      pausedTaskId: pausedTaskId || null
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
    const updatedSessionBreaks = [...(currentData.currentSessionBreaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);

    if (activeBreakIndex === -1) {
      throw new Error("No active break record found.");
    }

    const activeBreak = updatedBreaks[activeBreakIndex];
    activeBreak.resumeTime = timeStr;
    activeBreak.resumeLocation = location;

    const activeSessionBreakIndex = updatedSessionBreaks.findIndex(b => !b.resumeTime);
    if (activeSessionBreakIndex !== -1) {
      updatedSessionBreaks[activeSessionBreakIndex].resumeTime = timeStr;
      updatedSessionBreaks[activeSessionBreakIndex].resumeLocation = location;
    }

    const durationSeconds = Math.max(0, Math.floor((new Date(timeStr).getTime() - new Date(activeBreak.startTime).getTime()) / 1000));
    activeBreak.duration = Math.round(durationSeconds / 60);
    activeBreak.durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));

    let newShortBalance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    let newLongBalance = currentData.longBreakBalance !== undefined ? Math.min(currentData.longBreakBalance, 1800) : 1800;
    let newBioBalance = currentData.bioBreakBalance !== undefined ? currentData.bioBreakBalance : 900;

    if (activeBreak.type === "short") {
      newShortBalance = Math.max(0, newShortBalance - durationSeconds);
    } else if (activeBreak.type === "long") {
      newLongBalance = Math.max(0, newLongBalance - durationSeconds);
    } else if (activeBreak.type === "bio") {
      newBioBalance = Math.max(0, newBioBalance - durationSeconds);
    }

    const updates = {
      status: "checked-in",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedSessionBreaks,
      currentBreakTimerEnd: null,
      shortBreakBalance: newShortBalance,
      longBreakBalance: newLongBalance,
      bioBreakBalance: newBioBalance,
      pausedTaskId: null
    };

    await updateDoc(docRef, updates);

    // Automatically resume task timer if it was paused when starting the break
    console.log("[resumeWork - firebase] currentData read:", currentData);
    console.log("[resumeWork - firebase] currentData.pausedTaskId:", currentData?.pausedTaskId);
    if (currentData.pausedTaskId) {
      console.log("[resumeWork - firebase] Auto-resuming task:", currentData.pausedTaskId);
      await startTaskTimer(userId, currentData.pausedTaskId);
    }

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
    const updatedSessionBreaks = [...(currentData.currentSessionBreaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.resumeTime);

    if (activeBreakIndex === -1) {
      throw new Error("No active break record found.");
    }

    const activeBreak = updatedBreaks[activeBreakIndex];
    activeBreak.resumeTime = timeStr;
    activeBreak.resumeLocation = location;

    const activeSessionBreakIndex = updatedSessionBreaks.findIndex(b => !b.resumeTime);
    if (activeSessionBreakIndex !== -1) {
      updatedSessionBreaks[activeSessionBreakIndex].resumeTime = timeStr;
      updatedSessionBreakIndex[activeSessionBreakIndex].resumeLocation = location;
    }

    const durationSeconds = Math.max(0, Math.floor((new Date(timeStr).getTime() - new Date(activeBreak.startTime).getTime()) / 1000));
    activeBreak.duration = Math.round(durationSeconds / 60);
    activeBreak.durationMinutes = parseFloat((durationSeconds / 60).toFixed(1));

    let newShortBalance = currentData.shortBreakBalance !== undefined ? currentData.shortBreakBalance : 1800;
    let newLongBalance = currentData.longBreakBalance !== undefined ? Math.min(currentData.longBreakBalance, 1800) : 1800;
    let newBioBalance = currentData.bioBreakBalance !== undefined ? currentData.bioBreakBalance : 900;

    if (activeBreak.type === "short") {
      newShortBalance = Math.max(0, newShortBalance - durationSeconds);
    } else if (activeBreak.type === "long") {
      newLongBalance = Math.max(0, newLongBalance - durationSeconds);
    } else if (activeBreak.type === "bio") {
      newBioBalance = Math.max(0, newBioBalance - durationSeconds);
    }

    logs[logIndex] = {
      ...currentData,
      status: "checked-in",
      breaks: updatedBreaks,
      currentSessionBreaks: updatedSessionBreaks,
      currentBreakTimerEnd: null,
      shortBreakBalance: newShortBalance,
      longBreakBalance: newLongBalance,
      bioBreakBalance: newBioBalance,
      pausedTaskId: null
    };

    localDb.saveAttendance(logs);
    notifyAttendanceListeners();

    // Automatically resume task timer if it was paused when starting the break
    console.log("[resumeWork - local] currentData read:", currentData);
    console.log("[resumeWork - local] currentData.pausedTaskId:", currentData?.pausedTaskId);
    if (currentData.pausedTaskId) {
      console.log("[resumeWork - local] Auto-resuming task:", currentData.pausedTaskId);
      await startTaskTimer(userId, currentData.pausedTaskId);
    }

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
export const getAllRegisteredUsers = async (companyId = "") => {
  if (dbType === "firebase") {
    let qRef = collection(db, "users");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    const snapshot = await getDocs(qRef);
    return snapshot.docs.map(doc => doc.data());
  } else {
    let users = localDb.getUsers();
    if (companyId) users = users.filter(u => u.companyId === companyId);
    return users;
  }
};

/**
 * Update a user record (Admin edit user)
 */
export const updateUserRecord = async (uid, name, department, programType, shiftStart, shiftEnd, annualLeaves, sickLeaves, casualLeaves, avatar, dob, joiningDate, projects, tasks, jobType, designation, isProjectManager, employeeId, additionalData = {}) => {
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
      casualLeaves: Number(casualLeaves),
      ...additionalData
    };
    if (avatar !== undefined) updates.avatar = avatar;
    if (dob !== undefined) updates.dob = dob;
    if (joiningDate !== undefined) updates.joiningDate = joiningDate;
    if (projects !== undefined) updates.projects = projects;
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
        casualLeaves: Number(casualLeaves),
        ...additionalData
      };
      if (avatar !== undefined) updatedData.avatar = avatar;
      if (dob !== undefined) updatedData.dob = dob;
      if (joiningDate !== undefined) updatedData.joiningDate = joiningDate;
      if (projects !== undefined) updatedData.projects = projects;
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
        if (projects !== undefined) updatedUser.projects = projects;
        if (tasks !== undefined) updatedUser.tasks = tasks;
        if (jobType !== undefined) updatedUser.jobType = jobType;
        if (designation !== undefined) updatedUser.designation = designation;
        if (isProjectManager !== undefined) updatedUser.isProjectManager = isProjectManager;
        Object.assign(updatedUser, additionalData);
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
export const getAllAttendanceLogs = async (companyId = "") => {
  if (dbType === "firebase") {
    let qRef = collection(db, "attendance");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    const snapshot = await getDocs(qRef);
    const logs = snapshot.docs.map(doc => doc.data());
    return logs.sort((a, b) => b.date.localeCompare(a.date));
  } else {
    let logs = localDb.getAttendance();
    if (companyId) logs = logs.filter(l => l.companyId === companyId);
    return logs.sort((a, b) => b.date.localeCompare(a.date));
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
export const subscribeToAdminDashboard = (companyId, callback) => {
  if (dbType === "firebase") {
    let attCollection = collection(db, "attendance");
    if (companyId) attCollection = query(attCollection, where("companyId", "==", companyId));
    return onSnapshot(attCollection, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      logs.sort((a, b) => b.date.localeCompare(a.date));
      callback(logs);
    });
  } else {
    const handler = () => {
      let logs = localDb.getAttendance();
      if (companyId) logs = logs.filter(l => l.companyId === companyId);
      callback(logs.sort((a, b) => b.date.localeCompare(a.date)));
    };
    attendanceListeners.add(handler);
    handler(); // initial fire
    return () => {
      attendanceListeners.delete(handler);
    };
  }
};

// ----------------------------------------------------
// TASK TIMERS
// ----------------------------------------------------

export const startTaskTimer = async (userId, taskId) => {
  const timestamp = new Date().toISOString();
  if (dbType === "firebase") {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.tasks) {
        const taskIdx = userData.tasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
          userData.tasks[taskIdx].timerStartedAt = timestamp;
          await updateDoc(userRef, { tasks: userData.tasks });
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
    }
  } else {
    const users = localDb.getUsers();
    const uIdx = users.findIndex(u => u.uid === userId);
    if (uIdx !== -1 && users[uIdx].tasks) {
      const tIdx = users[uIdx].tasks.findIndex(t => t.id === taskId);
      if (tIdx !== -1) {
        users[uIdx].tasks[tIdx].timerStartedAt = timestamp;
        localStorage.setItem("att_users", JSON.stringify(users));

        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === userId) {
          cur.tasks[tIdx].timerStartedAt = timestamp;
          localDb.setCurrentUser(cur);
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
    }
  }
};

export const stopTaskTimer = async (userId, taskId, pmId) => {
  let elapsedMinutes = 0;
  if (dbType === "firebase") {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.tasks) {
        const taskIdx = userData.tasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1 && userData.tasks[taskIdx].timerStartedAt) {
          const startedAt = new Date(userData.tasks[taskIdx].timerStartedAt).getTime();
          elapsedMinutes = Math.round((Date.now() - startedAt) / 60000);

          userData.tasks[taskIdx].timerStartedAt = null;
          await updateDoc(userRef, { tasks: userData.tasks });
          window.dispatchEvent(new Event("local-auth-updated"));

          if (elapsedMinutes > 0) {
            const hrs = Math.floor(elapsedMinutes / 60);
            const mins = elapsedMinutes % 60;
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            await addTaskReport(taskId, userId, pmId, `Worked for ${timeStr}`);
          }
        }
      }
    }
  } else {
    const users = localDb.getUsers();
    const uIdx = users.findIndex(u => u.uid === userId);
    if (uIdx !== -1 && users[uIdx].tasks) {
      const tIdx = users[uIdx].tasks.findIndex(t => t.id === taskId);
      if (tIdx !== -1 && users[uIdx].tasks[tIdx].timerStartedAt) {
        const startedAt = new Date(users[uIdx].tasks[tIdx].timerStartedAt).getTime();
        elapsedMinutes = Math.round((Date.now() - startedAt) / 60000);

        users[uIdx].tasks[tIdx].timerStartedAt = null;
        localStorage.setItem("att_users", JSON.stringify(users));

        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === userId) {
          cur.tasks[tIdx].timerStartedAt = null;
          localDb.setCurrentUser(cur);
          window.dispatchEvent(new Event("local-auth-updated"));
        }

        if (elapsedMinutes > 0) {
          const hrs = Math.floor(elapsedMinutes / 60);
          const mins = elapsedMinutes % 60;
          const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          await addTaskReport(taskId, userId, pmId, `Worked for ${timeStr}`);
        }
      }
    }
  }
};

export const stopAllTaskTimers = async (userId) => {
  if (dbType === "firebase") {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.tasks) {
        let updated = false;
        for (let task of userData.tasks) {
          if (task.timerStartedAt) {
            const startedAt = new Date(task.timerStartedAt).getTime();
            const elapsedMinutes = Math.round((Date.now() - startedAt) / 60000);
            task.timerStartedAt = null;
            updated = true;

            if (elapsedMinutes > 0) {
              const hrs = Math.floor(elapsedMinutes / 60);
              const mins = elapsedMinutes % 60;
              const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
              await addTaskReport(task.id, userId, task.assignedBy, `Auto-paused. Worked for ${timeStr}`);
            }
          }
        }
        if (updated) {
          await updateDoc(userRef, { tasks: userData.tasks });
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
    }
  } else {
    const users = localDb.getUsers();
    const uIdx = users.findIndex(u => u.uid === userId);
    if (uIdx !== -1 && users[uIdx].tasks) {
      let updated = false;
      for (let task of users[uIdx].tasks) {
        if (task.timerStartedAt) {
          const startedAt = new Date(task.timerStartedAt).getTime();
          const elapsedMinutes = Math.round((Date.now() - startedAt) / 60000);
          task.timerStartedAt = null;
          updated = true;

          if (elapsedMinutes > 0) {
            const hrs = Math.floor(elapsedMinutes / 60);
            const mins = elapsedMinutes % 60;
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            await addTaskReport(task.id, userId, task.assignedBy, `Auto-paused. Worked for ${timeStr}`);
          }
        }
      }
      if (updated) {
        localStorage.setItem("att_users", JSON.stringify(users));
        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === userId) {
          cur.tasks = users[uIdx].tasks;
          localDb.setCurrentUser(cur);
          window.dispatchEvent(new Event("local-auth-updated"));
        }
      }
    }
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
export const uploadPaidLeave = async (title, startDate, endDate, description, status = "active", companyId = "") => {
  const newLeave = {
    id: dbType === "firebase" ? "" : "pl-" + Math.random().toString(36).substr(2, 9),
    title,
    startDate,
    endDate,
    status,
    description,
    createdAt: new Date().toISOString(),
    companyId
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

export const subscribeToPaidLeaves = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "paid_leaves");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
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
export const requestLeave = async (userId, userName, userDept, type, duration, startDate, endDate, reason, avatar, isEmergency = false, companyId = "") => {
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
    createdAt: new Date().toISOString(),
    companyId
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

export const subscribeToLeaveRequests = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "leave_requests");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
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
      if (companyId) list = list.filter(l => l.companyId === companyId);
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
export const requestRegularization = async (userId, userName, userDept, date, checkInTime, checkOutTime, reason, companyId = "") => {
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
    createdAt: new Date().toISOString(),
    companyId
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

        const attRef = doc(db, "attendance", recordId);
        const attSnap = await getDoc(attRef);
        let existingBreaks = [];
        if (attSnap.exists()) {
          existingBreaks = attSnap.data().breaks || [];
        }

        const attendanceData = {
          id: recordId,
          userId: reqData.userId,
          userName: reqData.userName,
          userDept: reqData.userDept,
          date: reqData.date,
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          status: "checked-out",
          breaks: existingBreaks,
          totalWorkingMinutes: workingMinutes,
          shortBreakBalance: 1800,
          longBreakBalance: 1800,
          bioBreakBalance: 900
        };

        await setDoc(attRef, attendanceData, { merge: true });
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

        const logs = localDb.getAttendance();
        const logIdx = logs.findIndex(log => log.id === recordId);
        let existingBreaks = [];
        if (logIdx !== -1) {
          existingBreaks = logs[logIdx].breaks || [];
        }

        const attendanceData = {
          id: recordId,
          userId: reqData.userId,
          userName: reqData.userName,
          userDept: reqData.userDept,
          date: reqData.date,
          checkInTime: checkInIso,
          checkOutTime: checkOutIso,
          status: "checked-out",
          breaks: existingBreaks,
          totalWorkingMinutes: workingMinutes,
          shortBreakBalance: 1800,
          longBreakBalance: 1800,
          bioBreakBalance: 900
        };

        if (logIdx !== -1) {
          logs[logIdx] = { ...logs[logIdx], ...attendanceData };
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

export const subscribeToRegularizationRequests = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "regularization_requests");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_regularizations")
        ? JSON.parse(localStorage.getItem("att_regularizations"))
        : [];
      if (companyId) list = list.filter(l => l.companyId === companyId);
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
// TEAM HUB  Channels, Direct Messages & File Sharing
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

const getLocalCompanies = () => {
  const raw = localStorage.getItem("att_companies");
  return raw ? JSON.parse(raw) : [];
};

const saveLocalCompanies = (companies) => {
  localStorage.setItem("att_companies", JSON.stringify(companies));
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
export const createChannel = async (name, description, creatorId, creatorName, companyId = "") => {
  const channelData = {
    id: dbType === "firebase" ? "" : "ch-" + Math.random().toString(36).substr(2, 9),
    name: name.toLowerCase().replace(/\s+/g, "-"),
    displayName: name,
    description: description || "",
    createdBy: creatorId,
    createdByName: creatorName,
    memberIds: [creatorId],
    isPrivate: false,
    createdAt: new Date().toISOString(),
    companyId
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
export const subscribeToChannels = (companyId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(collection(db, "channels"), where("companyId", "==", companyId || "")),
      (snapshot) => {
        const list = snapshot.docs.map(d => d.data());
        list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        callback(list);
      }
    );
  } else {
    const handler = () => callback(getLocalChannels().filter(c => c.companyId === companyId));
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
export const sendChatMessage = async (threadId, threadType, senderId, senderName, senderAvatar, text, fileData, companyId) => {
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
    timestamp: new Date().toISOString(),
    companyId: companyId || ""
  };

  let createdMsg;
  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "messages"), msg);
    await updateDoc(docRef, { id: docRef.id });
    createdMsg = { ...msg, id: docRef.id };
  } else {
    const messages = getLocalMessages();
    messages.push(msg);
    saveLocalMessages(messages);
    notifyMessageListeners(threadId);
    notifyAllMessagesListeners();
    createdMsg = msg;
  }

  // Trigger system notification
  if (threadType === "dm") {
    try {
      let otherId = null;
      if (dbType === "firebase") {
        const threadSnap = await getDoc(doc(db, "dm_threads", threadId));
        if (threadSnap.exists()) {
          otherId = threadSnap.data().participantIds.find(id => id !== senderId);
        }
      } else {
        const thread = getLocalDmThreads().find(t => t.id === threadId);
        if (thread) otherId = thread.participantIds.find(id => id !== senderId);
      }
      if (otherId) {
        createNotification(otherId, "New Message", `New message from ${senderName}`, "message", "/attendance/team-hub").catch(() => { });
      }
    } catch (e) { }
  } else if (threadType === "channel") {
    try {
      let memberIds = [];
      if (dbType === "firebase") {
        const chSnap = await getDoc(doc(db, "channels", threadId));
        if (chSnap.exists()) memberIds = chSnap.data().memberIds || [];
      } else {
        const ch = getLocalChannels().find(c => c.id === threadId);
        if (ch) memberIds = ch.memberIds || [];
      }
      memberIds.forEach(mId => {
        if (mId !== senderId) {
          createNotification(mId, "New Channel Message", `New message in channel by ${senderName}`, "message", "/attendance/team-hub").catch(() => { });
        }
      });
    } catch (e) { }
  }

  return createdMsg;
};

/**
 * Subscribe to messages for a thread (real-time)
 */
export const subscribeToMessages = (threadId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(
        collection(db, "messages"),
        where("threadId", "==", threadId)
      ),
      (snapshot) => {
        const msgs = snapshot.docs.map(d => d.data()); // include deleted so UI can show 'This message was deleted'
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
        .filter(m => m.threadId === threadId) // include deleted for UI display
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
export const subscribeToAllMessages = (companyId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(
        collection(db, "messages"),
        where("companyId", "==", companyId || "")
      ),
      (snapshot) => {
        const msgs = snapshot.docs.map(d => d.data()).filter(m => m.isDeleted === false);
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
        .filter(m => !m.isDeleted && m.companyId === companyId)
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
 * Mark a thread as read (updates centralized user read receipts)
 */
export const markThreadAsRead = async (userId, threadId) => {
  if (!userId || !threadId) return;
  const timestamp = new Date().toISOString();

  if (dbType === "firebase") {
    try {
      const docRef = doc(db, "users", userId);
      const updates = {};
      updates[`teamHubReadReceipts.${threadId}`] = timestamp;
      await updateDoc(docRef, updates);
    } catch (e) {
      console.warn("Failed to mark thread as read in Firebase:", e);
    }
  } else {
    try {
      const users = localDb.getUsers();
      const idx = users.findIndex(u => u.uid === userId);
      if (idx !== -1) {
        if (!users[idx].teamHubReadReceipts) {
          users[idx].teamHubReadReceipts = {};
        }
        users[idx].teamHubReadReceipts[threadId] = timestamp;
        localStorage.setItem("att_users", JSON.stringify(users));

        // Ensure local current user gets the live update
        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === userId) {
          if (!cur.teamHubReadReceipts) cur.teamHubReadReceipts = {};
          cur.teamHubReadReceipts[threadId] = timestamp;
          localDb.setCurrentUser(cur);
          notifyAuthListeners(cur);
        }
      }
    } catch (e) {
      console.warn("Failed to mark thread as read in local db:", e);
    }
  }
};

/**
 * Delete a message only for the current user
 */
export const deleteChatMessageForMe = async (messageId, userId) => {
  if (dbType === "firebase") {
    await updateDoc(doc(db, "messages", messageId), { deletedFor: arrayUnion(userId) });
  } else {
    const messages = getLocalMessages();
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      if (!messages[idx].deletedFor) messages[idx].deletedFor = [];
      if (!messages[idx].deletedFor.includes(userId)) {
        messages[idx].deletedFor.push(userId);
      }
      saveLocalMessages(messages);
      Object.values(messageListeners).forEach(set => set.forEach(cb => cb()));
      notifyAllMessagesListeners();
    }
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
 * Get all messages (admin only  for monitoring)
 */
export const getAllMessagesAdmin = async (companyId = "") => {
  if (dbType === "firebase") {
    let qRef = collection(db, "messages");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    const snapshot = await getDocs(qRef);
    const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return msgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } else {
    let msgs = getLocalMessages();
    if (companyId) msgs = msgs.filter(m => m.companyId === companyId);
    return msgs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
};

// ============================================================
// DIRECT MESSAGE THREAD FUNCTIONS
// ============================================================

/**
 * Get or create a DM thread between two users
 */
export const getOrCreateDmThread = async (userAId, userBId, userAName, userBName, companyId = "") => {
  // Canonical ID  always sorted so order doesn't matter
  const threadId = [userAId, userBId].sort().join("_dm_");

  if (dbType === "firebase") {
    const docRef = doc(db, "dm_threads", threadId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      const thread = {
        id: threadId,
        participantIds: [userAId, userBId],
        participantNames: { [userAId]: userAName, [userBId]: userBName },
        createdAt: new Date().toISOString(),
        companyId
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
      createdAt: new Date().toISOString(),
      companyId
    };
    threads.push(thread);
    saveLocalDmThreads(threads);
    return thread;
  }
};

/**
 * Get all DM threads for a user
 */
export const subscribeToDmThreads = (userId, companyId, callback) => {
  if (dbType === "firebase") {
    return onSnapshot(
      query(collection(db, "dm_threads"), where("companyId", "==", companyId || "")),
      (snapshot) => {
        const list = snapshot.docs.map(d => d.data()).filter(t => t.participantIds && t.participantIds.includes(userId));
        callback(list);
      }
    );
  } else {
    const handler = () => {
      const threads = getLocalDmThreads().filter(t => t.participantIds.includes(userId) && t.companyId === companyId);
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
export const getAllDmThreadsAdmin = async (companyId = "") => {
  if (dbType === "firebase") {
    let qRef = collection(db, "dm_threads");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    const snapshot = await getDocs(qRef);
    return snapshot.docs.map(d => d.data());
  } else {
    let threads = getLocalDmThreads();
    if (companyId) threads = threads.filter(t => t.companyId === companyId);
    return threads;
  }
};

/**
 * Upload a file to Firebase Storage (or Base64 data URL if local mode)
 * @param {File} file
 * @returns {Promise<{ id: string, name: string, url: string, mimeType: string, size: number }>}
 */
export const uploadFileToFirebase = async (file, companyId = "", folderType = "files") => {
  let fileToUpload = file;
  if (file.type && file.type.startsWith('image/')) {
    try {
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280,
        useWebWorker: true
      };
      const compressedBlob = await imageCompression(file, options);
      fileToUpload = new File([compressedBlob], file.name, { type: compressedBlob.type || file.type });
    } catch (error) {
      console.warn("Image compression failed, uploading original file:", error);
    }
  }

  // Try Cloudinary first
  let cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  let uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  let isCloudinaryEnabled = !!(cloudName && uploadPreset);

  if (companyId) {
    try {
      let company = null;
      if (dbType === "firebase") {
        const snap = await getDoc(doc(db, "companies", companyId));
        if (snap.exists()) {
          company = snap.data();
        }
      } else {
        const list = getLocalCompanies();
        company = list.find(c => c.id === companyId);
      }

      if (company && company.modules?.includes("cloudinary")) {
        isCloudinaryEnabled = true;
        if (company.cloudinaryCloudName) {
          cloudName = company.cloudinaryCloudName;
        }
        if (company.cloudinaryUploadPreset) {
          uploadPreset = company.cloudinaryUploadPreset;
        }
      }
    } catch (e) {
      console.warn("Failed to check company Cloudinary status, falling back to env:", e);
    }
  }

  if (isCloudinaryEnabled && cloudName && uploadPreset) {
    try {
      return await uploadFileToCloudinary(fileToUpload, companyId, folderType, cloudName, uploadPreset);
    } catch (cloudinaryError) {
      console.warn("Cloudinary upload failed, falling back to other storage:", cloudinaryError);
    }
  }


  if (dbType === "firebase") {
    try {
      if (!storage) {
        throw new Error("Firebase Storage is not initialized.");
      }
      // Generate a unique path/filename
      const uniqueId = Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      const fileExtension = fileToUpload.name ? fileToUpload.name.split(".").pop() : "bin";
      const filePath = `chat_files/${uniqueId}.${fileExtension}`;
      const fileRef = storageRef(storage, filePath);

      // Upload bytes with resumable task so we can cancel it on timeout
      const uploadTask = uploadBytesResumable(fileRef, fileToUpload);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          try {
            uploadTask.cancel(); // Abort the upload to stop background retries
          } catch (e) {
            console.error("Failed to cancel upload task:", e);
          }
          reject(new Error("Firebase Storage upload timed out after 5 minutes."));
        }, 300000)
      );

      // Race the upload task against the timeout
      await Promise.race([uploadTask, timeoutPromise]);

      // Get public/read download URL
      const downloadUrl = await getDownloadURL(fileRef);

      return {
        id: uniqueId,
        name: fileToUpload.name || "image.jpg",
        url: downloadUrl,
        mimeType: fileToUpload.type || "application/octet-stream",
        size: fileToUpload.size
      };
    } catch (storageError) {
      console.warn("Firebase Storage upload failed, falling back to local Base64 upload:", storageError);
      // Fallback to base64 encoding if file is small enough to fit in Firestore (Firestore limit is 1MB)
      if (fileToUpload.size > 800 * 1024) {
        throw new Error("File is too large to upload. Please select an image under 800KB.");
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            id: "fb-fallback-" + Date.now(),
            name: fileToUpload.name || "image.jpg",
            url: reader.result, // base64 data URL
            mimeType: fileToUpload.type || "application/octet-stream",
            size: fileToUpload.size,
            isFallback: true
          });
        };
        reader.onerror = (err) => {
          reject(new Error("Failed to read file locally: " + err.message));
        };
        reader.readAsDataURL(fileToUpload);
      });
    }
  } else {
    // Local DB Mode: Convert file to Base64 Data URL so it is fully self-contained!
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          id: "local-" + Date.now(),
          name: fileToUpload.name || "image.jpg",
          url: reader.result, // base64 data URL
          mimeType: fileToUpload.type || "application/octet-stream",
          size: fileToUpload.size,
          isLocal: true
        });
      };
      reader.onerror = (err) => {
        reject(new Error("Failed to read file locally: " + err.message));
      };
      reader.readAsDataURL(fileToUpload);
    });
  }
};

// ----------------------------------------------------
// PROJECT & TASK MANAGEMENT: TASK REPORTS
// ----------------------------------------------------

export const addTaskReport = async (taskId, employeeId, pmId, reportText) => {
  const timestamp = new Date().toISOString();
  const reportData = {
    taskId,
    employeeId,
    pmId,
    reportText,
    timestamp
  };

  if (dbType === "firebase") {
    await addDoc(collection(db, "task_reports"), reportData);

    // Update lastReportedAt on the user's task
    const userRef = doc(db, "users", employeeId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.tasks) {
        const taskIdx = userData.tasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
          userData.tasks[taskIdx].lastReportedAt = timestamp;
          await updateDoc(userRef, { tasks: userData.tasks });
        }
      }
    }
  } else {
    const current = localStorage.getItem("att_task_reports")
      ? JSON.parse(localStorage.getItem("att_task_reports"))
      : [];
    reportData.id = "report_" + Date.now();
    current.push(reportData);
    localStorage.setItem("att_task_reports", JSON.stringify(current));

    // Update lastReportedAt locally
    const users = localDb.getUsers();
    const uIdx = users.findIndex(u => u.uid === employeeId);
    if (uIdx !== -1 && users[uIdx].tasks) {
      const tIdx = users[uIdx].tasks.findIndex(t => t.id === taskId);
      if (tIdx !== -1) {
        users[uIdx].tasks[tIdx].lastReportedAt = timestamp;
        localStorage.setItem("att_users", JSON.stringify(users));

        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === employeeId) {
          cur.tasks[tIdx].lastReportedAt = timestamp;
          localDb.setCurrentUser(cur);
        }
      }
    }

    // Provide an event listener hook if we need real-time local updates
    window.dispatchEvent(new Event("local-reports-updated"));
    window.dispatchEvent(new Event("local-auth-updated"));
  }
};

export const updateTaskWarningSent = async (employeeId, taskId) => {
  const timestamp = new Date().toISOString();
  if (dbType === "firebase") {
    const userRef = doc(db, "users", employeeId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.tasks) {
        const taskIdx = userData.tasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
          userData.tasks[taskIdx].lastWarningSentAt = timestamp;
          await updateDoc(userRef, { tasks: userData.tasks });
        }
      }
    }
  } else {
    const users = localDb.getUsers();
    const uIdx = users.findIndex(u => u.uid === employeeId);
    if (uIdx !== -1 && users[uIdx].tasks) {
      const tIdx = users[uIdx].tasks.findIndex(t => t.id === taskId);
      if (tIdx !== -1) {
        users[uIdx].tasks[tIdx].lastWarningSentAt = timestamp;
        localStorage.setItem("att_users", JSON.stringify(users));

        const cur = localDb.getCurrentUser();
        if (cur && cur.uid === employeeId) {
          cur.tasks[tIdx].lastWarningSentAt = timestamp;
          localDb.setCurrentUser(cur);
        }
      }
    }
    window.dispatchEvent(new Event("local-auth-updated"));
  }
};

export const subscribeToTaskReports = (taskId, callback) => {
  if (dbType === "firebase") {
    const q = query(collection(db, "task_reports"), where("taskId", "==", taskId));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
    const q = query(collection(db, "notifications"), where("userId", "==", userId));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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

export const getCompanies = async () => {
  if (dbType === "firebase") {
    const snap = await getDocs(collection(db, "companies"));
    return snap.docs.map(d => d.data());
  } else {
    return getLocalCompanies();
  }
};

export const listenToCompany = (companyId, callback) => {
  let actualCompanyId = companyId;
  if (typeof companyId === 'object' && companyId !== null) {
    actualCompanyId = companyId.id;
  }
  if (!actualCompanyId || typeof actualCompanyId !== 'string') return () => { };

  if (dbType === "firebase") {
    return onSnapshot(doc(db, "companies", actualCompanyId), (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      }
    });
  } else {
    const interval = setInterval(() => {
      const companies = getLocalCompanies();
      const found = companies.find(c => c.id === actualCompanyId);
      if (found) {
        callback(found);
      }
    }, 2000);
    return () => clearInterval(interval);
  }
};

export const createCompany = async (companyData) => {
  const companyId = companyData.id || (dbType === "firebase" ? "" : "comp-" + Math.random().toString(36).substr(2, 9));
  const company = {
    ...companyData,
    id: companyId,
    status: companyData.status || "pending",
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    if (companyId) {
      await setDoc(doc(db, "companies", companyId), company);
    } else {
      const docRef = await addDoc(collection(db, "companies"), company);
      await updateDoc(docRef, { id: docRef.id });
      company.id = docRef.id;
    }
  } else {
    const companies = getLocalCompanies();
    companies.push(company);
    saveLocalCompanies(companies);
  }
  return company;
};

export const getCompanyStats = async (companyId = null) => {
  if (companyId) {
    if (dbType === "firebase") {
      let usersCount = 0;
      let tasksCount = 0;
      let attCount = 0;

      try {
        const usersSnap = await getDocs(query(collection(db, "users"), where("companyId", "==", companyId)));
        usersCount = usersSnap.size;

        const tasksSnap = await getDocs(query(collection(db, "tasks"), where("companyId", "==", companyId)));
        tasksCount = tasksSnap.docs.filter(d => d.data().status !== "Completed").length;

        const attSnap = await getDocs(query(collection(db, "attendanceLogs"), where("companyId", "==", companyId)));
        attCount = attSnap.size;
      } catch (err) {
        console.error("Error fetching specific company stats", err);
      }

      return {
        totalUsers: usersCount,
        totalTasks: tasksCount,
        totalAttendance: attCount
      };
    } else {
      const users = (typeof getLocalUsers === 'function' ? getLocalUsers() : (localDb.getUsers ? localDb.getUsers() : [])).filter(u => u.companyId === companyId);
      const tasksStr = localStorage.getItem("att_tasks");
      const tasks = tasksStr ? JSON.parse(tasksStr).filter(t => t.companyId === companyId && t.status !== "Completed") : [];
      const logsStr = localStorage.getItem("att_attendanceLogs");
      const logs = logsStr ? JSON.parse(logsStr).filter(l => l.companyId === companyId) : [];

      return {
        totalUsers: users.length,
        totalTasks: tasks.length,
        totalAttendance: logs.length
      };
    }
  }

  const companies = await getCompanies();
  return {
    total: companies.length,
    active: companies.filter(c => c.status === "active").length,
    pending: companies.filter(c => c.status === "pending").length,
    disabled: companies.filter(c => c.status === "disabled").length
  };
};




export const approveCompany = async (companyId) => {
  return updateCompanyStatus(companyId, "active");
};

export const autoMigrateFirebase = async () => {
  return true;
};

export const getCompanyBySlug = async (slug) => {
  if (!slug) return null;
  const companies = await getCompanies();
  return companies.find(c => c.slug?.toLowerCase() === slug.toLowerCase());
};

export const assignCompanyToUser = async (userId, companyId) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "users", userId);
    await updateDoc(docRef, { companyId });
  } else {
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.uid === userId);
    if (idx !== -1) {
      users[idx].companyId = companyId;
      saveLocalUsers(users);
    }
  }
  return true;
};

export const recoverLostData = async () => {
  if (dbType !== "firebase") return { success: false, msg: "Not in firebase mode" };

  try {
    const companiesSnapshot = await getDocs(collection(db, "companies"));
    const companies = companiesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const carrezza = companies.find(c => c.name.toLowerCase().includes("carrezza"));

    if (!carrezza) throw new Error("Carrezza company not found");
    const targetId = carrezza.id;

    let recoveredCount = 0;

    // 1. Get all users currently in Carrezza
    const usersSnap = await getDocs(query(collection(db, "users"), where("companyId", "==", targetId)));
    const carrezzaUserIds = usersSnap.docs.map(d => d.id);

    // 2. Recover Messages based on senderId
    const msgsSnap = await getDocs(collection(db, "messages"));
    for (const docSnap of msgsSnap.docs) {
      const data = docSnap.data();
      if (data.companyId !== targetId && carrezzaUserIds.includes(data.senderId)) {
        await updateDoc(doc(db, "messages", docSnap.id), { companyId: targetId });
        recoveredCount++;
      }
    }

    // 3. Recover Leave Requests based on userId
    const leavesSnap = await getDocs(collection(db, "leave_requests"));
    for (const docSnap of leavesSnap.docs) {
      const data = docSnap.data();
      if (data.companyId !== targetId && carrezzaUserIds.includes(data.userId)) {
        await updateDoc(doc(db, "leave_requests", docSnap.id), { companyId: targetId });
        recoveredCount++;
      }
    }

    // 4. Recover Attendance Logs based on userId
    const attSnap = await getDocs(collection(db, "attendance"));
    for (const docSnap of attSnap.docs) {
      const data = docSnap.data();
      if (data.companyId !== targetId && carrezzaUserIds.includes(data.userId)) {
        await updateDoc(doc(db, "attendance", docSnap.id), { companyId: targetId });
        recoveredCount++;
      }
    }

    // 5. Recover Channels and DM Threads based on missing/Organization companyId
    const recoverGeneral = async (collectionName) => {
      const snap = await getDocs(collection(db, collectionName));
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.companyId === "Organization" || data.companyId === "" || !data.companyId) {
          await updateDoc(doc(db, collectionName, docSnap.id), { companyId: targetId });
          recoveredCount++;
        }
      }
    };

    await recoverGeneral("channels");
    await recoverGeneral("dm_threads");

    return { success: true, msg: `Advanced Recovery Complete! Restored ${recoveredCount} orphaned records to Carrezza.` };
  } catch (err) {
    console.error("Recovery failed:", err);
    return { success: false, msg: err.message };
  }
};

export const recoverChatData = async () => {
  if (dbType !== "firebase") return { success: false, msg: "Not in firebase mode" };

  try {
    const companiesSnapshot = await getDocs(collection(db, "companies"));
    const companies = companiesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const carrezza = companies.find(c => c.name.toLowerCase().includes("carrezza"));

    if (!carrezza) throw new Error("Carrezza company not found");
    const targetId = carrezza.id;

    let recoveredCount = 0;

    const usersSnap = await getDocs(query(collection(db, "users"), where("companyId", "==", targetId)));
    const carrezzaUserIds = usersSnap.docs.map(d => d.id);

    const msgsSnap = await getDocs(collection(db, "messages"));
    for (const docSnap of msgsSnap.docs) {
      const data = docSnap.data();
      if (!data.companyId || (data.companyId !== targetId && carrezzaUserIds.includes(data.senderId))) {
        await updateDoc(doc(db, "messages", docSnap.id), { companyId: targetId });
        recoveredCount++;
      }
    }

    const recoverGeneral = async (collectionName) => {
      const snap = await getDocs(collection(db, collectionName));
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (!data.companyId || data.companyId === "Organization" || data.companyId === "") {
          await updateDoc(doc(db, collectionName, docSnap.id), { companyId: targetId });
          recoveredCount++;
        }
      }
    };

    await recoverGeneral("channels");
    await recoverGeneral("dm_threads");

    return { success: true, msg: `Chat Recovery Complete! Restored ${recoveredCount} orphaned chat records to Carrezza.` };
  } catch (err) {
    console.error("Chat recovery failed:", err);
    return { success: false, msg: err.message };
  }
};

// ----------------------------------------------------
// DAILY ACTIVITY REPORT LOG APIs
// ----------------------------------------------------

export const subscribeToDailyReports = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "daily_reports");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.date.localeCompare(a.date));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_daily_reports")
        ? JSON.parse(localStorage.getItem("att_daily_reports"))
        : [];
      if (companyId) list = list.filter(l => l.companyId === companyId);
      list.sort((a, b) => b.date.localeCompare(a.date));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

export const subscribeToMyDailyReports = (userId, callback) => {
  if (dbType === "firebase") {
    const qRef = query(collection(db, "daily_reports"), where("userId", "==", userId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.date.localeCompare(a.date));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_daily_reports")
        ? JSON.parse(localStorage.getItem("att_daily_reports"))
        : [];
      list = list.filter(l => l.userId === userId);
      list.sort((a, b) => b.date.localeCompare(a.date));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

export const addDailyReport = async (reportData) => {
  const newReport = {
    id: dbType === "firebase" ? "" : "daily-" + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    supervisorRemarks: "",
    ...reportData
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "daily_reports"), newReport);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_daily_reports")
      ? JSON.parse(localStorage.getItem("att_daily_reports"))
      : [];
    current.push(newReport);
    localStorage.setItem("att_daily_reports", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

export const updateDailyReport = async (id, updates) => {
  const dataToUpdate = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = doc(db, "daily_reports", id);
    await updateDoc(docRef, dataToUpdate);
  } else {
    const current = localStorage.getItem("att_daily_reports")
      ? JSON.parse(localStorage.getItem("att_daily_reports"))
      : [];
    const index = current.findIndex(r => r.id === id);
    if (index !== -1) {
      current[index] = { ...current[index], ...dataToUpdate };
      localStorage.setItem("att_daily_reports", JSON.stringify(current));
      notifyNoticeListeners();
    }
  }
};

export const deleteDailyReport = async (id) => {
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "daily_reports", id));
  } else {
    const current = localStorage.getItem("att_daily_reports")
      ? JSON.parse(localStorage.getItem("att_daily_reports"))
      : [];
    const filtered = current.filter(r => r.id !== id);
    localStorage.setItem("att_daily_reports", JSON.stringify(filtered));
    notifyNoticeListeners();
  }
};

// ----------------------------------------------------
// WEEKLY REPORTS APIs
// ----------------------------------------------------

export const subscribeToWeeklyReports = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "weekly_reports");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_weekly_reports")
        ? JSON.parse(localStorage.getItem("att_weekly_reports"))
        : [];
      if (companyId) list = list.filter(l => l.companyId === companyId);
      list.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
      callback(list);
    };
    noticeListeners.add(handler);
    handler();
    return () => {
      noticeListeners.delete(handler);
    };
  }
};

export const addWeeklyReport = async (reportData) => {
  const newReport = {
    id: dbType === "firebase" ? "" : "weekly-" + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    ...reportData
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "weekly_reports"), newReport);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_weekly_reports")
      ? JSON.parse(localStorage.getItem("att_weekly_reports"))
      : [];
    current.push(newReport);
    localStorage.setItem("att_weekly_reports", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

export const updateWeeklyReport = async (id, updates) => {
  const dataToUpdate = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = doc(db, "weekly_reports", id);
    await updateDoc(docRef, dataToUpdate);
  } else {
    const current = localStorage.getItem("att_weekly_reports")
      ? JSON.parse(localStorage.getItem("att_weekly_reports"))
      : [];
    const index = current.findIndex(r => r.id === id);
    if (index !== -1) {
      current[index] = { ...current[index], ...dataToUpdate };
      localStorage.setItem("att_weekly_reports", JSON.stringify(current));
      notifyNoticeListeners();
    }
  }
};

export const deleteWeeklyReport = async (id) => {
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "weekly_reports", id));
  } else {
    const current = localStorage.getItem("att_weekly_reports")
      ? JSON.parse(localStorage.getItem("att_weekly_reports"))
      : [];
    const filtered = current.filter(r => r.id !== id);
    localStorage.setItem("att_weekly_reports", JSON.stringify(filtered));
    notifyNoticeListeners();
  }
};

export const getCompanyNameById = async (companyId) => {
  if (!companyId) return "General";
  try {
    const companies = await getCompanies();
    const company = companies.find(c => c.id === companyId);
    return company ? company.name : "General";
  } catch (error) {
    console.error("Error getting company name:", error);
    return "General";
  }
};

export const uploadFileToCloudinary = async (file, companyId = "", folderType = "files", customCloudName = "", customUploadPreset = "") => {
  const cloudName = customCloudName || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dcfsh85uq";
  const uploadPreset = customUploadPreset || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "hrms_preset";

  let orgName = "General";
  if (companyId) {
    orgName = await getCompanyNameById(companyId);
  }

  const cleanOrgName = orgName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
  const folderPath = `HRMS/${cleanOrgName}/${folderType}`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folderPath);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudinary upload failed: ${errText}`);
  }

  const data = await response.json();

  return {
    id: data.public_id,
    name: file.name || data.original_filename || "file",
    url: data.secure_url,
    mimeType: file.type || `${data.resource_type}/${data.format}`,
    size: file.size || data.bytes
  };
};

// ----------------------------------------------------
// ASSET MANAGEMENT APIs
// ----------------------------------------------------

export const subscribeToAssets = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "assets");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_assets")
        ? JSON.parse(localStorage.getItem("att_assets"))
        : [];
      if (companyId) list = list.filter(l => l.companyId === companyId);
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

export const addAsset = async (assetData) => {
  const newAsset = {
    id: dbType === "firebase" ? "" : "asset-" + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    ...assetData
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "assets"), newAsset);
    await updateDoc(docRef, { id: docRef.id });
  } else {
    const current = localStorage.getItem("att_assets")
      ? JSON.parse(localStorage.getItem("att_assets"))
      : [];
    current.push(newAsset);
    localStorage.setItem("att_assets", JSON.stringify(current));
    notifyNoticeListeners();
  }
};

export const updateAsset = async (id, updates) => {
  const dataToUpdate = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = doc(db, "assets", id);
    await updateDoc(docRef, dataToUpdate);
  } else {
    const current = localStorage.getItem("att_assets")
      ? JSON.parse(localStorage.getItem("att_assets"))
      : [];
    const index = current.findIndex(a => a.id === id);
    if (index !== -1) {
      current[index] = { ...current[index], ...dataToUpdate };
      localStorage.setItem("att_assets", JSON.stringify(current));
      notifyNoticeListeners();
    }
  }
};

export const deleteAsset = async (id) => {
  if (dbType === "firebase") {
    await deleteDoc(doc(db, "assets", id));
  } else {
    const current = localStorage.getItem("att_assets")
      ? JSON.parse(localStorage.getItem("att_assets"))
      : [];
    const filtered = current.filter(a => a.id !== id);
    localStorage.setItem("att_assets", JSON.stringify(filtered));
    notifyNoticeListeners();
  }
};

// ==========================================
// PAYROLL MODULE (Indian Employment Law)
// ==========================================

export const subscribeToCompanyPayroll = (companyId, month, year, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "payroll", companyId, "employeePayroll");
    if (month && year) {
      qRef = query(qRef, where("month", "==", month), where("year", "==", year));
    }
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(list);
    });
  } else {
    const handler = (updatedCompanyId) => {
      if (updatedCompanyId && updatedCompanyId !== companyId) return;
      const current = localStorage.getItem(`att_payroll_${companyId}`)
        ? JSON.parse(localStorage.getItem(`att_payroll_${companyId}`))
        : [];
      const filtered = current.filter(p => (!month || p.month === month) && (!year || p.year === String(year)));
      callback(filtered);
    };
    payrollListeners.add(handler);
    handler(companyId);
    return () => payrollListeners.delete(handler);
  }
};

export const saveEmployeePayroll = async (companyId, employeeId, payrollData) => {
  if (dbType === "firebase") {
    const month = payrollData.month;
    const year = payrollData.year;
    const recordId = `${employeeId}_${month}_${year}`;
    const docRef = doc(db, "payroll", companyId, "employeePayroll", recordId);
    await setDoc(docRef, {
      ...payrollData,
      employeeId,
      companyId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } else {
    const current = localStorage.getItem(`att_payroll_${companyId}`)
      ? JSON.parse(localStorage.getItem(`att_payroll_${companyId}`))
      : [];
    const recordId = `${employeeId}_${payrollData.month}_${payrollData.year}`;
    const idx = current.findIndex(p => p.id === recordId);
    const newRecord = { ...payrollData, employeeId, companyId, id: recordId, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      current[idx] = newRecord;
    } else {
      current.push(newRecord);
    }
    localStorage.setItem(`att_payroll_${companyId}`, JSON.stringify(current));
    notifyPayrollListeners(companyId);
  }
};

export const deleteEmployeePayroll = async (companyId, employeeId, month, year) => {
  if (dbType === "firebase") {
    const recordId = `${employeeId}_${month}_${year}`;
    const docRef = doc(db, "payroll", companyId, "employeePayroll", recordId);
    await deleteDoc(docRef);
  } else {
    const current = localStorage.getItem(`att_payroll_${companyId}`)
      ? JSON.parse(localStorage.getItem(`att_payroll_${companyId}`))
      : [];
    const recordId = `${employeeId}_${month}_${year}`;
    const filtered = current.filter(p => p.id !== recordId);
    localStorage.setItem(`att_payroll_${companyId}`, JSON.stringify(filtered));
    notifyPayrollListeners(companyId);
  }
};

export const wipeAllEmployeePayrolls = async (companyId) => {
  if (dbType === "firebase") {
    const qRef = collection(db, "payroll", companyId, "employeePayroll");
    const snapshot = await getDocs(qRef);
    const promises = snapshot.docs.map(d => deleteDoc(doc(db, "payroll", companyId, "employeePayroll", d.id)));
    await Promise.all(promises);
  } else {
    localStorage.removeItem(`att_payroll_${companyId}`);
    notifyPayrollListeners(companyId);
  }
};

export const updateEmployeeGrossSalary = async (userId, grossSalary, paidDays) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "users", userId);
    const updates = { grossSalary: Number(grossSalary) };
    if (paidDays !== undefined) updates.paidDays = Number(paidDays);
    await updateDoc(docRef, updates);
  } else {
    const current = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
    const idx = current.findIndex(u => u.uid === userId);
    if (idx >= 0) {
      current[idx].grossSalary = Number(grossSalary);
      if (paidDays !== undefined) current[idx].paidDays = Number(paidDays);
      localStorage.setItem("att_users", JSON.stringify(current));
    }
  }
};



export const checkDomainAuthorization = async (email, companySlug) => {
  try {
    const domainParts = email.split('@');
    if (domainParts.length !== 2) return { allowed: true };
    const userDomain = domainParts[1].toLowerCase();
    
    let targetCompanyId = null;
    if (companySlug) {
      const company = await getCompanyBySlug(companySlug);
      if (company) targetCompanyId = company.id;
    }

    if (dbType === "firebase") {
      // Find who owns this domain
      const domainsRef = collection(db, "companyDomains");
      const q = query(domainsRef, where("domain", "==", userDomain), where("status", "==", "VERIFIED"));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const ownerCompanyId = snapshot.docs[0].data().companyId;
        // The domain is claimed.
        if (targetCompanyId && targetCompanyId !== ownerCompanyId) {
          // They are on Company A's page, but email belongs to Company B
          return { allowed: false, reason: "This email domain belongs to a different organization." };
        }
        // If targetCompanyId matches, or there is no targetCompanyId (auto-assign), it's fine.
        return { allowed: true };
      }

      // If the domain is NOT claimed, but they are trying to join a specific company
      if (targetCompanyId) {
        // We must check if the target company has ANY verified domains.
        const q2 = query(domainsRef, where("companyId", "==", targetCompanyId), where("status", "==", "VERIFIED"));
        const snapshot2 = await getDocs(q2);
        if (!snapshot2.empty) {
          // The company has restricted domains, and the user's domain is not one of them (since it's not claimed)
          return { allowed: false, reason: "Only users with authorized email domains can join this organization." };
        }
      }
    }
    return { allowed: true };
  } catch (error) {
    console.warn("Domain authorization check failed:", error);
    return { allowed: true }; // Fail open if error
  }
};

const externalLinksListeners = new Set();
const getLocalExternalLinks = () => {
  const raw = localStorage.getItem("att_external_links");
  return raw ? JSON.parse(raw) : [];
};
const saveLocalExternalLinks = (links) => {
  localStorage.setItem("att_external_links", JSON.stringify(links));
};
const notifyExternalLinksListeners = () => {
  externalLinksListeners.forEach(cb => cb());
};

export const subscribeToExternalLinks = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "external_links");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = getLocalExternalLinks();
      if (companyId) list = list.filter(l => l.companyId === companyId);
      callback(list);
    };
    externalLinksListeners.add(handler);
    handler();
    return () => {
      externalLinksListeners.delete(handler);
    };
  }
};

export const generateExternalLink = async (
  userId,
  companyId,
  projectId,
  projectName,
  pmId,
  pmName,
  clientEmail,
  clientName
) => {
  // Create a secure chat channel first
  const channelName = `Client-${clientName.trim() || "Chat"}-${projectName.trim()}`;
  const channel = await createChannel(channelName, `Secure external link client chat for project ${projectName}`, pmId, pmName, companyId);
  const channelId = channel.id;
  const linkToken = "link-" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

  const newLink = {
    id: dbType === "firebase" ? "" : "ext-" + Math.random().toString(36).substr(2, 9),
    userId,
    companyId,
    projectId,
    projectName,
    pmId,
    pmName,
    clientEmail,
    clientName,
    linkToken,
    channelId,
    status: "active",
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "external_links"), newLink);
    await updateDoc(docRef, { id: docRef.id });
    return { ...newLink, id: docRef.id };
  } else {
    const links = getLocalExternalLinks();
    links.push(newLink);
    saveLocalExternalLinks(links);
    notifyExternalLinksListeners();
    return newLink;
  }
};

export const revokeExternalLink = async (linkId, companyId) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "external_links", linkId);
    await updateDoc(docRef, { status: "revoked" });
  } else {
    const links = getLocalExternalLinks();
    const idx = links.findIndex(l => l.id === linkId);
    if (idx >= 0) {
      links[idx].status = "revoked";
      saveLocalExternalLinks(links);
      notifyExternalLinksListeners();
    }
  }
};

export const getExternalLinkByToken = async (linkToken) => {
  if (dbType === "firebase") {
    const qRef = query(collection(db, "external_links"), where("linkToken", "==", linkToken));
    const snap = await getDocs(qRef);
    if (snap.empty) return null;
    return { ...snap.docs[0].data(), id: snap.docs[0].id };
  } else {
    const links = getLocalExternalLinks();
    const link = links.find(l => l.linkToken === linkToken);
    return link || null;
  }
};

// ----------------------------------------------------
// PROJECT MANAGEMENT HELPERS
// ----------------------------------------------------

const projectListeners = new Set();
const notifyProjectListeners = () => {
  projectListeners.forEach(cb => cb());
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "att_projects") {
      notifyProjectListeners();
    }
  });
}

export const createProject = async (projectData) => {
  const newProj = {
    id: dbType === "firebase" ? "" : "proj-" + Math.random().toString(36).substr(2, 9),
    name: projectData.name,
    startDate: projectData.startDate,
    endDate: projectData.endDate,
    managerId: projectData.managerId,
    teamMembers: projectData.teamMembers || [projectData.managerId],
    companyId: projectData.companyId,
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "projects"), newProj);
    await updateDoc(docRef, { id: docRef.id });
    return { ...newProj, id: docRef.id };
  } else {
    const current = localStorage.getItem("att_projects")
      ? JSON.parse(localStorage.getItem("att_projects"))
      : [];
    current.push(newProj);
    localStorage.setItem("att_projects", JSON.stringify(current));
    notifyProjectListeners();
    return newProj;
  }
};

export const subscribeToProjects = (companyId, callback) => {
  if (dbType === "firebase") {
    let qRef = collection(db, "projects");
    if (companyId) qRef = query(qRef, where("companyId", "==", companyId));
    return onSnapshot(qRef, (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    });
  } else {
    const handler = () => {
      let list = localStorage.getItem("att_projects")
        ? JSON.parse(localStorage.getItem("att_projects"))
        : [];
      if (companyId) list = list.filter(p => p.companyId === companyId);
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(list);
    };
    projectListeners.add(handler);
    handler();
    return () => {
      projectListeners.delete(handler);
    };
  }
};

export const updateProjectTeam = async (projectId, teamMembers) => {
  if (dbType === "firebase") {
    const docRef = doc(db, "projects", projectId);
    await updateDoc(docRef, { teamMembers });
  } else {
    const current = localStorage.getItem("att_projects")
      ? JSON.parse(localStorage.getItem("att_projects"))
      : [];
    const idx = current.findIndex(p => p.id === projectId);
    if (idx !== -1) {
      current[idx].teamMembers = teamMembers;
      localStorage.setItem("att_projects", JSON.stringify(current));
      notifyProjectListeners();
    }
  }
};

export const addTeamMemberToProject = async (projectId, userId, projectName) => {
  if (dbType === "firebase") {
    const projRef = doc(db, "projects", projectId);
    const projSnap = await getDoc(projRef);
    if (projSnap.exists()) {
      const projData = projSnap.data();
      const currentTeam = projData.teamMembers || [];
      if (!currentTeam.includes(userId)) {
        const newTeam = [...currentTeam, userId];
        await updateDoc(projRef, { teamMembers: newTeam });
      }
    }

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const currentProjects = uData.projects?.length ? uData.projects : (uData.project ? [uData.project] : []);
      const updates = { isProjectManager: false };
      if (!currentProjects.includes(projectName)) {
        const newProjects = [...currentProjects, projectName];
        updates.projects = newProjects;
        updates.project = newProjects[0] || "";
      }
      await updateDoc(userRef, updates);
      window.dispatchEvent(new Event("local-auth-updated"));
    }
  } else {
    const currentProjs = localStorage.getItem("att_projects")
      ? JSON.parse(localStorage.getItem("att_projects"))
      : [];
    const pIdx = currentProjs.findIndex(p => p.id === projectId);
    if (pIdx !== -1) {
      const currentTeam = currentProjs[pIdx].teamMembers || [];
      if (!currentTeam.includes(userId)) {
        currentProjs[pIdx].teamMembers = [...currentTeam, userId];
        localStorage.setItem("att_projects", JSON.stringify(currentProjs));
        notifyProjectListeners();
      }
    }

    const users = localStorage.getItem("att_users") ? JSON.parse(localStorage.getItem("att_users")) : [];
    const uIdx = users.findIndex(u => u.uid === userId);
    if (uIdx !== -1) {
      const currentProjects = users[uIdx].projects?.length ? users[uIdx].projects : (users[uIdx].project ? [users[uIdx].project] : []);
      // Always ensure team members do not gain project manager access
      users[uIdx].isProjectManager = false;
      if (!currentProjects.includes(projectName)) {
        const newProjects = [...currentProjects, projectName];
        users[uIdx].projects = newProjects;
        users[uIdx].project = newProjects[0] || "";
      }
      localStorage.setItem("att_users", JSON.stringify(users));
      window.dispatchEvent(new Event("local-auth-updated"));
    }
  }
};




export const deleteProject = async (projectId) => {
  if (getDbType() === 'firebase') {
    await deleteDoc(doc(db, 'projects', projectId));
  } else {
    let projs = JSON.parse(localStorage.getItem('att_projects') || '[]');
    projs = projs.filter(p => p.id !== projectId);
    localStorage.setItem('att_projects', JSON.stringify(projs));
    notifyProjectListeners();
  }
};

export const updateProject = async (projectId, updates) => {
  if (getDbType() === 'firebase') {
    await updateDoc(doc(db, 'projects', projectId), updates);
  } else {
    let projs = JSON.parse(localStorage.getItem('att_projects') || '[]');
    const idx = projs.findIndex(p => p.id === projectId);
    if (idx !== -1) {
      projs[idx] = { ...projs[idx], ...updates };
      localStorage.setItem('att_projects', JSON.stringify(projs));
      notifyProjectListeners();
    }
  }
};

// ----------------------------------------------------
// LANDING PAGE CONFIG
// ----------------------------------------------------

export const getLandingPageConfig = async () => {
  if (getDbType() === 'firebase') {
    try {
      const docRef = doc(db, 'settings', 'landing_page');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (e) {
      console.warn("Error fetching landing page config", e);
      return null;
    }
  } else {
    const config = localStorage.getItem('att_landing_page_config');
    return config ? JSON.parse(config) : null;
  }
};

export const updateLandingPageConfig = async (configData) => {
  if (getDbType() === 'firebase') {
    const docRef = doc(db, 'settings', 'landing_page');
    await setDoc(docRef, configData, { merge: true });
  } else {
    localStorage.setItem('att_landing_page_config', JSON.stringify(configData));
  }
  return true;
};

// ----------------------------------------------------
// ENVIRONMENT SETUP CONFIG
// ----------------------------------------------------

export const addEnvironmentSetting = async (companyId, settingData) => {
  if (getDbType() === 'firebase') {
    const docRef = doc(collection(db, 'companies', companyId, 'environment_settings'));
    await setDoc(docRef, { ...settingData, id: docRef.id, createdAt: new Date().toISOString() });
    return docRef.id;
  } else {
    const current = JSON.parse(localStorage.getItem(`env_settings_${companyId}`) || '[]');
    const id = Date.now().toString();
    current.push({ ...settingData, id, createdAt: new Date().toISOString() });
    localStorage.setItem(`env_settings_${companyId}`, JSON.stringify(current));
    return id;
  }
};

export const updateEnvironmentSetting = async (companyId, id, settingData) => {
  if (getDbType() === 'firebase') {
    const docRef = doc(db, 'companies', companyId, 'environment_settings', id);
    await setDoc(docRef, { ...settingData, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } else {
    const current = JSON.parse(localStorage.getItem(`env_settings_${companyId}`) || '[]');
    const index = current.findIndex(s => s.id === id);
    if (index !== -1) {
      current[index] = { ...current[index], ...settingData, updatedAt: new Date().toISOString() };
      localStorage.setItem(`env_settings_${companyId}`, JSON.stringify(current));
    }
    return true;
  }
};

export const deleteEnvironmentSetting = async (companyId, id) => {
  if (getDbType() === 'firebase') {
    const docRef = doc(db, 'companies', companyId, 'environment_settings', id);
    await deleteDoc(docRef);
    return true;
  } else {
    let current = JSON.parse(localStorage.getItem(`env_settings_${companyId}`) || '[]');
    current = current.filter(s => s.id !== id);
    localStorage.setItem(`env_settings_${companyId}`, JSON.stringify(current));
    return true;
  }
};

export const subscribeToEnvironmentSettings = (companyId, callback) => {
  if (getDbType() === 'firebase') {
    const q = query(collection(db, 'companies', companyId, 'environment_settings'));
    return onSnapshot(q, (snapshot) => {
      const settings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(settings);
    }, (error) => {
      console.warn("Error subscribing to environment settings:", error);
      callback([]);
    });
  } else {
    const current = JSON.parse(localStorage.getItem(`env_settings_${companyId}`) || '[]');
    callback(current);
    const interval = setInterval(() => {
      const updated = JSON.parse(localStorage.getItem(`env_settings_${companyId}`) || '[]');
      callback(updated);
    }, 2000);
    return () => clearInterval(interval);
  }
};

// ----------------------------------------------------
// ROLES & PERMISSIONS FUNCTIONS
// ----------------------------------------------------
export const createRole = async (companyId, roleData) => {
  const newRole = {
    ...roleData,
    companyId,
    createdAt: new Date().toISOString()
  };
  
  if (getDbType() === 'firebase') {
    const docRef = await addDoc(collection(db, 'companies', companyId, 'roles'), newRole);
    return docRef.id;
  } else {
    const roles = localDb.getRoles();
    const id = "role_" + Date.now();
    roles.push({ ...newRole, id });
    localDb.saveRoles(roles);
    return id;
  }
};

export const updateRole = async (companyId, roleId, roleData) => {
  if (getDbType() === 'firebase') {
    const roleRef = doc(db, 'companies', companyId, 'roles', roleId);
    await updateDoc(roleRef, { ...roleData, updatedAt: new Date().toISOString() });
  } else {
    const roles = localDb.getRoles();
    const idx = roles.findIndex(r => r.id === roleId && r.companyId === companyId);
    if (idx !== -1) {
      roles[idx] = { ...roles[idx], ...roleData, updatedAt: new Date().toISOString() };
      localDb.saveRoles(roles);
    }
  }
};

export const deleteRole = async (companyId, roleId) => {
  if (getDbType() === 'firebase') {
    const roleRef = doc(db, 'companies', companyId, 'roles', roleId);
    await deleteDoc(roleRef);
  } else {
    let roles = localDb.getRoles();
    roles = roles.filter(r => !(r.id === roleId && r.companyId === companyId));
    localDb.saveRoles(roles);
  }
};

export const subscribeToRoles = (companyId, callback) => {
  if (getDbType() === 'firebase') {
    const q = query(collection(db, 'companies', companyId, 'roles'));
    return onSnapshot(q, (snapshot) => {
      const roles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(roles);
    }, (error) => {
      console.warn("Error subscribing to roles:", error);
      callback([]);
    });
  } else {
    const fetchLocal = () => localDb.getRoles().filter(r => r.companyId === companyId);
    callback(fetchLocal());
    const interval = setInterval(() => callback(fetchLocal()), 2000);
    return () => clearInterval(interval);
  }
};

