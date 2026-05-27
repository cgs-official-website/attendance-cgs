import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { updateUserRecord } from "../firebase";
import { User, Mail, Shield, ShieldAlert, Award, Clock, Save, Building } from "lucide-react";

export default function Profile() {
  const { currentUser, updateCurrentUserState } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(currentUser?.name || "");
  const [dept, setDept] = useState(currentUser?.department || "");
  const [programType, setProgramType] = useState(currentUser?.programType || "Internship");
  const [shiftStart, setShiftStart] = useState(currentUser?.shiftStart || "10:00");
  const [shiftEnd, setShiftEnd] = useState(currentUser?.shiftEnd || "19:00");
  const [loading, setLoading] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || !dept) {
      return showToast("Please fill in all required fields.", "warning");
    }

    setLoading(true);
    try {
      // If user is normal user, update their details. Admin cannot change their own shift from user profile
      // (or we can let admin change it).
      const finalShiftStart = isAdmin ? shiftStart : (currentUser.shiftStart || "10:00");
      const finalShiftEnd = isAdmin ? shiftEnd : (currentUser.shiftEnd || "19:00");
      const finalProgram = isAdmin ? programType : (currentUser.programType || "Internship");

      await updateUserRecord(
        currentUser.uid,
        name,
        dept,
        finalProgram,
        finalShiftStart,
        finalShiftEnd,
        currentUser.annualLeaves || 25,
        currentUser.sickLeaves || 10,
        currentUser.casualLeaves || 6
      );

      // Update state reactively
      updateCurrentUserState({
        name,
        department: dept,
        programType: finalProgram,
        shiftStart: finalShiftStart,
        shiftEnd: finalShiftEnd,
      });

      showToast("Profile updated successfully!", "success");
    } catch (err) {
      showToast(err.message || "Failed to update profile", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-[800px] mx-auto text-left animate-fade-in">
      {/* Header and Breadcrumb */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-text-mut font-semibold mb-2">
          <span>Portal</span>
          <span>&gt;</span>
          <span className="text-brand-primary">My Profile</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">Account Settings</h1>
        <p className="text-sm text-text-sec mt-1">Manage your profile details and view your account configurations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Account Badge */}
        <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-brand-primary/10 text-brand-primary border-2 border-brand-primary/30 flex items-center justify-center font-black text-2xl uppercase shadow-md mb-4 relative overflow-hidden group">
            {name ? name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "U"}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity cursor-pointer">
              EDIT
            </div>
          </div>

          <h3 className="font-extrabold text-base text-text-main tracking-tight">{name}</h3>
          <p className="text-xs text-text-mut font-semibold mt-1 truncate max-w-full">{currentUser?.email}</p>

          <div className="mt-6 w-full pt-6 border-t border-border-card space-y-3">
            {isAdmin ? (
              <span className="w-full flex items-center justify-center gap-1.5 py-2 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-xs font-bold rounded-full uppercase tracking-wider">
                <Shield size={14} /> Super Admin
              </span>
            ) : (
              <span className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold rounded-full uppercase tracking-wider">
                <Award size={14} /> {programType} Member
              </span>
            )}

            <div className="p-3 bg-bg-base/30 rounded-[12px] border border-border-card text-left space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-text-mut">
                <span>Account ID:</span>
                <span className="text-text-main font-mono text-[10px]">{currentUser?.uid?.substring(0, 10)}...</span>
              </div>
              <div className="flex justify-between font-semibold text-text-mut">
                <span>Role:</span>
                <span className="text-text-main capitalize">{currentUser?.role}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Profile Form */}
        <div className="md:col-span-2 bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-2 border-b border-border-card">
            <div className="w-9 h-9 rounded-[10px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <User size={18} />
            </div>
            <h3 className="font-extrabold text-base text-text-main">Personal Information</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec flex items-center gap-1.5" htmlFor="profile-name">
                  <User size={13} className="text-text-mut" />
                  Full Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main font-semibold outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Marcus Thompson"
                  required
                />
              </div>

              {/* Email (Read Only) */}
              <div className="flex flex-col gap-1.5 opacity-70">
                <label className="text-xs font-bold text-text-sec flex items-center gap-1.5">
                  <Mail size={13} className="text-text-mut" />
                  Email Address (Verified)
                </label>
                <input
                  type="email"
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/20 text-xs text-text-mut font-semibold outline-none cursor-not-allowed"
                  value={currentUser?.email || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Domain / Department */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec flex items-center gap-1.5" htmlFor="profile-dept">
                  <Building size={13} className="text-text-mut" />
                  Department / Domain
                </label>
                <input
                  id="profile-dept"
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main font-semibold outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                  placeholder="e.g. Engineering"
                  required
                />
              </div>

              {/* Program Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sec flex items-center gap-1.5">
                  <Award size={13} className="text-text-mut" />
                  Program Type
                </label>
                {isAdmin ? (
                  <select
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/30 text-xs text-text-main font-semibold outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
                    value={programType}
                    onChange={(e) => setProgramType(e.target.value)}
                  >
                    <option value="Internship">Internship</option>
                    <option value="Training">Training</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    className="w-full px-3.5 py-2.5 border border-border-card rounded-[12px] bg-bg-base/20 text-xs text-text-mut font-semibold outline-none cursor-not-allowed opacity-70"
                    value={programType}
                    readOnly
                    disabled
                  />
                )}
              </div>
            </div>

            {/* Shift Times */}
            <div className="p-4 bg-brand-primary/5 rounded-[16px] border border-brand-primary/10 space-y-4">
              <h4 className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                <Clock size={14} />
                Shift Details & Working Schedule
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-mut uppercase">Shift Start</label>
                  {isAdmin ? (
                    <input
                      type="time"
                      className="w-full px-3 py-2 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all"
                      value={shiftStart}
                      onChange={(e) => setShiftStart(e.target.value)}
                      required
                    />
                  ) : (
                    <span className="text-xs text-text-main font-semibold p-2 bg-bg-card rounded-[8px] border border-border-card block">
                      {currentUser?.shiftStart || "10:00"}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text-mut uppercase">Shift End</label>
                  {isAdmin ? (
                    <input
                      type="time"
                      className="w-full px-3 py-2 border border-border-card rounded-[8px] bg-bg-card text-text-main text-xs outline-none focus:border-brand-primary transition-all"
                      value={shiftEnd}
                      onChange={(e) => setShiftEnd(e.target.value)}
                      required
                    />
                  ) : (
                    <span className="text-xs text-text-main font-semibold p-2 bg-bg-card rounded-[8px] border border-border-card block">
                      {currentUser?.shiftEnd || "19:00"}
                    </span>
                  )}
                </div>
              </div>

              {!isAdmin && (
                <p className="text-[10px] text-text-mut leading-normal font-semibold">
                  * Note: Shift schedule is declared by administrators and cannot be self-modified.
                </p>
              )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-border-card">
              <button
                type="submit"
                disabled={loading}
                className="py-2.5 px-6 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] flex items-center gap-2 shadow-md shadow-brand-primary/10 hover:shadow-brand-primary/20 transition-all cursor-pointer"
              >
                <Save size={14} />
                {loading ? "Saving Changes..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
