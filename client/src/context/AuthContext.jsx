import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  registerUser, 
  loginUser, 
  logoutUser, 
  onAuthUserChanged,
  getDbType,
  sendPasswordReset,
  confirmPasswordReset,
  changeUserPassword,
  verifyLoginOtp as verifyOtpService,
  resendLoginOtp as resendOtpService
} from "../firebase";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbMode, setDbMode] = useState(getDbType());

  useEffect(() => {
    // Listen to authentication status change
    const unsubscribe = onAuthUserChanged((user) => {
      setCurrentUser(user);
      setLoading(false);
      setDbMode(getDbType());
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const signup = async (name, department, programType, email, password, shiftStart, shiftEnd, employeeId = "", companySlug = "") => {
    const user = await registerUser(name, department, programType, email, password, shiftStart, shiftEnd, 25, 10, 6, "", "", "", [], "Full-time", "", false, employeeId, companySlug);
    setCurrentUser(user);
    return user;
  };

  const login = async (email, password, companySlug = "") => {
    const res = await loginUser(email, password, companySlug);
    if (!res?.mfaRequired) {
      setCurrentUser(res);
    }
    return res;
  };

  const verifyLoginOtp = async (pendingToken, otp) => {
    const user = await verifyOtpService(pendingToken, otp);
    setCurrentUser(user);
    return user;
  };

  const resendLoginOtp = async (pendingToken) => {
    return await resendOtpService(pendingToken);
  };

  const logout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  const updateCurrentUserState = (newData) => {
    setCurrentUser(prev => prev ? { ...prev, ...newData } : null);
  };

  const value = {
    currentUser,
    loading,
    dbMode,
    signup,
    login,
    verifyLoginOtp,
    resendLoginOtp,
    logout,
    updateCurrentUserState,
    sendPasswordReset,
    confirmPasswordReset,
    changeUserPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
