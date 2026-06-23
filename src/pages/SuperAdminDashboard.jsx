import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getCompanies, createCompany, registerUser, autoMigrateFirebase, getCompanyStats, approveCompany, updateCompanyStatus, recoverLostData } from "../firebase";
import { useToast } from "../context/ToastContext";
import { Building2, Plus, Users, ShieldAlert, Link, X, CheckSquare, Calendar as CalendarIcon, Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

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
      const sorted = (data || []).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      const withCodes = sorted.map((c, idx) => ({
        ...c,
        companyCode: `ZUNAHR${String(idx + 1).padStart(4, '0')}`
      }));
      setCompanies(withCodes);
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
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: newStatus } : c));
      setSelectedCompany(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      showToast("Failed to update status", "error");
    }
  };

  const handleGenerateInvoice = () => {
    try {
      if (!selectedCompany) return;
      
      const doc = new jsPDF();
      const primaryColor = [0, 97, 224];
      const secondaryColor = [240, 244, 250];
      const textColor = [51, 65, 85];
      const textMutColor = [100, 116, 139];
      
      // ---------------- HEADER ----------------
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 50, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text("INVOICE", 14, 32);
      
      // Company details (Top Right)
      doc.setFontSize(16);
      doc.text("Zuna HRMS", 196, 24, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("123 Tech Park, Innovation Way", 196, 32, { align: "right" });
      doc.text("billing@zunaglobal.com", 196, 38, { align: "right" });

      // ---------------- INFO SECTION ----------------
      // Bill To
      doc.setTextColor(...textColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("BILLED TO", 14, 65);
      
      doc.setFontSize(11);
      doc.text(selectedCompany.name || "Organization", 14, 73);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...textMutColor);
      doc.text(`Company ID: ${selectedCompany.companyCode || selectedCompany.id}`, 14, 80);
      doc.text(`Created: ${new Date(selectedCompany.createdAt || Date.now()).toLocaleDateString()}`, 14, 86);

      // Invoice Meta
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Invoice No:", 135, 73);
      doc.text("Invoice Date:", 135, 80);
      doc.text("Amount Due:", 135, 87);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...textMutColor);
      doc.text(`INV-${Math.floor(Math.random() * 100000)}`, 196, 73, { align: "right" });
      doc.text(new Date().toLocaleDateString(), 196, 80, { align: "right" });
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.text("INR 24,999.00", 196, 87, { align: "right" });

      // ---------------- TABLE ----------------
      doc.autoTable({
        startY: 100,
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: [
          ['Zuna Enterprise Subscription (Monthly)', '1', '24,999.00', '24,999.00'],
          ['Priority Support Access', '1', 'Included', 'Included'],
          ['Automated Backups', '1', 'Included', 'Included'],
        ],
        theme: 'grid',
        headStyles: { 
          fillColor: primaryColor, 
          textColor: 255, 
          fontStyle: 'bold',
          cellPadding: 6
        },
        bodyStyles: { 
          textColor: 80, 
          fontSize: 10,
          cellPadding: 6
        },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { halign: 'center', cellWidth: 20 },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 37 }
        },
        alternateRowStyles: { fillColor: secondaryColor },
        margin: { left: 14, right: 14 },
      });

      // ---------------- TOTALS ----------------
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 150;
      
      // Add a neat summary box
      doc.setFillColor(248, 250, 252);
      // x=116, w=80 => spans from 116 to 196
      doc.rect(116, finalY - 6, 80, 34, 'F');
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...textColor);
      
      // Labels
      doc.text("Subtotal:", 122, finalY + 2);
      doc.text("Tax (18%):", 122, finalY + 10);
      doc.setFont("helvetica", "bold");
      doc.text("Total Due:", 122, finalY + 20);
      
      // Values (Aligned Right to 190)
      doc.setFont("helvetica", "normal");
      doc.text("21,185.59", 190, finalY + 2, { align: "right" });
      doc.text("3,813.41", 190, finalY + 10, { align: "right" });
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.setFontSize(12);
      doc.text("INR 24,999.00", 190, finalY + 20, { align: "right" });

      // ---------------- FOOTER ----------------
      const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(14, pageHeight - 20, 196, pageHeight - 20);
      
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...textMutColor);
      doc.text("Thank you for choosing Zuna HRMS! We appreciate your business.", 105, pageHeight - 12, { align: 'center' });

      doc.save(`Invoice_${selectedCompany.slug || 'company'}_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast("Premium Invoice generated successfully.", "success");
    } catch (err) {
      console.error("PDF Error:", err);
      showToast("Failed to generate PDF: " + err.message, "error");
    }
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
        <div className="flex gap-3">
          <button 
            onClick={async () => {
              const res = await recoverLostData();
              if (res.success) showToast(res.msg, "success");
              else showToast(res.msg, "error");
            }}
            className="py-2.5 px-5 bg-amber-500/10 text-amber-500 font-bold rounded-[12px] hover:bg-amber-500 hover:text-white transition-all cursor-pointer shadow-sm flex items-center gap-2 text-sm"
          >
            <ShieldAlert size={18} />
            Recover Data
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="py-2.5 px-5 bg-brand-primary text-white font-bold rounded-[12px] hover:bg-brand-hover transition-all cursor-pointer shadow-xl shadow-brand-primary/20 flex items-center gap-2 text-sm"
          >
            <Plus size={18} strokeWidth={3} />
            Provision New Organization
          </button>
        </div>
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
                  <ShieldAlert size={16} className="text-brand-primary" />
                  <span className="font-bold">ID:</span> {company.companyCode || company.id}
                </div>
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
                      <option value="deactive">Deactive</option>
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
