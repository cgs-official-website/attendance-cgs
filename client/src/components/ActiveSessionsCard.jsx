import React, { useState, useEffect } from "react";
import { Laptop, Smartphone, Tablet, Monitor, Shield, LogOut, CheckCircle, Clock, Globe, RefreshCw, AlertCircle } from "lucide-react";
import { getActiveSessions, revokeSession, revokeAllOtherSessions } from "../firebase";

export const ActiveSessionsCard = ({ onSessionRevoked }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getActiveSessions();
      setSessions(data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Unable to load active sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (sessionId) => {
    if (!window.confirm("Are you sure you want to log out of this device?")) return;

    try {
      setRevokingId(sessionId);
      await revokeSession(sessionId);
      setMessage("Device logged out successfully.");
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      if (onSessionRevoked) onSessionRevoked();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      console.error("Failed to revoke session:", err);
      setError(err.message || "Failed to log out device.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    if (!window.confirm("This will log you out from ALL other browsers and devices. Continue?")) return;

    try {
      setRevokingAll(true);
      const res = await revokeAllOtherSessions();
      setMessage(res.message || "All other sessions have been logged out.");
      setSessions(prev => prev.filter(s => s.isCurrent));
      if (onSessionRevoked) onSessionRevoked();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      console.error("Failed to revoke other sessions:", err);
      setError(err.message || "Failed to log out other devices.");
    } finally {
      setRevokingAll(false);
    }
  };

  const getDeviceIcon = (deviceType = "") => {
    const dt = deviceType.toLowerCase();
    if (dt.includes("mobile") || dt.includes("phone")) {
      return <Smartphone className="w-5 h-5 text-indigo-500" />;
    }
    if (dt.includes("tablet") || dt.includes("ipad")) {
      return <Tablet className="w-5 h-5 text-purple-500" />;
    }
    return <Laptop className="w-5 h-5 text-blue-500" />;
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return "Recently";
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Active right now";
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    } catch (_) {
      return "Recently";
    }
  };

  const otherSessionsCount = sessions.filter(s => !s.isCurrent).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Active Devices & Sessions</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your logged-in browsers and devices. Terminate sessions if you notice unfamiliar activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            title="Refresh active sessions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {otherSessionsCount > 0 && (
            <button
              onClick={handleRevokeAllOthers}
              disabled={revokingAll}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/50 rounded-xl transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              {revokingAll ? "Logging out..." : `Log Out of ${otherSessionsCount} Other Device(s)`}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs font-medium text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Sessions List */}
      <div className="mt-6 space-y-3">
        {loading && sessions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Scanning active sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            No active sessions found.
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.sessionId || s.id}
              className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                s.isCurrent
                  ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/60"
                  : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-700">
                  {getDeviceIcon(s.deviceType)}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {s.deviceName || `${s.browser} on ${s.os}`}
                    </span>
                    {s.isCurrent ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Current Device
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      IP: {s.ipAddress || "127.0.0.1"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatRelativeTime(s.lastActiveAt)}
                    </span>
                  </div>
                </div>
              </div>

              {!s.isCurrent && (
                <button
                  onClick={() => handleRevoke(s.sessionId)}
                  disabled={revokingId === s.sessionId}
                  className="self-end sm:self-center px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-700 hover:border-rose-200 rounded-lg transition"
                >
                  {revokingId === s.sessionId ? "Revoking..." : "Log Out"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActiveSessionsCard;
