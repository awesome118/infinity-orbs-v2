import React, { memo, useEffect, useRef, useState } from 'react';
import { Flag, MessageCircle, Minimize2, Send, X } from 'lucide-react';
import type { GlobalChatMessage } from '../../shared/social.js';

interface GlobalChatWindowProps {
  username?: string;
}

async function loadChat(): Promise<GlobalChatMessage[]> {
  const response = await fetch('/api/chat?ts=' + Date.now(), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error('Could not load chat.');
  return await response.json() as GlobalChatMessage[];
}

const GlobalChatWindowComponent: React.FC<GlobalChatWindowProps> = ({ username = '' }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(() => new Set());
  const endRef = useRef<HTMLDivElement | null>(null);
  const refreshRequestRef = useRef(0);

  const mergeMessages = (current: GlobalChatMessage[], incoming: GlobalChatMessage[]) => {
    const merged = new Map<string, GlobalChatMessage>();
    for (const message of current) merged.set(message.id, message);
    for (const message of incoming) merged.set(message.id, message);
    return Array.from(merged.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-100);
  };

  const refreshChat = async () => {
    const requestId = ++refreshRequestRef.current;
    try {
      const next = await loadChat();
      // Ignore responses from older requests. Embedded webviews can finish
      // overlapping GETs out of order, which otherwise lets stale history
      // briefly replace a newer snapshot.
      if (requestId !== refreshRequestRef.current) return;
      setMessages(prev => mergeMessages(prev, next));
    } catch {
      // Chat is auxiliary UI and should never block gameplay.
    }
  };

  useEffect(() => {
    void refreshChat();
    const interval = window.setInterval(() => void refreshChat(), open ? 3000 : 10000);
    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const reportMessage = async (message: GlobalChatMessage) => {
    if (reportingId) return;
    setReportingId(message.id);
    try {
      const response = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not report message.');
      setReportedIds(prev => {
        const next = new Set(prev);
        next.add(message.id);
        return next;
      });
    } catch (error) {
      console.error('Global chat report error:', error);
    } finally {
      setReportingId(null);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json() as GlobalChatMessage | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload ? payload.error || 'Could not send message.' : 'Could not send message.');
      }
      const sentMessage = payload as GlobalChatMessage;
      setInput('');
      setMessages(prev => mergeMessages(prev, [sentMessage]));
      // Pull the authoritative history after posting. The merge keeps any
      // newer local messages if a concurrent poll is still in flight.
      void refreshChat();
    } catch (error: any) {
      console.error('Global chat error:', error);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-slate-900/95 px-4 py-3 text-xs font-black text-white shadow-2xl backdrop-blur-md hover:bg-slate-800 transition-all"
        title="Open global chat"
      >
        <MessageCircle className="w-4 h-4 text-indigo-300" />
        <span>Global Chat</span>
        {messages.length > 0 && (
          <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-200">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="fixed bottom-4 right-4 z-40 w-[min(380px,calc(100vw-2rem))] rounded-3xl border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur-xl overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-300" />
          <div>
            <h3 className="text-sm font-black text-white">Global Chat</h3>
            <p className="text-[9px] text-slate-500">Everyone in the game can see these messages. Messages can be reported to subreddit moderators.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"
          title="Minimize chat"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="h-72 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-slate-600">
            <div>
              <MessageCircle className="mx-auto mb-2 h-6 w-6" />
              No messages yet.
            </div>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className={message.username === username ? 'text-xs font-black text-indigo-300' : 'text-xs font-bold text-slate-200'}>
                  {message.username}
                </span>
                <span className="text-[9px] text-slate-600">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-[11px] text-slate-400">{message.text}</p>
                <button
                  type="button"
                  onClick={() => void reportMessage(message)}
                  disabled={reportingId === message.id || reportedIds.has(message.id)}
                  className="shrink-0 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-[9px] font-bold text-slate-500 hover:border-rose-500/40 hover:bg-rose-950/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                  title={reportedIds.has(message.id) ? 'Report sent to subreddit moderators' : 'Report this message'}
                  aria-label={reportedIds.has(message.id) ? 'Message reported' : 'Report message'}
                >
                  <Flag className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-800 bg-slate-900/95 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={200}
            placeholder="Message everyone..."
            disabled={sending}
            className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-xl bg-indigo-600 px-3 py-2.5 text-white transition-all hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600"
            title="Send message"
          >
            {sending ? <X className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-1 text-right text-[9px] text-slate-600">{input.length}/200</div>
      </form>
    </section>
  );
};


export const GlobalChatWindow = memo(GlobalChatWindowComponent);
