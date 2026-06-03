export default function ChatTypingIndicator() {
  return (
    <div className="flex gap-2 items-end mb-2.5">
      {/* Bot Avatar */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/30 text-white text-[9px] font-bold">
        Z
      </div>
      {/* Typing bubble */}
      <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl rounded-bl-sm px-3.5 py-2.5 shadow-md">
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: '0ms', animationDuration: '0.8s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: '150ms', animationDuration: '0.8s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: '300ms', animationDuration: '0.8s' }}
          />
        </div>
      </div>
    </div>
  );
}
