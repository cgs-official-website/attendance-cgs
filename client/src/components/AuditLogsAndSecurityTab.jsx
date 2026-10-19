import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  ListFilter,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  Globe,
  Radio,
  FileCode,
  ShieldCheck,
  Check,
  Activity
} from "lucide-react";
import { getAuditLogs, getSecurityAlerts, resolveSecurityAlert, getSecurityStats } from "../firebase";

export const AuditLogsAndSecurityTab = () => {
  const [activeSubTab, setActiveSubTab] = useState("logs"); // "logs" or "alerts"
  const [stats, setStats] = useState({ activeSessions: 0, unresolvedAlerts: 0, eventsToday: 0 });

  // Audit Logs State
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedRowId, setExpandedRowId] = useState(null);

  // Security Alerts State
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [resolvingAlertId, setResolvingAlertId] = useState(null);

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const data = await getSecurityStats();
      setStats(data);
    } catch (_) {}
  };

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await getAuditLogs({
        page,
        limit: 20,
        search,
        action: actionFilter || undefined,
        status: statusFilter || undefined
      });
      setLogs(res.logs || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotalCount(res.pagination?.total || 0);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLogsLoading(false);
    }
  }, [page, search, actionFilter, statusFilter]);

  // Fetch security alerts
  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true);
      const res = await getSecurityAlerts({ page: 1, limit: 50 });
      setAlerts(res.alerts || []);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    if (activeSubTab === "logs") {
      fetchLogs();
    } else {
      fetchAlerts();
    }
  }, [activeSubTab, fetchLogs, fetchAlerts]);

  const handleResolveAlert = async (alertId) => {
    try {
      setResolvingAlertId(alertId);
      await resolveSecurityAlert(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_resolved: true } : a));
      setStats(prev => ({ ...prev, unresolvedAlerts: Math.max(0, prev.unresolvedAlerts - 1) }));
    } catch (err) {
      console.error("Failed to resolve alert:", err);
    } finally {
      setResolvingAlertId(null);
    }
  };

  const formatActionBadge = (action = "") => {
    if (action.includes("LOGIN_SUCCESS")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">Login Success</span>;
    }
    if (action.includes("LOGIN_FAILED")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300">Login Failed</span>;
    }
    if (action.includes("CLOCK_IN")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300">Clock In</span>;
    }
    if (action.includes("CLOCK_OUT")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300">Clock Out</span>;
    }
    if (action.includes("BREAK_START")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">Break Started</span>;
    }
    if (action.includes("BREAK_RESUME") || action.includes("BREAK_END")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300">Break Resumed</span>;
    }
    if (action.includes("ATTENDANCE_EDIT")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">Attendance Edited</span>;
    }
    if (action.includes("TASK")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300">{action.replace("_", " ")}</span>;
    }
    if (action.includes("SESSION")) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{action.replace("_", " ")}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{action}</span>;
  };

  const formatSeverityBadge = (severity = "LOW") => {
    switch (severity.toUpperCase()) {
      case "CRITICAL":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse">CRITICAL</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800">HIGH</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800">LOW</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active User Sessions</p>
            <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.activeSessions}</h4>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Real-time connected
            </p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Radio className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Security Alerts</p>
            <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.unresolvedAlerts}</h4>
            <p className={`text-[11px] mt-1 ${stats.unresolvedAlerts > 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400"}`}>
              {stats.unresolvedAlerts > 0 ? "Attention required" : "All systems secured"}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${stats.unresolvedAlerts > 0 ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"}`}>
            {stats.unresolvedAlerts > 0 ? <AlertTriangle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Audit Events Today</p>
            <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.eventsToday}</h4>
            <p className="text-[11px] text-slate-400 mt-1">Logged non-blocking events</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-600 dark:text-blue-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab("logs")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
                activeSubTab === "logs"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ListFilter className="w-4 h-4" />
              Audit Activity Logs ({totalCount})
            </button>
            <button
              onClick={() => setActiveSubTab("alerts")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 relative ${
                activeSubTab === "alerts"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Intrusion & Suspicious Alerts
              {stats.unresolvedAlerts > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping ml-1" />
              )}
            </button>
          </div>

          <button
            onClick={() => { fetchStats(); if (activeSubTab === "logs") fetchLogs(); else fetchAlerts(); }}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition self-end sm:self-auto"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${(logsLoading || alertsLoading) ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* SUBTAB 1: AUDIT LOGS */}
        {activeSubTab === "logs" && (
          <div className="p-6">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by employee, email, IP, action..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white transition"
                />
              </div>

              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 focus:outline-hidden"
              >
                <option value="">All Actions</option>
                <option value="AUTH_LOGIN_SUCCESS">Login Success</option>
                <option value="AUTH_LOGIN_FAILED">Login Failed</option>
                <option value="AUTH_LOGOUT">Logout</option>
                <option value="ATTENDANCE_CLOCK_IN">Attendance Clock In</option>
                <option value="ATTENDANCE_CLOCK_OUT">Attendance Clock Out</option>
                <option value="ATTENDANCE_BREAK_START">Break Started</option>
                <option value="ATTENDANCE_BREAK_RESUME">Break Resumed</option>
                <option value="ATTENDANCE_EDIT">Attendance Edit</option>
                <option value="TASK_CREATE">Task Create</option>
                <option value="TASK_UPDATE">Task Update</option>
                <option value="SESSION_REVOKED">Session Revoked</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILURE">Failure</option>
                <option value="WARNING">Warning</option>
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Timestamp</th>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Action</th>
                    <th className="py-3 px-4 font-semibold">Resource</th>
                    <th className="py-3 px-4 font-semibold">IP Address</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {logsLoading ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">
                        No audit logs matching criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isExpanded = expandedRowId === log.id;
                      return (
                        <React.Fragment key={log.id}>
                          <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                                  {log.user_name ? log.user_name[0] : (log.user_email ? log.user_email[0] : "?")}
                                </div>
                                <div className="truncate max-w-[150px]">
                                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                                    {log.user_name || "System / Guest"}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate">{log.user_email || "N/A"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">{formatActionBadge(log.action)}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300 capitalize">{log.resource_type || "General"}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.ip_address || "127.0.0.1"}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.status === "SUCCESS"
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                              }`}>
                                {log.status || "SUCCESS"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setExpandedRowId(isExpanded ? null : log.id)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expandable JSON details row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-800/80">
                              <td colSpan="7" className="p-4">
                                <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-[11px] overflow-x-auto shadow-inner">
                                  <p className="text-slate-400 mb-1">// Event Details & Payload Payload:</p>
                                  <pre>{JSON.stringify(typeof log.details === "string" ? JSON.parse(log.details || "{}") : log.details, null, 2)}</pre>
                                  {log.user_agent && (
                                    <p className="text-slate-400 mt-2">// User-Agent: {log.user_agent}</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 text-xs text-slate-500">
                <span>Page {page} of {totalPages} ({totalCount} total events)</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: SECURITY ALERTS */}
        {activeSubTab === "alerts" && (
          <div className="p-6">
            {alertsLoading ? (
              <div className="py-12 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                Scanning security intrusion records...
              </div>
            ) : alerts.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">All Systems Secured</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No suspicious intrusions, brute force patterns, or unauthorized activities have been detected.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      alert.is_resolved
                        ? "bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-70"
                        : "bg-rose-50/30 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40"
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className={`p-2.5 rounded-xl ${
                        alert.is_resolved
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                          : "bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                      }`}>
                        <ShieldAlert className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {formatSeverityBadge(alert.severity)}
                          <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                            {alert.alert_type}
                          </span>
                          {alert.is_resolved && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="w-3 h-3" /> Resolved
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 font-medium">
                          {alert.description}
                        </p>

                        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                          {alert.user_email && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Target: {alert.user_email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!alert.is_resolved && (
                      <button
                        onClick={() => handleResolveAlert(alert.id)}
                        disabled={resolvingAlertId === alert.id}
                        className="self-end sm:self-center px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-xl transition flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {resolvingAlertId === alert.id ? "Resolving..." : "Mark Resolved"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsAndSecurityTab;
