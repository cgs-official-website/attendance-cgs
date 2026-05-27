import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { subscribeToUserLogs } from "../firebase";
import { Calendar, Search, MapPin, Coffee, Clock, BarChart2 } from "lucide-react";

export default function History() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToUserLogs(currentUser.uid, (data) => {
      setLogs(data);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Reactive filtering
  useEffect(() => {
    let result = [...logs];
    if (startDate) {
      result = result.filter(log => log.date >= startDate);
    }
    if (endDate) {
      result = result.filter(log => log.date <= endDate);
    }
    if (searchQuery) {
      result = result.filter(log => 
        log.date.includes(searchQuery) || 
        (log.status || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredLogs(result);
  }, [logs, startDate, endDate, searchQuery]);

  // Apply filters
  const handleFilter = () => {
    // Reactive effect handles this automatically
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
  };

  // Compute summary stats
  const totalDays = filteredLogs.length;
  const totalHours = filteredLogs.reduce((acc, log) => acc + (log.totalWorkingMinutes || 0), 0) / 60;
  const avgHours = totalDays > 0 ? totalHours / totalDays : 0;
  const shortBreaks = filteredLogs.reduce((acc, log) => {
    const count = log.breaks?.filter(b => b.type === "short").length || 0;
    return acc + count;
  }, 0);
  const longBreaks = filteredLogs.reduce((acc, log) => {
    const count = log.breaks?.filter(b => b.type === "long").length || 0;
    return acc + count;
  }, 0);

  // Hourly stats for last 7 logged days
  const chartData = [...filteredLogs].reverse().slice(-7).map(log => {
    const hrs = parseFloat(((log.totalWorkingMinutes || 0) / 60).toFixed(1));
    const formattedDate = new Date(log.date).toLocaleDateString([], { month: "short", day: "numeric" });
    return { dateLabel: formattedDate, hours: hrs };
  });

  const maxChartHours = Math.max(8, ...chartData.map(c => c.hours));

  return (
    <div className="space-y-8 w-full max-w-[1400px] mx-auto text-left">
      {/* Title block */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-text-main tracking-tight">My Attendance History</h1>
        <p className="text-sm text-text-sec mt-1">Review your historical logs and break details.</p>
      </div>

      {/* Summary stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-[14px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Calendar size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">Days Worked</span>
            <span className="text-2xl font-extrabold text-text-main block mt-0.5">{totalDays}</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-[14px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">Total Hours</span>
            <span className="text-2xl font-extrabold text-text-main block mt-0.5">{totalHours.toFixed(1)} hrs</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-[14px] bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">Avg. Daily Hours</span>
            <span className="text-2xl font-extrabold text-text-main block mt-0.5">{avgHours.toFixed(1)} hrs</span>
          </div>
        </div>

        <div className="bg-bg-card border border-border-card rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-[14px] bg-brand-warning/10 text-brand-warning flex items-center justify-center">
            <Coffee size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider block">Total Breaks</span>
            <span className="text-2xl font-extrabold text-text-main block mt-0.5">{shortBreaks + longBreaks}</span>
          </div>
        </div>
      </div>

      {/* Interactive Hours Bar Chart */}
      {chartData.length > 0 && (
        <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
          <h3 className="font-extrabold text-base text-text-main mb-1.5 flex items-center gap-2">
            <BarChart2 size={18} className="text-brand-primary" /> 
            <span>Daily Working Hours Chart (Last 7 Shifts)</span>
          </h3>
          <p className="text-[10px] text-text-mut font-semibold mb-6">Visual tracking of completed shift hours per logged day</p>
          
          <div className="flex items-end justify-around h-[180px] border-b border-border-card pb-2 pt-6 px-4">
            {chartData.map((c, idx) => {
              const barHeight = Math.max(10, Math.round((c.hours / maxChartHours) * 100));
              return (
                <div key={idx} className="flex flex-col items-center gap-2 group w-12">
                  <div className="opacity-0 group-hover:opacity-100 absolute transform -translate-y-12 bg-slate-900 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow pointer-events-none transition-opacity duration-150">
                    {c.hours} hours
                  </div>
                  
                  <div 
                    className="w-5 rounded-t-sm bg-brand-primary hover:bg-brand-hover transition-all duration-300 relative overflow-hidden"
                    style={{ height: `${barHeight}%` }}
                  >
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10" />
                  </div>
                  
                  <span className="text-[10px] font-bold text-text-sec tracking-tight text-center">{c.dateLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter panel */}
      <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
        <h3 className="font-extrabold text-base text-text-main tracking-tight mb-4">Filter Records by Date</h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
          <div className="flex flex-col gap-1.5 flex-grow">
            <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="start-date">Start Date</label>
            <input
              id="start-date"
              type="date"
              className="w-full px-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/40 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-grow">
            <label className="text-[10px] font-bold text-text-mut uppercase tracking-wider" htmlFor="end-date">End Date</label>
            <input
              id="end-date"
              type="date"
              className="w-full px-4 py-2.5 border border-border-card rounded-[12px] bg-bg-base/40 text-xs text-text-main outline-none focus:bg-bg-card focus:border-brand-primary transition-all"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleFilter} 
              className="py-2.5 px-6 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-[12px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Search size={14} /> Filter
            </button>
            <button 
              onClick={handleReset} 
              className="py-2.5 px-5 border border-border-card rounded-[12px] hover:bg-bg-base text-xs font-bold text-text-sec transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-sm">
        <h3 className="font-extrabold text-base text-text-main tracking-tight mb-5">Log History</h3>
        
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 text-text-mut text-sm">No historical attendance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-card text-[10px] font-bold text-text-mut uppercase tracking-wider">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 px-4">Check In</th>
                  <th className="pb-3 px-4">Check Out</th>
                  <th className="pb-3 px-4">Breaks Summary</th>
                  <th className="pb-3 px-4">Working Hours</th>
                  <th className="pb-3 pl-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-card text-xs text-text-main font-semibold">
                {filteredLogs.map((log) => {
                  const checkInTime = new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const checkOutTime = log.checkOutTime 
                    ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "—";
                  
                  const shorts = log.breaks?.filter(b => b.type === "short").length || 0;
                  const longs = log.breaks?.filter(b => b.type === "long").length || 0;
                  
                  return (
                    <tr key={log.id} className="hover:bg-bg-base/30">
                      <td className="py-3.5 pr-4 font-bold text-text-main">{log.date}</td>
                      <td className="py-3.5 px-4 text-text-sec">
                        <div>{checkInTime}</div>
                        <div className="text-[10px] text-text-mut mt-0.5">
                          {log.checkInLocation && (
                            <a 
                              href={`https://www.google.com/maps?q=${log.checkInLocation.latitude},${log.checkInLocation.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-primary hover:text-brand-hover hover:underline"
                            >
                              In GPS Map
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-text-sec">
                        <div>{checkOutTime}</div>
                        <div className="text-[10px] text-text-mut mt-0.5">
                          {log.checkOutLocation && (
                            <a 
                              href={`https://www.google.com/maps?q=${log.checkOutLocation.latitude},${log.checkOutLocation.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-primary hover:text-brand-hover hover:underline"
                            >
                              Out GPS Map
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {shorts > 0 || longs > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {shorts > 0 && <span className="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-bold">{shorts} Short</span>}
                            {longs > 0 && <span className="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-bold">{longs} Long</span>}
                          </div>
                        ) : (
                          <span className="text-text-mut text-[10px]">No breaks</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-brand-primary">{(log.totalWorkingMinutes / 60).toFixed(2)} hrs</div>
                        <span className="text-[10px] text-text-mut">{log.totalWorkingMinutes} mins</span>
                      </td>
                      <td className="py-3.5 pl-4 text-right">
                        {log.status === "checked-in" && <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Working</span>}
                        {log.status === "on-break" && <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">On Break</span>}
                        {log.status === "checked-out" && <span className="bg-slate-500/10 text-text-sec border border-border-card text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Shift Ended</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
