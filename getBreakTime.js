import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function findBreakTime() {
  try {
    await signInWithEmailAndPassword(auth, "admin@teamcarrezza.com", "12345678");
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
       await createUserWithEmailAndPassword(auth, "admin@teamcarrezza.com", "12345678");
    } else {
       console.log("Login error:", err);
       process.exit(1);
    }
  }

  const usersRef = collection(db, "users");
  const usersSnapshot = await getDocs(usersRef);
  let targetUser = null;
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.name && data.name.toLowerCase().includes("swetha")) {
      targetUser = data;
    }
  });

  if (!targetUser) {
    console.log("User Swetha not found in database.");
    process.exit(0);
  }

  console.log("Found User UID:", targetUser.uid, "Name:", targetUser.name);

  const attRef = collection(db, "attendance");
  const q = query(attRef, where("userId", "==", targetUser.uid));
  const attSnapshot = await getDocs(q);
  
  // Try to find today's date "2026-08-11"
  let found = false;
  attSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.date === "2026-08-11" || data.date === "2026-08-12" || data.date === "2026-08-10") {
      console.log(`Found record for date: ${data.date}`);
      console.log("Breaks:", JSON.stringify(data.breaks, null, 2));
      console.log("Current session breaks:", JSON.stringify(data.currentSessionBreaks, null, 2));
      found = true;
    }
  });
  
  if(!found) {
     console.log("No attendance record found for dates around 2026-08-11");
  }
  
  process.exit(0);
}

findBreakTime().catch(console.error);
