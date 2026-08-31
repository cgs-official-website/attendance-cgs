import React, { useState, useEffect, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getExternalLinkByToken, subscribeToMessages, sendChatMessage } from "../firebase";
import { Send, User, Building, AlertCircle, Calendar, Lock } from "lucide-react";
import { useToast } from "../context/ToastContext";

export default function ClientChat() {
  const { linkToken } = useParams();
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchLink = async () => {
      try {
        setLoading(true);
        const data = await getExternalLinkByToken(linkToken);
        if (!data) {
          setError("This link is invalid or has expired.");
        } else if (data.status === "revoked") {
          setError("This link has been revoked by the administrator.");
        } else {
          setLinkData(data);
        }
      } catch (err) {
        setError("Failed to load chat. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    if (linkToken) fetchLink();
  }, [linkToken]);

  useEffect(() => {
    if (linkData && linkData.channelId) {
      const unsub = subscribeToMessages(linkData.channelId, (fetchedMessages) => {
        setMessages(fetchedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
      });
      return () => unsub();
    }
  }, [linkData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !linkData) return;

    const text = newMessage;
    setNewMessage("");

    try {
      await sendChatMessage(
        linkData.channelId,
        "channel",
        linkData.clientEmail, // Use email as ID for external user
        linkData.clientName || "Client",
        "", // no avatar
        text,
        null, // no file
        linkData.companyId
      );
    } catch (err) {
      showToast("Failed to send message", "error");
      setNewMessage(text);
    }
  };

  const formatMessageTime = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isSameDay = (d1, d2) => {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
        <div className="max-w-md w-full bg-bg-card rounded-[24px] border border-border-card p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} />
          </div>
          <h2 className="text-2xl font-black text-text-main mb-4">Access Denied</h2>
          <p className="text-text-mut mb-8">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-bg-base font-outfit overflow-hidden">
      {/* Header */}
      <header className="bg-bg-card/80 backdrop-blur-xl border-b border-border-card px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm z-20 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary via-violet-500 to-emerald-500"></div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-primary/20 to-violet-500/20 rounded-2xl flex items-center justify-center text-brand-primary shadow-inner border border-brand-primary/20">
            <Building size={24} className="drop-shadow-md" />
          </div>
          <div>
            <h1 className="text-xl font-black text-text-main tracking-tight drop-shadow-sm">Project: {linkData.projectName}</h1>
            <p className="text-xs font-bold text-text-mut flex items-center gap-2 mt-0.5">
              <User size={12} className="text-brand-primary" />
              Project Manager: {linkData.pmName}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 bg-bg-base/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-border-card shadow-inner">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          <span className="text-xs font-bold text-text-main">Securely connected as {linkData.clientName}</span>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-primary/5 via-bg-base to-bg-base pointer-events-none -z-10"></div>
        
        <div className="max-w-4xl mx-auto flex flex-col space-y-6 z-10">
          
          <div className="text-center my-8 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-card/50"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-5 py-1.5 text-[10px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 backdrop-blur-md rounded-full border border-brand-primary/20 shadow-sm">
                Chat Started • {new Date(linkData.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {messages.map((msg, idx) => {
            const isMe = msg.senderId === linkData.clientEmail;
            const showDate = idx === 0 || !isSameDay(messages[idx - 1].timestamp, msg.timestamp);

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-6">
                    <span className="px-4 py-1.5 bg-bg-card/80 backdrop-blur-sm border border-border-card text-text-sec text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-2 shadow-sm">
                      <Calendar size={12} className="text-text-mut" />
                      {new Date(msg.timestamp).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className={`flex w-full ${isMe ? "justify-end" : "justify-start"} animate-fade-in`}>
                  <div className={`flex max-w-[85%] sm:max-w-[70%] ${isMe ? "flex-row-reverse" : "flex-row"} items-end gap-3`}>
                    {!isMe && (
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-bg-card to-bg-base flex items-center justify-center text-text-main flex-shrink-0 font-black text-sm border border-border-card shadow-sm mb-1 relative">
                        {linkData.pmName.charAt(0).toUpperCase()}
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-bg-base rounded-full"></div>
                      </div>
                    )}
                    
                    <div className="flex flex-col max-w-full">
                      <div className={`mb-1.5 flex items-center ${isMe ? "justify-end" : "justify-start"} gap-2 px-1`}>
                        <span className="text-[11px] font-bold text-text-sec">
                          {isMe ? "You" : linkData.pmName}
                        </span>
                        <span className="text-[9px] font-medium text-text-mut">{formatMessageTime(msg.timestamp)}</span>
                      </div>
                      
                      <div className={`p-4 rounded-[24px] shadow-sm relative group ${
                        isMe 
                          ? "bg-gradient-to-br from-brand-primary to-violet-600 text-white rounded-br-sm shadow-brand-primary/25 border border-white/10" 
                          : "bg-bg-card/90 backdrop-blur-sm border border-border-card text-text-main rounded-bl-sm shadow-md"
                      }`}>
                        <p className={`text-[15px] ${isMe ? "font-medium" : "font-medium leading-relaxed"}`} style={{ wordBreak: 'break-word' }}>
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Input Area */}
      <footer className="bg-bg-base/80 backdrop-blur-xl border-t border-border-card p-4 sm:p-6 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] relative">
        <div className="max-w-4xl mx-auto">
          <form 
            onSubmit={handleSendMessage} 
            className="flex items-end gap-3 bg-bg-card border border-border-card p-2 sm:p-2.5 rounded-[28px] focus-within:border-brand-primary/60 focus-within:shadow-[0_0_20px_rgba(var(--brand-primary-rgb),0.15)] focus-within:ring-4 ring-brand-primary/10 transition-all duration-300"
          >
            <div className="flex-1 bg-transparent rounded-[24px]">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Type your message here..."
                className="w-full bg-transparent text-[15px] text-text-main px-4 py-3 outline-none resize-none max-h-[120px] min-h-[48px] custom-scrollbar placeholder:text-text-mut font-medium leading-relaxed"
                rows="1"
                style={{ height: 'auto' }}
              />
            </div>
            
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="w-12 h-12 bg-gradient-to-br from-brand-primary to-violet-600 text-white rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:from-bg-card disabled:to-bg-card disabled:text-text-mut disabled:border disabled:border-border-card disabled:cursor-not-allowed hover:shadow-lg hover:shadow-brand-primary/30 transition-all duration-300 hover:scale-105 active:scale-95 group"
            >
              <Send size={18} className="mr-0.5 mt-0.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </form>
          <div className="text-center mt-4">
            <span className="text-[10px] text-text-mut font-bold flex items-center justify-center gap-1.5 uppercase tracking-widest opacity-80">
              <Lock size={10} className="text-brand-primary" /> Secure connection by Zuna HRMS
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
