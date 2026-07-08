import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash, MessageSquare, Plus, Send, Paperclip, X, Search,
  Users, ChevronRight, LogIn, LogOut, Trash2, ExternalLink,
  AlertCircle, Check, Lock, RefreshCw, ArrowLeft, UserPlus, Download
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useModal } from "../context/ModalContext";
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
  deleteChatMessageForMe,
  getAllRegisteredUsers,
  subscribeToAllMessages,
  uploadFileToFirebase,
  markThreadAsRead
} from "../firebase";
import { formatFileSize, getFileIcon } from "../utils/fileUtils";

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

// Helper to convert Base64 Data URL to Blob
const dataURLtoBlob = (dataurl) => {
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error("Error parsing base64 data URL to Blob:", err);
    return null;
  }
};

// ─── File Preview Modal ───────────────────────────────────────
function FilePreviewModal({ file, displayUrl, onClose }) {
  const isImage = file.mimeType?.startsWith("image/") || file.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isVideo = file.mimeType?.startsWith("video/") || file.name?.match(/\.(mp4|webm|ogg)$/i);
  const isPdf = file.mimeType === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");

  const handleDownload = async () => {
    if (file.url && file.url.startsWith("data:")) {
      try {
        const blob = dataURLtoBlob(file.url);
        if (!blob) throw new Error("Could not parse file data.");
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (err) {
        console.error("Failed to download local file:", err);
      }
    } else {
      try {
        const response = await fetch(displayUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = file.name || "download";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (err) {
        console.error("Failed to download remote file:", err);
        const link = document.createElement("a");
        link.href = displayUrl;
        link.download = file.name || "download";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4 sm:p-8 animate-fade-in">
      <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-bg-card border border-border-card rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-card bg-bg-base/50 flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-2xl flex-shrink-0">{getFileIcon(file.mimeType, file.name)}</span>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-text-main truncate block">{file.name}</span>
              <span className="text-xs text-text-mut truncate block">{formatFileSize(file.size)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-sm font-bold rounded-[10px] transition-colors cursor-pointer shadow-sm">
              <Download size={16} /> <span className="hidden sm:inline">Download</span>
            </button>
            <button onClick={onClose} className="p-2 text-text-mut hover:text-text-main hover:bg-bg-base rounded-[10px] transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 flex items-center justify-center bg-bg-base overflow-hidden p-4 relative">
          {isImage ? (
            <img src={displayUrl} alt={file.name} className="max-w-full max-h-full object-contain rounded-[8px]" />
          ) : isVideo ? (
            <video src={displayUrl} controls className="max-w-full max-h-full rounded-[8px]" />
          ) : isPdf ? (
            <iframe src={displayUrl} title={file.name} className="w-full h-full rounded-[8px] bg-white border-none" />
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-6xl">{getFileIcon(file.mimeType, file.name)}</span>
              <p className="text-text-sec text-sm">No preview available for this file type.</p>
              <button onClick={handleDownload} className="px-6 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-[10px] hover:bg-brand-hover transition-colors cursor-pointer shadow-md">
                Download to view
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── File Card ────────────────────────────────────────────────
function FileCard({ file }) {
  const [showPreview, setShowPreview] = useState(false);
  const icon = getFileIcon(file.mimeType, file.name);

  const handleOpenFile = (e) => {
    e.preventDefault();
    setShowPreview(true);
  };

  const isDataUrl = file.url && file.url.startsWith("data:");
  let displayUrl = file.url;
  if (!isDataUrl && displayUrl) {
    if (!displayUrl.startsWith("http")) displayUrl = `https://${displayUrl}`;
    
    // Retroactively fix old S3 URLs in the database to B2 native URLs
    if (displayUrl.includes("s3.") && displayUrl.includes(".backblazeb2.com") && !displayUrl.includes("/file/")) {
      try {
        const urlObj = new URL(displayUrl);
        const parts = urlObj.hostname.split("s3.")[1].split(".")[0];
        const regionNum = parts.split("-").pop();
        urlObj.hostname = `f${regionNum}.backblazeb2.com`;
        
        // Ensure path starts with /file/
        const pathSegments = urlObj.pathname.split("/").filter(Boolean);
        urlObj.pathname = `/file/${pathSegments.join("/")}`;
        
        displayUrl = urlObj.toString();
      } catch (err) {
        // ignore parsing errors
      }
    }
  }

  return (
    <>
      <a
        href={isDataUrl ? undefined : displayUrl}
        target={isDataUrl ? undefined : "_blank"}
        rel={isDataUrl ? undefined : "noopener noreferrer"}
        onClick={handleOpenFile}
        style={{ cursor: "pointer" }}
        className="flex items-center gap-2 w-full max-w-[260px] px-3 py-2 mt-1 rounded-[10px] border border-border-card bg-bg-base hover:bg-bg-card hover:border-brand-primary/30 transition-all group overflow-hidden"
      >
        <span className="flex-shrink-0 flex items-center justify-center text-xl">
          {icon}
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-semibold text-text-main truncate block w-full">{file.name}</span>
          <span className="text-[10px] text-text-mut truncate block w-full">{formatFileSize(file.size)}</span>
        </div>
        <ExternalLink size={12} className="text-text-mut group-hover:text-brand-primary flex-shrink-0 ml-auto" />
      </a>
      {showPreview && (
        <FilePreviewModal
          file={file}
          displayUrl={displayUrl}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

// ─── Single Message Bubble ────────────────────────────────────
function MessageBubble({ msg, currentUserId, isAdmin, onDelete }) {
  const isOwn = msg.senderId === currentUserId;
  const [showActions, setShowActions] = useState(false);
  const pressTimer = React.useRef(null);

  if (msg.isDeleted) {
    return (
      <div className="flex items-center gap-2 py-1 px-3 text-[11px] text-text-mut italic">
        <AlertCircle size={12} /> Message deleted
      </div>
    );
  }

  const handlePressStart = () => {
    if (isAdmin || isOwn) {
      pressTimer.current = setTimeout(() => {
        onDelete(msg.id);
      }, 500);
    }
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  const renderMessageText = (text) => {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/[^\s]+|@[\w.-]+)/g);
    return parts.map((part, i) => {
      if (part.match(/^https?:\/\/[^\s]+$/)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all transition-opacity">
            {part}
          </a>
        );
      }
      if (part.match(/^@[\w.-]+$/)) {
        return (
          <strong key={i} className={`px-1 py-0.5 rounded-[4px] mx-0.5 font-bold ${isOwn ? 'bg-white/20 text-white' : 'bg-brand-primary/10 text-brand-primary'}`}>
            {part}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 px-4 py-1.5 hover:bg-bg-base/40 group relative rounded-[10px] transition-colors ${isOwn ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); handlePressEnd(); }}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchMove={handlePressEnd}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
    >
      <Avatar src={msg.senderAvatar} name={msg.senderName} />
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-bold text-text-sec">{isOwn ? "You" : msg.senderName}</span>
          <span className="text-[10px] text-text-mut">{formatTime(msg.timestamp)}</span>
        </div>
        {msg.text && (
          <div className={`px-3 py-2 rounded-[14px] text-sm leading-relaxed whitespace-pre-wrap ${
            isOwn
              ? "bg-brand-primary text-white rounded-br-sm"
              : "bg-bg-card border border-border-card text-text-main rounded-bl-sm"
          }`}>
            {renderMessageText(msg.text)}
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
  const { currentUser } = useAuth();

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      showToast("File must be under 40MB", "error");
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
        fileData = await uploadFileToFirebase(pendingFile, currentUser?.companyId || "", "files");
      }
      await onSend(text.trim(), fileData);
      setText("");
      if (textRef.current) {
        textRef.current.style.height = "auto";
      }
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
    <div className="px-4 pt-3 pb-20 md:pb-6 border-t border-border-card bg-bg-card/50 backdrop-blur-sm flex-shrink-0">
      {pendingFile && (
        <div className={`mb-2 flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-[8px] text-xs font-semibold text-brand-primary ${uploading ? "animate-pulse" : ""}`}>
          {uploading ? (
            <RefreshCw size={14} className="animate-spin text-brand-primary" />
          ) : (
            <span className="text-base">{getFileIcon(pendingFile.type, pendingFile.name)}</span>
          )}
          <span className="truncate max-w-[200px]">{pendingFile.name}</span>
          <span className="text-text-mut ml-1">({formatFileSize(pendingFile.size)})</span>
          {uploading ? (
            <span className="ml-auto text-[10px] text-brand-primary font-bold animate-pulse">
              Uploading...
            </span>
          ) : (
            <button onClick={() => setPendingFile(null)} className="ml-auto text-text-mut hover:text-red-500 cursor-pointer">
              <X size={12} />
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 bg-bg-base rounded-[12px] border border-border-card px-3 py-2 focus-within:border-brand-primary/50 transition-colors">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 p-1 text-text-mut hover:text-brand-primary transition-colors cursor-pointer"
          title="Attach file (max 40MB)"
        >
          <Paperclip size={16} />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (textRef.current) {
              textRef.current.style.height = "auto";
              textRef.current.style.height = `${Math.min(textRef.current.scrollHeight, 160)}px`;
            }
          }}
          onKeyDown={handleKeyDown}
          /* onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf("image") !== -1 || items[i].type.indexOf("video") !== -1 || items[i].kind === "file") {
                const file = items[i].getAsFile();
                if (file) {
                  if (file.size > 40 * 1024 * 1024) {
                    showToast("File must be under 40MB", "error");
                    return;
                  }
                  setPendingFile(file);
                  e.preventDefault();
                  break;
                }
              }
            }
          }} */
          placeholder={placeholder}
          rows={1}
          disabled={disabled || uploading}
          className="flex-1 bg-transparent text-sm text-text-main placeholder-text-mut outline-none resize-none leading-relaxed max-h-40 overflow-y-auto min-h-[24px]"
          style={{ scrollbarWidth: "none", height: "auto" }}
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
        Press Enter to send · Shift+Enter for new line · Files uploaded securely to the cloud
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
      const ch = await createChannel(name.trim(), desc.trim(), currentUser.uid, currentUser.name, currentUser.companyId);
      showToast(`#${ch.displayName || ch.name} created!`, "success");
      onCreated(ch);
      onClose();
    } catch (err) {
      showToast(err.message || "Failed to create channel", "error");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
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
    </div>,
    document.body
  );
}

// ─── New DM Modal ─────────────────────────────────────────────
function NewDmModal({ allUsers, currentUserId, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = allUsers.filter(
    u => u.uid !== currentUserId &&
    (u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return createPortal(
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
    </div>,
    document.body
  );
}

// ─── Messages Thread Panel ────────────────────────────────────
function ThreadPanel({ thread, currentUser, isAdmin, refreshKey }) {
  const [messages, setMessages] = useState([]);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const bottomRef = useRef(null);
  const { showToast } = useToast();
  const prevThreadIdRef = useRef(null);

  // Determine if user has access to view/message this channel
  const isMember = thread.type !== "channel" || thread.id === "general" || thread.memberIds?.includes(currentUser.uid) || isAdmin;

  // Subscribe to real-time messages for the active thread
  useEffect(() => {
    if (!thread?.id || !isMember) return;
    
    // Only clear messages when switching threads, not when refreshing
    if (prevThreadIdRef.current !== thread.id) {
      setMessages([]);
      prevThreadIdRef.current = thread.id;
    }
    
    const unsub = subscribeToMessages(thread.id, (msgs) => {
      setMessages(msgs);
      // Update read receipt dynamically
      if (thread.id && currentUser?.uid) {
        markThreadAsRead(currentUser.uid, thread.id);
      }
    });
    return unsub;
  }, [thread?.id, refreshKey, isMember, currentUser.uid]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text, fileData) => {
    // Build optimistic message so it appears instantly
    const optimisticMsg = {
      id: "opt-" + Date.now(),
      threadId: thread.id,
      threadType: thread.type,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar || "",
      text: text || "",
      fileData: fileData || null,
      isDeleted: false,
      timestamp: new Date().toISOString(),
      _optimistic: true,
    };
    // Show immediately — don't wait for Firebase/localStorage round-trip
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const savedMsg = await sendChatMessage(
        thread.id,
        thread.type,
        currentUser.uid,
        currentUser.name,
        currentUser.avatar || "",
        text,
        fileData,
        currentUser.companyId
      );
      // Replace the optimistic entry with the real one (has proper id)
      setMessages(prev =>
        prev.map(m => m.id === optimisticMsg.id ? { ...savedMsg, _optimistic: false } : m)
      );
    } catch (err) {
      // Roll back optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      throw err; // bubble up so MessageInput shows toast
    }
  };

  const handleDeleteClick = (msgId) => {
    setMessageToDelete(msgId);
  };

  const confirmDelete = async (type) => {
    if (!messageToDelete) return;
    const msgId = messageToDelete;
    setMessageToDelete(null);

    try {
      // Optimistic removal
      setMessages(prev => prev.filter(m => m.id !== msgId));
      if (type === "everyone") {
        await deleteChatMessage(msgId);
        showToast("Message deleted for everyone", "success");
      } else {
        await deleteChatMessageForMe(msgId, currentUser.uid);
        showToast("Message deleted for you", "success");
      }
    } catch (err) {
      showToast("Failed to delete message", "error");
    }
  };

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
        <div className="w-14 h-14 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
          <Lock size={24} />
        </div>
        <p className="font-bold text-text-main text-sm">Access Restricted</p>
        <p className="text-xs text-text-mut mt-1 max-w-xs">
          Only added members can view the messages and chat in #{thread.displayName || thread.name}.
        </p>
      </div>
    );
  }

  const grouped = messages
    .filter(msg => !(msg.deletedFor && msg.deletedFor.includes(currentUser.uid)))
    .reduce((acc, msg) => {
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
                onDelete={handleDeleteClick}
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
      <div className="flex-shrink-0">
        <MessageInput
          onSend={handleSend}
          placeholder={thread.type === "channel" ? `Message #${thread.displayName || thread.name}` : `Message ${thread.otherUserName}`}
          disabled={false}
        />
      </div>

      {/* Delete Message Modal */}
      {messageToDelete && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-card border border-border-card rounded-[16px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-border-card bg-bg-base/50">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                Delete Message?
              </h3>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => confirmDelete("me")}
                className="w-full py-2.5 px-4 text-sm font-semibold bg-bg-base hover:bg-red-500/10 text-red-500 border border-border-card rounded-[10px] transition-colors cursor-pointer"
              >
                Delete for me
              </button>
              <button
                onClick={() => confirmDelete("everyone")}
                className="w-full py-2.5 px-4 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-[10px] shadow-sm transition-colors cursor-pointer"
              >
                Delete for everyone
              </button>
              <button
                onClick={() => setMessageToDelete(null)}
                className="w-full py-2.5 px-4 text-sm font-semibold text-text-main hover:bg-bg-base rounded-[10px] transition-colors mt-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Main TeamHub Page ────────────────────────────────────────
export default function TeamHub() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { showConfirm } = useModal();
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
  const [refreshKey, setRefreshKey]       = useState(0);
  const [showAddMember, setShowAddMember] = useState(false);
  const [allMessages, setAllMessages]     = useState([]);

  // Subscribe to channels
  useEffect(() => {
    const unsub = subscribeToChannels(currentUser.companyId, setChannels);
    return unsub;
  }, []);

  // Subscribe to DM threads
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeToDmThreads(currentUser.uid, currentUser.companyId, setDmThreads);
    return unsub;
  }, [currentUser?.uid]);

  // Load all users for DM picker
  useEffect(() => {
    getAllRegisteredUsers(currentUser.companyId).then(setAllUsers).catch(() => {});
  }, []);

  // Subscribe to all messages for unread counts
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = subscribeToAllMessages(currentUser.companyId, setAllMessages);
    return unsub;
  }, [currentUser?.uid]);

  // Compute unread count helper
  const getUnreadCount = useCallback((threadId) => {
    const receipts = currentUser?.teamHubReadReceipts || {};
    const lastRead = receipts[threadId] || "1970-01-01T00:00:00.000Z";
    
    return allMessages.filter(
      m => m.threadId === threadId && m.senderId !== currentUser?.uid && new Date(m.timestamp) > new Date(lastRead)
    ).length;
  }, [allMessages, currentUser?.uid, currentUser?.teamHubReadReceipts]);

  const unreadChannelsCount = useMemo(() => {
    return channels.reduce((acc, ch) => {
      // Only count channels the user is in
      if (ch.id === "general" || ch.memberIds?.includes(currentUser?.uid)) {
        return acc + getUnreadCount(ch.id);
      }
      return acc;
    }, 0);
  }, [channels, getUnreadCount, currentUser?.uid]);

  const unreadDmsCount = useMemo(() => {
    return dmThreads.reduce((acc, thread) => {
      return acc + getUnreadCount(thread.id);
    }, 0);
  }, [dmThreads, getUnreadCount]);

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

  const handleAddMember = async (user) => {
    if (!activeThread || activeThread.type !== "channel") return;
    try {
      await joinChannel(activeThread.id, user.uid);
      showToast(`${user.name} added to #${activeThread.displayName || activeThread.name}!`, "success");
      // Update local state immediately
      setActiveThread(prev => ({
        ...prev,
        memberIds: [...(prev.memberIds || []), user.uid]
      }));
    } catch (err) {
      showToast(err.message || "Failed to add member", "error");
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
    showConfirm("Delete Channel", `Delete #${ch.displayName || ch.name}? This cannot be undone.`, async () => {
      try {
        await deleteChannel(ch.id);
        if (activeThread?.id === ch.id) setActiveThread(null);
        showToast(`Channel deleted`, "success");
      } catch (err) {
        showToast(err.message || "Failed to delete", "error");
      }
    }, { confirmText: "Delete", cancelText: "Cancel" });
  };

  const handleOpenDm = async (targetUser) => {
    try {
      const thread = await getOrCreateDmThread(
        currentUser.uid, targetUser.uid,
        currentUser.name, targetUser.name,
        currentUser.companyId
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

  const myChannels   = filteredChannels.filter(ch => ch.id === "general" || ch.memberIds?.includes(currentUser.uid));
  const otherChannels = filteredChannels.filter(ch => ch.id !== "general" && !ch.memberIds?.includes(currentUser.uid));

  return (
    <div className="flex h-[calc(100vh-100px)] sm:h-[calc(100vh-120px)] lg:h-[calc(100vh-140px)] bg-bg-base overflow-hidden rounded-[20px] border border-border-card shadow-sm">
      {/* ── Left Sidebar ── */}
      <aside className={`w-full md:w-[260px] ${activeThread ? "hidden md:flex" : "flex"} flex-shrink-0 bg-bg-card md:border-r border-border-card flex-col`}>
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
          {[
            ["channels", Hash, "Channels", unreadChannelsCount], 
            ["dms", MessageSquare, "Messages", unreadDmsCount]
          ].map(([key, Icon, label, count]) => (
            <button
              key={key}
              onClick={() => setSidebarTab(key)}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer relative ${
                sidebarTab === key
                  ? "text-brand-primary border-b-2 border-brand-primary"
                  : "text-text-mut hover:text-text-main"
              }`}
            >
              <div className="flex items-center gap-1.5 relative">
                <Icon size={12} /> {label}
                {count > 0 && (
                  <span className="absolute -top-1 -right-2.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {sidebarTab === "channels" ? (
            <>
              {/* Create channel button for all employees */}
              <div className="px-3 mb-1">
                <button
                  onClick={() => setShowCreateCh(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs font-bold text-brand-primary hover:bg-brand-primary/8 transition-colors cursor-pointer border border-dashed border-brand-primary/30"
                >
                  <Plus size={13} /> Create Channel
                </button>
              </div>

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
                      unreadCount={getUnreadCount(ch.id)}
                    />
                  ))}
                </div>
              )}

              {/* Available channels to join */}
              {isAdmin && otherChannels.length > 0 && (
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
                  <p className="text-[10px] text-text-mut mt-1">Create the first channel above!</p>
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
              {[...dmThreads].sort((a, b) => {
                const aMsgs = allMessages.filter(m => m.threadId === a.id);
                const bMsgs = allMessages.filter(m => m.threadId === b.id);
                const aTime = aMsgs.length > 0 ? new Date(aMsgs[aMsgs.length - 1].timestamp).getTime() : 0;
                const bTime = bMsgs.length > 0 ? new Date(bMsgs[bMsgs.length - 1].timestamp).getTime() : 0;
                return bTime - aTime;
              }).map(thread => {
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
                    {getUnreadCount(thread.id) > 0 && (
                      <span className="flex-shrink-0 bg-brand-primary text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                        {getUnreadCount(thread.id)}
                      </span>
                    )}
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
      <div className={`flex-1 ${activeThread ? "flex" : "hidden md:flex"} flex-col min-w-0 h-full`}>
        {activeThread ? (
          <>
            {/* Thread Header */}
            <div className="px-6 py-3.5 border-b border-border-card bg-bg-card flex-shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button on mobile */}
                <button
                  onClick={() => setActiveThread(null)}
                  className="md:hidden p-1.5 rounded-full hover:bg-bg-base text-text-mut hover:text-brand-primary transition-colors cursor-pointer mr-1 flex items-center justify-center border border-border-card"
                  title="Back to lists"
                >
                  <ArrowLeft size={16} />
                </button>
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
                {activeThread.type === "channel" && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="p-1.5 rounded-full hover:bg-bg-base text-brand-primary border border-brand-primary/20 hover:border-brand-primary transition-all cursor-pointer flex items-center justify-center"
                    title="Add Member"
                  >
                    <UserPlus size={14} />
                  </button>
                )}
                {/* Refresh button */}
                <button
                  onClick={() => {
                    setRefreshKey(prev => prev + 1);
                    showToast("Syncing messages...", "info");
                  }}
                  className="p-1.5 rounded-full hover:bg-bg-base text-text-mut hover:text-brand-primary border border-transparent hover:border-border-card transition-all cursor-pointer flex items-center justify-center"
                  title="Refresh chat thread"
                >
                  <RefreshCw size={14} className="hover:rotate-180 transition-transform duration-300" />
                </button>
              </div>
            </div>

            {/* Thread Messages */}
            <div className="flex-1 min-h-0">
              <ThreadPanel
                thread={activeThread}
                currentUser={currentUser}
                isAdmin={isAdmin}
                refreshKey={refreshKey}
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
        {showAddMember && activeThread?.type === "channel" && (
          <AddMemberModal
            channel={activeThread}
            allUsers={allUsers}
            onClose={() => setShowAddMember(false)}
            onAdd={handleAddMember}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Channel List Item ────────────────────────────────────────
function ChannelItem({ ch, isActive, isMember, isAdmin, joiningId, onClick, onLeave, onDelete, unreadCount }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`flex items-center gap-1 rounded-[10px] mb-0.5 transition-colors group ${
        isActive ? "bg-brand-primary/12 text-brand-primary" : "hover:bg-bg-base text-text-sec hover:text-text-main"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button onClick={onClick} className="flex-1 flex items-center gap-2 px-3 py-2 text-left cursor-pointer min-w-0">
        <Hash size={13} className={`flex-shrink-0 ${isActive ? "text-brand-primary" : "text-text-mut"}`} />
        <span className="text-xs font-semibold truncate flex-1">{ch.displayName || ch.name}</span>
        {unreadCount > 0 && !isActive && (
          <span className="flex-shrink-0 bg-brand-primary text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold ml-1">
            {unreadCount}
          </span>
        )}
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

// ─── Add Member Modal ──────────────────────────────────────────
function AddMemberModal({ channel, allUsers, onClose, onAdd }) {
  const [search, setSearch] = useState("");
  
  // Filter out users who are already members of this channel
  const candidates = allUsers.filter(
    u => !channel.memberIds?.includes(u.uid) &&
    (u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[4px] flex items-center justify-center z-[100] p-4 animate-fade-in">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm bg-bg-card border border-border-card rounded-[20px] p-5 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-extrabold text-base text-text-main flex items-center gap-2">
            <Users size={16} className="text-brand-primary" /> Add Member
          </h3>
          <button onClick={onClose} className="text-text-mut hover:text-text-main cursor-pointer"><X size={18} /></button>
        </div>
        <p className="text-[10px] text-text-mut mb-3">Add teammate to #{channel.displayName || channel.name}</p>
        
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
          {candidates.length === 0 ? (
            <p className="text-xs text-text-mut text-center py-4">No eligible teammates found</p>
          ) : candidates.map(u => (
            <div
              key={u.uid}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] hover:bg-bg-base transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={u.avatar} name={u.name} />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-text-main truncate">{u.name}</div>
                  <div className="text-[9px] text-text-mut truncate">{u.department} · {u.email}</div>
                </div>
              </div>
              <button
                onClick={() => onAdd(u)}
                className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 bg-brand-primary text-white rounded-full hover:bg-brand-hover transition-all cursor-pointer"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
