import React from 'react';
import ReactMarkdown from 'react-markdown';

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end mb-2.5`}>
      {/* Bot Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/30 text-white text-[9px] font-bold">
          Z
        </div>
      )}

      {/* Bubble */}
      <div className="max-w-[82%] group">
        <div
          className={`
            relative px-3 py-2 rounded-xl text-xs leading-relaxed shadow-md
            ${isUser
              ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-br-sm'
              : isError
              ? 'bg-red-900/40 border border-red-500/30 text-red-300 rounded-bl-sm'
              : 'bg-white/5 border border-white/10 text-gray-100 backdrop-blur-sm rounded-bl-sm'
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert max-w-none
              [&>*]:text-xs [&>p]:my-0.5 [&>ul]:my-0.5 [&>li]:my-0
              [&>strong]:text-blue-300 [&>h1]:text-blue-200 [&>h2]:text-blue-200 [&>h3]:text-blue-200
              [&>a]:text-blue-400 [&>code]:text-blue-300 [&>p]:text-gray-100">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <p className={`text-[9px] text-gray-600 mt-0.5 ${isUser ? 'text-right pr-0.5' : 'text-left pl-0.5'}`}>
          {formatTime(message.timestamp)}
        </p>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-[9px] font-bold shadow">
          U
        </div>
      )}
    </div>
  );
}
