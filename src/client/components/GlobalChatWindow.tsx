import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Minimize2, Send, X } from 'lucide-react';
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

export const GlobalChatWindow: React.FC<GlobalChatWindowProps> = ({ username = '' }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const refreshChat = async () => {
    try {
      const next = await loadChat();
      setMessages(next);
    } catch {
      // Chat is auxiliary UI and should never block gameplay.
    }
  };

  useEffect(() => {
    void refreshChat();
    const interval = window.setInterval(() => void refreshChat(), 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

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
      setInput('');
      setMessages(prev => [...prev, payload as GlobalChatMessage].slice(-100));
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
            <p className="text-[9px] text-slate-500">Everyone in the game can see these messages.</p>
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
              <p className="mt-0.5 break-words text-[11px] text-slate-400">{message.text}</p>
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
