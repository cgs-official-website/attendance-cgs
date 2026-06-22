import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getCompanies, createCompany, registerUser, autoMigrateFirebase, getCompanyStats, approveCompany, updateCompanyStatus } from "../firebase";
import { useToast } from "../context/ToastContext";
import { Building2, Plus, Users, ShieldAlert, Link, X, CheckSquare, Calendar as CalendarIcon, Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  
  const [showModal, setShowModal] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", slug: "", adminEmail: "", adminPassword: "", adminName: "" });
  const [submitting, setSubmitting] = useState(false);

  // Stats Modal State
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyStats, setCompanyStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      await autoMigrateFirebase();
      const data = await getCompanies();
      setCompanies(data || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch companies", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyClick = async (company) => {
    setSelectedCompany(company);
    setLoadingStats(true);
    try {
      const stats = await getCompanyStats(company.id);
      setCompanyStats(stats);
    } catch (e) {
      console.error(e);
      setCompanyStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleStatusChange = async (companyId, newStatus) => {
    try {
      await updateCompanyStatus(companyId, newStatus);
      showToast(`Company status updated to ${newStatus}`, "success");
      setCompanies(companies.map(c => c.id === companyId ? { ...c, status: newStatus } : c));
      setSelectedCompany({ ...selectedCompany, status: newStatus });
    } catch (err) {
      showToast("Failed to update status", "error");
    }
  };

  const handleGenerateInvoice = () => {
    if (!selectedCompany) return;
    
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 97, 224);
    doc.text("INVOICE", 140, 20);

    doc.setFontSize(14);
    doc.setTextColor(50, 50, 50);
    doc.text("Zuna HRMS Solutions", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("123 Tech Park, Innovation Way", 14, 26);
    doc.text("billing@zunaglobal.com", 14, 32);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 40, 196, 40);

    doc.setFont("helvetica", "bold");
    doc.text("Bill To:", 14, 50);
    doc.setFont("helvetica", "normal");
    doc.text(selectedCompany.name || "N/A", 14, 56);
    doc.text(`Company ID: ${selectedCompany.id}`, 14, 62);
    doc.text(`Created: ${new Date(selectedCompany.createdAt).toLocaleDateString()}`, 14, 68);

    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 140, 50);
    doc.text(`Invoice #: INV-${Math.floor(Math.random() * 100000)}`, 140, 56);

    // Table Header
    doc.setFillColor(0, 97, 224);
    doc.rect(14, 80, 182, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Description", 18, 86);
    doc.text("Qty", 120, 86);
    doc.text("Unit Price", 140, 86);
    doc.text("Amount", 170, 86);

    // Table Row
    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "normal");
    doc.rect(14, 90, 182, 15, "S");
    doc.text("Zuna Enterprise Subscription (Monthly)", 18, 99);
    doc.text("1", 122, 99);
    doc.text("INR 24,999.00", 142, 99);
    doc.text("INR 24,999.00", 172, 99);

    // Total
    doc.setFont("helvetica", "bold");
    doc.text("Total Due:", 140, 115);
    doc.text("INR 24,999.00", 172, 115);

    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Thank you for your business!", 85, 140);

    doc.save(`Invoice_${selectedCompany.slug}_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast("Invoice generated and downloaded.", "success");
  };

  const handleApproveCompany = async (companyId) => {
    try {
      await approveCompany(companyId);
      showToast("Organization approved successfully!", "success");
      // Update local state instantly
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: "active" } : c));
      setSelectedCompany(prev => prev ? { ...prev, status: "active" } : null);
    } catch (e) {
      console.error(e);
      showToast("Failed to approve organization", "error");
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Create company first to get ID
      const companyId = await createCompany(newCompany.name, newCompany.slug, "pending");
      
      // 2. Register Admin for this company
      const adminUser = await registerUser(
        newCompany.adminName, 
        "Administration", 
        "Full-time", 
        newCompany.adminEmail, 
        newCompany.adminPassword,
        "09:00", "18:00", 25, 10, 6, "", "", [], [], "Full-time", "Company Admin", false, "ADMIN-01",
        companyId
      );
      
      showToast("Company & Admin provisioned successfully!", "success");
      setShowModal(false);
      fetchCompanies();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to provision company", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-text-main flex items-center gap-3">
            <ShieldAlert className="text-brand-primary" size={32} />
            Super Admin Portal
          </h1>
          <p className="text-text-mut font-medium mt-1">Manage Vendors and Sub-Organizations</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-brand-primary hover:bg-brand-hover text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg shadow-brand-primary/20 transition-all"
        >
          <Plus size={20} />
          Provision New Company
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-text-mut">Loading companies...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((company, i) => (
            <div 
              key={i} 
              onClick={() => handleCompanyClick(company)}
              className="bg-bg-card border border-border-card rounded-[24px] p-6 shadow-xl relative overflow-hidden group cursor-pointer hover:border-brand-primary transition-all hover:-translate-y-1"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary to-purple-500"></div>
              
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-primary/10 rounded-[12px] flex items-center justify-center text-brand-primary shrink-0">
                    <Building2 size={24} />
                  </div>
                  <h2 className="font-bold text-lg text-text-main leading-tight">{company.name}</h2>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${company.status === "pending" ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10"}`}>
                  {company.status}
                </span>
              </div>

              <div className="space-y-3 bg-bg-base/50 p-4 rounded-[16px] border border-border-card">
                <div className="flex items-center gap-2 text-sm text-text-sec">
                  <Link size={16} className="text-brand-primary" />
                  <span className="font-bold">Slug:</span> /{company.slug}/login
                </div>
                <div className="flex items-center gap-2 text-sm text-text-sec">
                  <Users size={16} className="text-brand-primary" />
                  <span className="font-bold">Created:</span> {new Date(company.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fade-in">
          <div className="bg-bg-card border border-border-card rounded-[24px] p-8 w-full max-w-xl shadow-2xl relative animate-scale-up overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h2 className="text-2xl font-black text-text-main mb-6">Provision New Company</h2>
            <form onSubmit={handleCreateCompany} className="space-y-6">
              
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-text-sec uppercase tracking-wider border-b border-border-card pb-2">Company Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-mut mb-2">Company Name</label>
                    <input 
                      type="text" required
                      className="w-full bg-bg-base border border-border-card rounded-[12px] px-4 py-3 text-sm text-text-main focus:border-brand-primary outline-none"
                      value={newCompany.name}
                      onChange={(e) => setNewCompany({...newCompany, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-mut mb-2">URL Slug (e.g. acme-corp)</label>
                    <input 
                      type="text" required
                      className="w-full bg-bg-base border border-border-card rounded-[12px] px-4 py-3 text-sm text-text-main focus:border-brand-primary outline-none"
                      value={newCompany.slug}
                      onChange={(e) => setNewCompany({...newCompany, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-sm text-text-sec uppercase tracking-wider border-b border-border-card pb-2">Admin Credentials</h3>
                <div>
                  <label className="block text-xs font-bold text-text-mut mb-2">Admin Full Name</label>
                  <input 
                    type="text" required
                    className="w-full bg-bg-base border border-border-card rounded-[12px] px-4 py-3 text-sm text-text-main focus:border-brand-primary outline-none"
                    value={newCompany.adminName}
                    onChange={(e) => setNewCompany({...newCompany, adminName: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-mut mb-2">Admin Email</label>
                    <input 
                      type="email" required
                      className="w-full bg-bg-base border border-border-card rounded-[12px] px-4 py-3 text-sm text-text-main focus:border-brand-primary outline-none"
                      value={newCompany.adminEmail}
                      onChange={(e) => setNewCompany({...newCompany, adminEmail: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-mut mb-2">Initial Password</label>
                    <input 
                      type="password" required
                      className="w-full bg-bg-base border border-border-card rounded-[12px] px-4 py-3 text-sm text-text-main focus:border-brand-primary outline-none"
                      value={newCompany.adminPassword}
                      onChange={(e) => setNewCompany({...newCompany, adminPassword: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 font-bold text-text-sec bg-bg-base hover:bg-border-card rounded-full transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 font-bold text-white bg-brand-primary hover:bg-brand-hover rounded-full transition-colors disabled:opacity-50">
                  {submitting ? "Provisioning..." : "Provision Company"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {selectedCompany && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fade-in" onClick={() => setSelectedCompany(null)}>
          <div className="bg-bg-card border border-border-card rounded-[24px] p-8 w-full max-w-2xl shadow-2xl relative animate-scale-up overflow-y-auto max-h-[90vh] custom-scrollbar" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedCompany(null)}
              className="absolute top-6 right-6 text-text-mut hover:text-text-main transition-colors bg-bg-base hover:bg-border-card p-2 rounded-full"
            >
              <X size={20} />
            </button>
            
            <div className="flex items-center gap-4 mb-8 border-b border-border-card pb-6">
              <div className="w-16 h-16 bg-brand-primary/10 rounded-[16px] flex items-center justify-center text-brand-primary">
                <Building2 size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-text-main">{selectedCompany.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${selectedCompany.status === "pending" ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10"}`}>
                    {selectedCompany.status}
                  </span>
                  <span className="text-sm font-semibold text-text-sec">/{selectedCompany.slug}</span>
                </div>
              </div>
            </div>

            {loadingStats ? (
              <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
              </div>
            ) : companyStats ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-bg-base/50 border border-border-card rounded-[20px] p-6 text-center shadow-lg relative overflow-hidden">
                  <div className="absolute -top-4 -right-4 text-brand-primary/5">
                    <Users size={80} />
                  </div>
                  <div className="w-12 h-12 mx-auto bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center mb-3">
                    <Users size={24} />
                  </div>
                  <h3 className="text-3xl font-black text-text-main">{companyStats.totalUsers}</h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-mut mt-1">Total Users</p>
                </div>
                
                <div className="bg-bg-base/50 border border-border-card rounded-[20px] p-6 text-center shadow-lg relative overflow-hidden">
                  <div className="absolute -top-4 -right-4 text-amber-500/5">
                    <CheckSquare size={80} />
                  </div>
                  <div className="w-12 h-12 mx-auto bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-3">
                    <CheckSquare size={24} />
                  </div>
                  <h3 className="text-3xl font-black text-text-main">{companyStats.totalTasks}</h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-mut mt-1">Active Tasks</p>
                </div>

                <div className="bg-bg-base/50 border border-border-card rounded-[20px] p-6 text-center shadow-lg relative overflow-hidden">
                  <div className="absolute -top-4 -right-4 text-emerald-500/5">
                    <CalendarIcon size={80} />
                  </div>
                  <div className="w-12 h-12 mx-auto bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                    <CalendarIcon size={24} />
                  </div>
                  <h3 className="text-3xl font-black text-text-main">{companyStats.totalAttendance}</h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-mut mt-1">Attendance Logs</p>
                </div>
              </div>
            ) : (
              <div className="text-center text-text-mut py-8 font-semibold">Stats unavailable.</div>
            )}
            
            <div className="mt-8 bg-bg-base rounded-[16px] p-6 border border-border-card">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-text-main uppercase tracking-wider">System Details</h4>
                <button 
                  onClick={handleGenerateInvoice}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 hover:shadow-lg transition-colors rounded-full text-xs font-bold"
                >
                  <FileText size={14} />
                  Download Invoice
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-mut font-semibold">Company ID</span>
                  <span className="font-mono text-xs bg-bg-card px-2 py-1 rounded text-text-sec">{selectedCompany.id}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-mut font-semibold">Login URL</span>
                  <span className="font-medium text-brand-primary hover:underline cursor-pointer">/{selectedCompany.slug}/login</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-mut font-semibold">Created Date</span>
                  <span className="text-text-main font-semibold text-xs">{new Date(selectedCompany.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-border-card pt-3 mt-3">
                  <span className="text-text-mut font-semibold">Vendor Status</span>
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-bg-card border border-border-card rounded-[8px] px-3 py-1.5 text-xs font-bold text-text-main outline-none focus:border-brand-primary transition-all cursor-pointer"
                      value={selectedCompany.status || "active"}
                      onChange={(e) => handleStatusChange(selectedCompany.id, e.target.value)}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending Approval</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {selectedCompany.status === "pending" && (
              <div className="mt-6 pt-6 border-t border-border-card">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-[16px] p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-amber-500 text-sm">Action Required</h4>
                    <p className="text-xs text-amber-500/80 mt-1">This organization is waiting for your approval to unlock their portal.</p>
                  </div>
                  <button 
                    onClick={() => handleApproveCompany(selectedCompany.id)}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full transition-colors text-sm shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
