import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash, MessageSquare, Plus, Send, Paperclip, X, Search,
  Users, ChevronRight, LogIn, LogOut, Trash2, ExternalLink,
  AlertCircle, Check, Lock
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  subscribeToChannels,
  joinChannel,
  leaveChannel,
  createChannel,
  deleteChannel,
  sendChatMessage,
  subscribeToMessages,
  getOrCreateDmThread,
  subscribeToDmThreads,
  deleteChatMessage,
  getAllRegisteredUsers
} from "../firebase";
import { pickAndUploadFile, formatFileSize, getFileIcon, initGoogleAuth } from "../utils/googleDrive";

// ─── Helpers ─────────────────────────────────────────────────
const getInitials = (name = "") =>
  name.split(" ").filter(Boolean).map(p => p[0]).join("").substring(0, 2).toUpperCase() || "U";

const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// ─── Avatar Component ─────────────────────────────────────────
function Avatar({ src, name, size = "w-8 h-8", textSize = "text-xs" }) {
  return (
    <div className={`${size} rounded-full bg-brand-primary/20 text-brand-primary flex items-center justify-center font-bold ${textSize} uppercase overflow-hidden flex-shrink-0 border border-brand-primary/30`}>
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : getInitials(name)}
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────
function FileCard({ file }) {
  const icon = getFileIcon(file.mimeType, file.name);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 mt-1 rounded-[10px] border border-border-card bg-bg-base hover:bg-bg-card hover:border-brand-primary/30 transition-all group max-w-[260px]"
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-text-main truncate max-w-[180px]">{file.name}</span>
        <span className="text-[10px] text-text-mut">{formatFileSize(file.size)}</span>
      </div>
      <ExternalLink size={12} className="text-text-mut group-hover:text-brand-primary flex-shrink-0 ml-auto" />
    </a>
  );
}

// ─── Single Message Bubble ────────────────────────────────────
function MessageBubble({ msg, currentUserId, isAdmin, onDelete }) {
  const isOwn = msg.senderId === currentUserId;
  const [showActions, setShowActions] = useState(false);

  if (msg.isDeleted) {
    return (
      <div className="flex items-center gap-2 py-1 px-3 text-[11px] text-text-mut italic">
        <AlertCircle size={12} /> Message deleted
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 px-4 py-1.5 hover:bg-bg-base/40 group relative rounded-[10px] transition-colors ${isOwn ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Avatar src={msg.senderAvatar} name={msg.senderName} />
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-bold text-text-sec">{isOwn ? "You" : msg.senderName}</span>
          <span className="text-[10px] text-text-mut">{formatTime(msg.timestamp)}</span>
        </div>
        {msg.text && (
          <div className={`px-3 py-2 rounded-[14px] text-sm leading-relaxed ${
            isOwn
              ? "bg-brand-primary text-white rounded-br-sm"
              : "bg-bg-card border border-border-card text-text-main rounded-bl-sm"
          }`}>
            {msg.text}
          </div>
        )}
        {msg.fileData && <FileCard file={msg.fileData} />}
      </div>

      {/* Message actions */}
      {showActions && (isAdmin || isOwn) && (
        <div className={`absolute top-1 ${isOwn ? "left-2" : "right-2"} flex items-center gap-1 bg-bg-card border border-border-card rounded-[8px] shadow-md p-1`}>
          <button
            onClick={() => onDelete(msg.id)}
            className="p-1 text-text-mut hover:text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
            title="Delete message"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Message Input Bar ────────────────────────────────────────
function MessageInput({ onSend, placeholder, disabled }) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const { showToast } = useToast();

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("File must be under 10MB", "error");
      return;
    }
    setPendingFile(file);
    e.target.value = "";
  };

  const handleSend = async () => {
    if ((!text.trim() && !pendingFile) || disabled) return;
    setUploading(true);
    try {
      let fileData = null;
      if (pendingFile) {
        fileData = await pickAndUploadFile(pendingFile);
      }
      await onSend(text.trim(), fileData);
      setText("");
      setPendingFile(null);
    } catch (err) {
      showToast(err.message || "Failed to send", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-border-card bg-bg-card/50 backdrop-blur-sm flex-shrink-0">
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-[8px] text-xs font-semibold text-brand-primary">
          <span className="text-base">{getFileIcon(pendingFile.type, pendingFile.name)}</span>
          <span className="truncate max-w-[200px]">{pendingFile.name}</span>
          <span className="text-text-mut ml-1">({formatFileSize(pendingFile.size)})</span>
          <button onClick={() => setPendingFile(null)} className="ml-auto text-text-mut hover:text-red-500 cursor-pointer">
            <X size={12} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 bg-bg-base rounded-[12px] border border-border-card px-3 py-2 focus-within:border-brand-primary/50 transition-colors">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 p-1 text-text-mut hover:text-brand-primary transition-colors cursor-pointer"
          title="Attach file (max 10MB)"
        >
          <Paperclip size={16} />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || uploading}
          className="flex-1 bg-transparent text-sm text-text-main placeholder-text-mut outline-none resize-none leading-relaxed max-h-24 overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        />
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !pendingFile) || disabled || uploading}
          className={`flex-shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center transition-all duration-200 ${
            (text.trim() || pendingFile) && !disabled && !uploading
              ? "bg-brand-primary text-white hover:bg-brand-hover shadow-md cursor-pointer"
              : "bg-bg-card text-text-mut cursor-not-allowed"
          }`}
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
      <p className="text-[10px] text-text-mut text-center mt-1.5">
        Press Enter to send · Shift+Enter for new line · Files uploaded to Google Drive
      </p>
    </div>
  );
}

// ─── Create Channel Modal ─────────────────────────────────────
function CreateChannelModal({ onClose, onCreated }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const ch = await createChannel(name.trim(), desc.trim(), currentUser.uid, currentUser.name);
      showToast(`#${ch.displayName || ch.name} created!`, "success");
      onCreated(ch);
      onClose();
    } catch (err) {
      showToast(err.message || "Failed to create channel", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[4px] flex items-center justify-center z-[100] p-4 animate-fade-in">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-bg-card border border-border-card rounded-[20px] p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-extrabold text-base text-text-main flex items-center gap-2">
            <Hash size={18} className="text-brand-primary" /> Create Channel
          </h3>
          <button onClick={onClose} className="text-text-mut hover:text-text-main cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-text-sec uppercase tracking-wider block mb-1">Channel Name *</label>
            <div className="flex items-center gap-2 border border-border-card rounded-[10px] px-3 py-2 bg-bg-base focus-within:border-brand-primary/50">
              <span className="text-text-mut text-sm font-bold">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                placeholder="e.g. design-feedback"
                className="flex-1 bg-transparent text-sm text-text-main outline-none"
                required
                maxLength={50}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-text-sec uppercase tracking-wider block mb-1">Description (optional)</label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full border border-border-card rounded-[10px] px-3 py-2 bg-bg-base text-sm text-text-main outline-none focus:border-brand-primary/50"
              maxLength={200}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border-card rounded-[10px] text-sm font-semibold text-text-sec hover:bg-bg-base cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 bg-brand-primary text-white rounded-[10px] text-sm font-bold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── New DM Modal ─────────────────────────────────────────────
function NewDmModal({ allUsers, currentUserId, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = allUsers.filter(
    u => u.uid !== currentUserId &&
    (u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[4px] flex items-center justify-center z-[100] p-4 animate-fade-in">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm bg-bg-card border border-border-card rounded-[20px] p-5 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-extrabold text-base text-text-main flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-primary" /> New Direct Message
          </h3>
          <button onClick={onClose} className="text-text-mut hover:text-text-main cursor-pointer"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-2 border border-border-card rounded-[10px] px-3 py-2 mb-3 bg-bg-base focus-within:border-brand-primary/50">
          <Search size={14} className="text-text-mut" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teammates..."
            className="flex-1 bg-transparent text-sm text-text-main outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-mut text-center py-4">No users found</p>
          ) : filtered.map(u => (
            <button
              key={u.uid}
              onClick={() => { onSelect(u); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-bg-base transition-colors cursor-pointer text-left"
            >
              <Avatar src={u.avatar} name={u.name} />
              <div>
                <div className="text-sm font-semibold text-text-main">{u.name}</div>
                <div className="text-[10px] text-text-mut">{u.department} · {u.email}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Messages Thread Panel ────────────────────────────────────
function ThreadPanel({ thread, currentUser, isAdmin }) {
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);
  const { showToast } = useToast();
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!thread?.id) return;
    const unsub = subscribeToMessages(thread.id, (msgs) => {
      setMessages(msgs);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, refreshTick]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text, fileData) => {
    await sendChatMessage(
      thread.id,
      thread.type,
      currentUser.uid,
      currentUser.name,
      currentUser.avatar || "",
      text,
      fileData
    );
    // Force re-subscription to pick up new message in local simulation mode
    setRefreshTick(t => t + 1);
  };

  const handleDelete = async (msgId) => {
    try {
      await deleteChatMessage(msgId);
      setRefreshTick(t => t + 1);
      showToast("Message deleted", "success");
    } catch (err) {
      showToast("Failed to delete message", "error");
    }
  };

  const grouped = messages.reduce((acc, msg) => {
    const date = new Date(msg.timestamp).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {Object.entries(grouped).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="flex-1 h-px bg-border-card" />
              <span className="text-[10px] font-bold text-text-mut uppercase tracking-wider px-2">{date}</span>
              <div className="flex-1 h-px bg-border-card" />
            </div>
            {msgs.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                currentUserId={currentUser.uid}
                isAdmin={isAdmin}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center mb-4">
              {thread.type === "channel" ? <Hash size={24} className="text-brand-primary" /> : <MessageSquare size={24} className="text-brand-primary" />}
            </div>
            <p className="font-bold text-text-main text-sm">Start the conversation!</p>
            <p className="text-xs text-text-mut mt-1">
              {thread.type === "channel" ? `This is the beginning of #${thread.displayName || thread.name}` : `Send a message to ${thread.otherUserName}`}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        placeholder={thread.type === "channel" ? `Message #${thread.displayName || thread.name}` : `Message ${thread.otherUserName}`}
        disabled={false}
      />
    </div>
  );
}

// ─── Main TeamHub Page ────────────────────────────────────────
export default function TeamHub() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isAdmin = currentUser?.role === "admin";

  const [channels, setChannels]           = useState([]);
  const [dmThreads, setDmThreads]         = useState([]);
  const [allUsers, setAllUsers]           = useState([]);
  const [activeThread, setActiveThread]   = useState(null);
  const [showCreateCh, setShowCreateCh]   = useState(false);
  const [showNewDm, setShowNewDm]         = useState(false);
  const [searchQuery, setSearchQuery]     = useState("");
  const [joiningId, setJoiningId]         = useState(null);
  const [sidebarTab, setSidebarTab]       = useState("channels"); // 'channels' | 'dms'

  // Init Google Auth
  useEffect(() => {
    initGoogleAuth().catch(() => {}); // silent fail if GIS not loaded yet
  }, []);

  // Subscribe to channels
  useEffect(() => {
    const unsub = subscribeToChannels(setChannels);
    return unsub;
  }, []);

  // Subscribe to DM threads
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeToDmThreads(currentUser.uid, setDmThreads);
    return unsub;
  }, [currentUser?.uid]);

  // Load all users for DM picker
  useEffect(() => {
    getAllRegisteredUsers().then(setAllUsers).catch(() => {});
  }, []);

  const handleJoinChannel = async (ch) => {
    setJoiningId(ch.id);
    try {
      await joinChannel(ch.id, currentUser.uid);
      showToast(`Joined #${ch.displayName || ch.name}!`, "success");
      setActiveThread({ ...ch, type: "channel" });
    } catch (err) {
      showToast(err.message || "Failed to join", "error");
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeaveChannel = async (ch) => {
    if (ch.id === "general") { showToast("Cannot leave the #general channel", "error"); return; }
    try {
      await leaveChannel(ch.id, currentUser.uid);
      if (activeThread?.id === ch.id) setActiveThread(null);
      showToast(`Left #${ch.displayName || ch.name}`, "info");
    } catch (err) {
      showToast(err.message || "Failed to leave", "error");
    }
  };

  const handleDeleteChannel = async (ch) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete #${ch.displayName || ch.name}? This cannot be undone.`)) return;
    try {
      await deleteChannel(ch.id);
      if (activeThread?.id === ch.id) setActiveThread(null);
      showToast(`Channel deleted`, "success");
    } catch (err) {
      showToast(err.message || "Failed to delete", "error");
    }
  };

  const handleOpenDm = async (targetUser) => {
    try {
      const thread = await getOrCreateDmThread(
        currentUser.uid, targetUser.uid,
        currentUser.name, targetUser.name
      );
      const otherId = thread.participantIds.find(id => id !== currentUser.uid);
      const otherName = thread.participantNames?.[otherId] || targetUser.name;
      setActiveThread({ ...thread, type: "dm", otherUserId: otherId, otherUserName: otherName });
      setSidebarTab("dms");
    } catch (err) {
      showToast(err.message || "Failed to open DM", "error");
    }
  };

  const filteredChannels = channels.filter(ch =>
    (ch.displayName || ch.name)?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myChannels   = filteredChannels.filter(ch => ch.memberIds?.includes(currentUser.uid));
  const otherChannels = filteredChannels.filter(ch => !ch.memberIds?.includes(currentUser.uid));

  return (
    <div className="flex h-[calc(100vh-70px)] bg-bg-base overflow-hidden rounded-[20px] border border-border-card shadow-sm">
      {/* ── Left Sidebar ── */}
      <aside className="w-[260px] flex-shrink-0 bg-bg-card border-r border-border-card flex flex-col">
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-border-card">
          <h2 className="font-extrabold text-sm text-text-main flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-primary" /> Team Hub
          </h2>
          <p className="text-[10px] text-text-mut mt-0.5">Channels & Direct Messages</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border-card">
          <div className="flex items-center gap-2 bg-bg-base rounded-[8px] border border-border-card px-2.5 py-1.5 focus-within:border-brand-primary/50">
            <Search size={12} className="text-text-mut" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search channels..."
              className="flex-1 bg-transparent text-xs text-text-main outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-card">
          {[["channels", Hash, "Channels"], ["dms", MessageSquare, "Messages"]].map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setSidebarTab(key)}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                sidebarTab === key
                  ? "text-brand-primary border-b-2 border-brand-primary"
                  : "text-text-mut hover:text-text-main"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {sidebarTab === "channels" ? (
            <>
              {/* Admin: Create channel button */}
              {isAdmin && (
                <div className="px-3 mb-1">
                  <button
                    onClick={() => setShowCreateCh(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs font-bold text-brand-primary hover:bg-brand-primary/8 transition-colors cursor-pointer border border-dashed border-brand-primary/30"
                  >
                    <Plus size={13} /> Create Channel
                  </button>
                </div>
              )}

              {/* Joined channels */}
              {myChannels.length > 0 && (
                <div className="px-3 mb-1">
                  <p className="text-[9px] font-extrabold text-text-mut uppercase tracking-widest mb-1 px-1">Your Channels</p>
                  {myChannels.map(ch => (
                    <ChannelItem
                      key={ch.id}
                      ch={ch}
                      isActive={activeThread?.id === ch.id}
                      isMember={true}
                      isAdmin={isAdmin}
                      joiningId={joiningId}
                      onClick={() => setActiveThread({ ...ch, type: "channel" })}
                      onLeave={() => handleLeaveChannel(ch)}
                      onDelete={() => handleDeleteChannel(ch)}
                    />
                  ))}
                </div>
              )}

              {/* Available channels to join */}
              {otherChannels.length > 0 && (
                <div className="px-3 mt-2">
                  <p className="text-[9px] font-extrabold text-text-mut uppercase tracking-widest mb-1 px-1">Other Channels</p>
                  {otherChannels.map(ch => (
                    <ChannelItem
                      key={ch.id}
                      ch={ch}
                      isActive={false}
                      isMember={false}
                      isAdmin={isAdmin}
                      joiningId={joiningId}
                      onClick={() => handleJoinChannel(ch)}
                      onLeave={null}
                      onDelete={() => handleDeleteChannel(ch)}
                    />
                  ))}
                </div>
              )}

              {channels.length === 0 && (
                <div className="text-center py-8 px-4">
                  <Hash size={24} className="mx-auto text-text-mut mb-2" />
                  <p className="text-xs text-text-mut font-semibold">No channels yet.</p>
                  {isAdmin && <p className="text-[10px] text-text-mut mt-1">Create the first channel above!</p>}
                </div>
              )}
            </>
          ) : (
            // DMs Tab
            <>
              <div className="px-3 mb-1">
                <button
                  onClick={() => setShowNewDm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs font-bold text-brand-primary hover:bg-brand-primary/8 transition-colors cursor-pointer border border-dashed border-brand-primary/30"
                >
                  <Plus size={13} /> New Direct Message
                </button>
              </div>
              {dmThreads.map(thread => {
                const otherId = thread.participantIds.find(id => id !== currentUser.uid);
                const otherName = thread.participantNames?.[otherId] || "Unknown";
                const otherUser = allUsers.find(u => u.uid === otherId);
                return (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThread({ ...thread, type: "dm", otherUserId: otherId, otherUserName: otherName })}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer text-left ${
                      activeThread?.id === thread.id
                        ? "bg-brand-primary/10 border-r-2 border-brand-primary"
                        : "hover:bg-bg-base"
                    }`}
                  >
                    <Avatar src={otherUser?.avatar} name={otherName} size="w-8 h-8" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-text-main truncate">{otherName}</div>
                      <div className="text-[10px] text-text-mut truncate">{otherUser?.department || "Team member"}</div>
                    </div>
                  </button>
                );
              })}
              {dmThreads.length === 0 && (
                <div className="text-center py-8 px-4">
                  <MessageSquare size={24} className="mx-auto text-text-mut mb-2" />
                  <p className="text-xs text-text-mut font-semibold">No messages yet.</p>
                  <p className="text-[10px] text-text-mut mt-1">Start a conversation with a teammate!</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar footer: All users quick DM */}
        <div className="p-3 border-t border-border-card">
          <button
            onClick={() => { setSidebarTab("dms"); setShowNewDm(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] bg-bg-base hover:bg-brand-primary/8 text-xs font-semibold text-text-sec hover:text-brand-primary border border-border-card hover:border-brand-primary/30 transition-all cursor-pointer"
          >
            <Users size={13} /> Browse Team ({allUsers.filter(u => u.uid !== currentUser.uid).length})
          </button>
        </div>
      </aside>

      {/* ── Right Thread Pane ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeThread ? (
          <>
            {/* Thread Header */}
            <div className="px-6 py-3.5 border-b border-border-card bg-bg-card flex-shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {activeThread.type === "channel" ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center flex-shrink-0">
                      <Hash size={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm text-text-main truncate">{activeThread.displayName || activeThread.name}</h3>
                      {activeThread.description && (
                        <p className="text-[10px] text-text-mut truncate">{activeThread.description}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Avatar
                      src={allUsers.find(u => u.uid === activeThread.otherUserId)?.avatar}
                      name={activeThread.otherUserName}
                      size="w-8 h-8"
                    />
                    <div>
                      <h3 className="font-extrabold text-sm text-text-main">{activeThread.otherUserName}</h3>
                      <p className="text-[10px] text-text-mut">
                        {allUsers.find(u => u.uid === activeThread.otherUserId)?.department || "Direct Message"}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {activeThread.type === "channel" && (
                  <span className="text-[10px] font-bold text-text-mut bg-bg-base px-2 py-1 rounded-full border border-border-card">
                    {activeThread.memberIds?.length || 0} members
                  </span>
                )}
              </div>
            </div>

            {/* Thread Messages */}
            <div className="flex-1 min-h-0">
              <ThreadPanel
                thread={activeThread}
                currentUser={currentUser}
                isAdmin={isAdmin}
              />
            </div>
          </>
        ) : (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center mb-6 shadow-lg">
              <MessageSquare size={36} className="text-brand-primary" />
            </div>
            <h2 className="font-extrabold text-xl text-text-main mb-2">Team Hub</h2>
            <p className="text-sm text-text-mut max-w-sm">
              {isAdmin
                ? "Select a channel or direct message to start chatting. Create channels to organize team discussions."
                : "Select a channel to join the conversation, or send a direct message to a teammate."}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSidebarTab("channels")}
                className="px-4 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-[12px] hover:bg-brand-hover transition-colors cursor-pointer flex items-center gap-2"
              >
                <Hash size={14} /> Browse Channels
              </button>
              <button
                onClick={() => { setSidebarTab("dms"); setShowNewDm(true); }}
                className="px-4 py-2.5 border border-border-card text-text-sec text-sm font-semibold rounded-[12px] hover:bg-bg-card transition-colors cursor-pointer flex items-center gap-2"
              >
                <MessageSquare size={14} /> New Message
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateCh && (
          <CreateChannelModal
            onClose={() => setShowCreateCh(false)}
            onCreated={(ch) => setActiveThread({ ...ch, type: "channel" })}
          />
        )}
        {showNewDm && (
          <NewDmModal
            allUsers={allUsers}
            currentUserId={currentUser.uid}
            onClose={() => setShowNewDm(false)}
            onSelect={handleOpenDm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Channel List Item ────────────────────────────────────────
function ChannelItem({ ch, isActive, isMember, isAdmin, joiningId, onClick, onLeave, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`flex items-center gap-1 rounded-[10px] mb-0.5 transition-colors group ${
        isActive ? "bg-brand-primary/12 text-brand-primary" : "hover:bg-bg-base text-text-sec hover:text-text-main"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button onClick={onClick} className="flex-1 flex items-center gap-2 px-3 py-2 text-left cursor-pointer">
        <Hash size={13} className={isActive ? "text-brand-primary" : "text-text-mut"} />
        <span className="text-xs font-semibold truncate">{ch.displayName || ch.name}</span>
        {!isMember && (
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
            {joiningId === ch.id ? "..." : "JOIN"}
          </span>
        )}
      </button>
      {hovered && isMember && (
        <div className="flex items-center gap-0.5 pr-1">
          {isAdmin && ch.id !== "general" && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-text-mut hover:text-red-500 transition-colors cursor-pointer rounded"
            >
              <Trash2 size={11} />
            </button>
          )}
          {ch.id !== "general" && onLeave && (
            <button
              onClick={(e) => { e.stopPropagation(); onLeave(); }}
              className="p-1 text-text-mut hover:text-text-main transition-colors cursor-pointer rounded"
              title="Leave channel"
            >
              <LogOut size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
