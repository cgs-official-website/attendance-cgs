import React, { useState, useEffect } from 'react';
import { X, LifeBuoy, Send, AlertTriangle, CheckCircle2, MessageSquare, Clock, Plus, ChevronRight, ArrowLeft } from "lucide-react";
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, doc, updateDoc } from 'firebase/firestore';

const zunaConfig = {
  apiKey: "AIzaSyAzEP2LTXsGvCsFyxITkgoon_2AL4yGKyo",
  authDomain: "zuna-landing-page-22564.firebaseapp.com",
  projectId: "zuna-landing-page-22564",
  storageBucket: "zuna-landing-page-22564.firebasestorage.app",
  messagingSenderId: "806137313772",
  appId: "1:806137313772:web:57cf450537cb9c4fff68c9"
};

const zunaApp = getApps().find(a => a.name === 'ZunaSharedApp') || initializeApp(zunaConfig, 'ZunaSharedApp');
const zunaDb = getFirestore(zunaApp);

export default function RaiseTicketModal({ isOpen, onClose, clientName = "HR Administrator", clientEmail = "" }) {
  const [activeTab, setActiveTab] = useState('raise');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [myTickets, setMyTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mainList = [];
    let supportList = [];

    const getLocal = () => {
      try {
        const saved = localStorage.getItem('zuna_tickets');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
      return [];
    };

    const mergeAndEmit = () => {
      const localList = getLocal();
      const ticketMap = new Map();
      [...localList, ...mainList, ...supportList].forEach(t => {
        if (t && t.id) {
          ticketMap.set(t.id, { ...ticketMap.get(t.id), ...t });
        }
      });
      const combined = Array.from(ticketMap.values()).filter(t => {
        const prod = (t.productName || t.productId || '').toLowerCase();
        return prod.includes('attendance') || prod.includes('hrms') || t.clientName === clientName;
      });
      combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setMyTickets(combined);

      if (selectedTicket) {
        const updated = combined.find(x => x.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    };

    const unsub1 = onSnapshot(collection(zunaDb, 'tickets'), (snapshot) => {
      mainList = snapshot.docs.map(d => ({
        firestoreDocId: d.id,
        id: d.data().id || d.id,
        sourceCollection: 'tickets',
        ...d.data()
      }));
      mergeAndEmit();
    }, (err) => console.warn('Tickets snapshot warn:', err));

    const unsub2 = onSnapshot(collection(zunaDb, 'support_tickets'), (snapshot) => {
      supportList = snapshot.docs.map(d => ({
        firestoreDocId: d.id,
        id: d.data().id || d.id,
        sourceCollection: 'support_tickets',
        ...d.data()
      }));
      mergeAndEmit();
    }, (err) => console.warn('Support tickets snapshot warn:', err));

    return () => {
      unsub1();
      unsub2();
    };
  }, [isOpen, clientName, selectedTicket?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const ticketId = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      const ticketPayload = {
        id: ticketId,
        productId: 'attendance-hrms',
        productName: "Attendance (HRMS)",
        clientName,
        clientEmail,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        status: "open",
        createdAt: new Date().toISOString(),
        messages: [
          {
            sender: "Client",
            author: clientName,
            text: description.trim(),
            timestamp: new Date().toISOString()
          }
        ]
      };

      try {
        await addDoc(collection(zunaDb, "tickets"), {
          ...ticketPayload,
          createdAt: serverTimestamp()
        });
      } catch (err) {}

      try {
        await addDoc(collection(zunaDb, "support_tickets"), {
          ...ticketPayload,
          createdAt: serverTimestamp()
        });
      } catch (err2) {}

      try {
        const current = JSON.parse(localStorage.getItem('zuna_tickets') || '[]');
        localStorage.setItem('zuna_tickets', JSON.stringify([ticketPayload, ...current]));
      } catch (e) {}

      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        try {
          const bc = new BroadcastChannel('zuna_tickets_channel');
          bc.postMessage(ticketPayload);
          bc.close();
        } catch (bcErr) {}
      }

      setSuccessMsg("✓ Ticket submitted! Zuna SuperAdmin will reply shortly.");
      setSubject("");
      setDescription("");
      setTimeout(() => {
        setSuccessMsg("");
        setActiveTab('history');
      }, 1500);
    } catch (err) {
      console.error("Failed to raise ticket:", err);
      setErrorMsg("Failed to submit support ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);

    const newReply = {
      sender: 'Client',
      author: clientName,
      text: replyText.trim(),
      timestamp: new Date().toISOString()
    };

    const targetDocId = selectedTicket.firestoreDocId || selectedTicket.id;
    const colName = selectedTicket.sourceCollection === 'support_tickets' ? 'support_tickets' : 'tickets';
    const updatedMessages = [...(selectedTicket.messages || []), newReply];

    try {
      await updateDoc(doc(zunaDb, colName, targetDocId), {
        messages: updatedMessages,
        updatedAt: serverTimestamp()
      });
      setReplyText('');
    } catch (err) {
      console.warn('Reply write error:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'resolved': return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12}/> Resolved</span>;
      case 'in-progress': return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-xs font-bold flex items-center gap-1"><Clock size={12}/> In Progress</span>;
      default: return <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-md text-xs font-bold flex items-center gap-1"><MessageSquare size={12}/> Open</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 shrink-0">
              <LifeBuoy size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Zuna Central Support</h3>
              <p className="text-xs text-slate-500 font-medium">Direct support desk for HR Administrators</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50 px-5 gap-2">
          <button
            onClick={() => { setActiveTab('raise'); setSelectedTicket(null); }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'raise' ? 'border-cyan-600 text-cyan-600 bg-white rounded-t-xl' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Plus size={15} /> Raise New Ticket
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'history' ? 'border-cyan-600 text-cyan-600 bg-white rounded-t-xl' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <MessageSquare size={15} /> My Tickets ({myTickets.length})
          </button>
        </div>

        {activeTab === 'raise' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {successMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} /> {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={16} /> {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Issue Subject</label>
              <input 
                type="text" required
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white text-slate-900 font-medium"
                placeholder="e.g. Payroll Tax Export Failure"
                value={subject} onChange={e => setSubject(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Priority</label>
                <select className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl font-semibold" value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">⚡ Urgent Priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Product</label>
                <input type="text" disabled value="Attendance (HRMS)" className="w-full px-4 py-3 text-sm bg-slate-100 border border-slate-200 rounded-2xl text-slate-500 font-bold"/>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Detailed Description</label>
              <textarea required rows={4} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium resize-none" placeholder="Describe the issue..." value={description} onChange={e => setDescription(e.target.value)}/>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-2xl">Cancel</button>
              <button type="submit" disabled={loading} className="px-6 py-2.5 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center gap-2">
                <Send size={14} /> {loading ? 'Submitting...' : 'Submit to Zuna Admin'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'history' && !selectedTicket && (
          <div className="p-5 flex-1 overflow-y-auto space-y-3">
            {myTickets.map(t => (
              <div key={t.id} onClick={() => setSelectedTicket(t)} className="p-4 rounded-2xl border border-slate-200 hover:border-cyan-400 hover:shadow-md transition-all cursor-pointer bg-white flex items-center justify-between gap-3 group">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-extrabold text-cyan-600">#{t.id}</span>
                    {getStatusBadge(t.status)}
                    <span className="text-xs text-slate-400 font-medium ml-auto">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Recently'}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">{t.subject}</h4>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{t.description}</p>
                </div>
                <ChevronRight className="text-slate-300 group-hover:text-cyan-600 shrink-0" size={18}/>
              </div>
            ))}
            {myTickets.length === 0 && <div className="text-center py-12 text-slate-400 text-sm font-semibold">No support tickets found.</div>}
          </div>
        )}

        {activeTab === 'history' && selectedTicket && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <button onClick={() => setSelectedTicket(null)} className="text-xs font-bold text-cyan-600 flex items-center gap-1"><ArrowLeft size={14}/> Back to My Tickets</button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-400">#{selectedTicket.id}</span>
                {getStatusBadge(selectedTicket.status)}
              </div>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3 bg-slate-50/40">
              <div className="p-3.5 bg-slate-100 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500 block mb-1">Subject: {selectedTicket.subject}</span>
                <p className="text-xs text-slate-800 font-medium">{selectedTicket.description}</p>
              </div>

              {(selectedTicket.messages || []).map((msg, i) => {
                const isSuperAdmin = msg.sender === 'Agent' || msg.sender === 'SuperAdmin' || msg.role === 'superadmin';
                return (
                  <div key={i} className={`flex flex-col ${isSuperAdmin ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] p-3.5 rounded-2xl text-xs font-medium ${isSuperAdmin ? 'bg-cyan-600 text-white rounded-tl-none shadow-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tr-none shadow-sm'}`}>
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 mb-1 font-bold">
                        <span>{isSuperAdmin ? '⚡ Zuna SuperAdmin Support' : msg.author || 'HR Admin'}</span>
                        <span>{msg.timestamp || 'Recently'}</span>
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendReply} className="p-3 border-t border-slate-100 bg-white flex gap-2">
              <input type="text" placeholder="Write reply..." value={replyText} onChange={e => setReplyText(e.target.value)} className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-900 font-medium" required/>
              <button type="submit" disabled={sendingReply} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl flex items-center gap-1">
                <Send size={12}/> {sendingReply ? 'Sending...' : 'Reply'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
