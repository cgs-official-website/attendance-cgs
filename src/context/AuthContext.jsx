import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  registerUser, 
  loginUser, 
  logoutUser, 
  onAuthUserChanged,
  getDbType 
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

  const signup = async (name, department, programType, email, password, shiftStart, shiftEnd) => {
    setLoading(true);
    try {
      const user = await registerUser(name, department, programType, email, password, shiftStart, shiftEnd);
      setCurrentUser(user);
      return user;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const user = await loginUser(email, password);
      setCurrentUser(user);
      return user;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    currentUser,
    loading,
    dbMode,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
