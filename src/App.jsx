import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./components/DashboardLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/UserDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import History from "./pages/History";
import Profile from "./pages/Profile";

// Protected Route Component for general logged-in users
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Protected Route Component for Admin only
function AdminRoute({ children }) {
  const { currentUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (currentUser.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

// Public Route Component (Login, Register) - redirects logged-in users
function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  
  if (currentUser) {
    if (currentUser.role === "admin") {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

export default function App() {
  const { currentUser } = useAuth();

  return (
    <div className="flex flex-col min-h-screen w-full">
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } 
        />

        {/* User Protected Routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                {currentUser?.role === "admin" ? <Navigate to="/admin" replace /> : <UserDashboard />}
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/history" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                {currentUser?.role === "admin" ? <Navigate to="/admin" replace /> : <History />}
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Profile />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />

        {/* Admin Protected Routes */}
        <Route 
          path="/admin" 
          element={
            <AdminRoute>
              <DashboardLayout>
                <AdminDashboard />
              </DashboardLayout>
            </AdminRoute>
          } 
        />

        {/* Catch-all redirect */}
        <Route 
          path="*" 
          element={
            currentUser 
              ? currentUser.role === "admin" 
                ? <Navigate to="/admin" replace /> 
                : <Navigate to="/dashboard" replace />
              : <Navigate to="/login" replace />
          } 
        />
      </Routes>
    </div>
  );
}

