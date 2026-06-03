'use client';

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Wifi, WifiOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatMessage } from './types';

interface HermesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isConnected: boolean;
  agentEnabled: boolean;
  messages: ChatMessage[];
  isTyping: boolean;
  onSendMessage: (content: string) => void;
  /** Display name for the agent (default: "Hermes") */
  agentName?: string;
  /** Agent greeting override for empty state */
  greeting?: string;
}

export function HermesPanel({
  isOpen,
  onClose,
  isConnected,
  agentEnabled,
  messages,
  isTyping,
  onSendMessage,
  agentName = 'Hermes',
  greeting,
}: HermesPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isTyping]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = !isConnected || !agentEnabled;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, scaleY: 0.9, originY: 0 }}
          animate={{ opacity: 1, y: 0, scaleY: 1, originY: 0 }}
          exit={{ opacity: 0, y: -10, scaleY: 0.9, originY: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="pointer-events-auto fixed right-1 top-[68px] lg:right-16 lg:top-[152px] z-[10000] flex flex-col overflow-hidden rounded-2xl border border-teal-200/30 bg-white/85 shadow-2xl backdrop-blur-xl dark:border-teal-800/20 dark:bg-gray-900/85
            w-[calc(100vw-2rem)] max-w-[420px] h-[60vh] max-h-[520px]
            md:w-[380px] md:h-[480px]"
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 border-b border-teal-100/50 bg-gradient-to-r from-teal-50/80 to-cyan-50/60 px-4 py-3 dark:border-teal-800/30 dark:from-teal-950/40 dark:to-cyan-950/30">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0e7490] shadow-md overflow-hidden">
              <img src="/hermes-owl-static.png" alt="" className="h-7 w-auto object-contain drop-shadow-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-teal-900 dark:text-teal-100 tracking-tight">
                {agentName}
              </h2>
              <div className="flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <Wifi className="h-3 w-3 text-teal-500" />
                    <span className="text-[11px] text-teal-600 dark:text-teal-400">Forbundet</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3 text-gray-400" />
                    <span className="text-[11px] text-gray-500">Ikke forbundet</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-600/70 transition-colors hover:bg-teal-100/80 hover:text-teal-800 dark:text-teal-400/70 dark:hover:bg-teal-800/40 dark:hover:text-teal-200"
              aria-label="Luk chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Chat area ── */}
          <div ref={scrollRef} className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-3 p-4">
                {messages.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-16">
                    <p className="text-center text-sm text-muted-foreground">
                      {greeting || `Start en samtale med ${agentName}…`}
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Thinking indicator */}
                {isTyping && (!messages.length || !messages[messages.length - 1]?.isStreaming) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="text-xs italic text-teal-600/70 dark:text-teal-400/70">
                      {agentName} tænker…
                    </span>
                    <ThinkingDots />
                  </motion.div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Input area ── */}
          <div className="border-t border-teal-100/50 bg-gradient-to-r from-teal-50/40 to-cyan-50/30 p-3 dark:border-teal-800/30 dark:from-teal-950/20 dark:to-cyan-950/20">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Spørg ${agentName}…`}
                disabled={isDisabled}
                className="flex-1 min-w-0 rounded-xl border border-teal-200/40 bg-white/60 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-teal-400/60 focus:ring-2 focus:ring-teal-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-700/30 dark:bg-gray-800/60 dark:focus:border-teal-500/60 dark:focus:ring-teal-500/20"
                aria-label="Chat message input"
              />
              <button
                type="submit"
                disabled={isDisabled || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0e7490] text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Message Bubble ── */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isHermes = message.role === 'hermes';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`flex ${isHermes ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isHermes
            ? 'rounded-tl-md bg-gradient-to-br from-teal-50/95 to-cyan-50/80 text-teal-950 dark:from-teal-900/30 dark:to-cyan-900/20 dark:text-teal-50'
            : 'rounded-tr-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
        }`}
      >
        {/* Hermes markdown rendering */}
        {isHermes ? (
          <div className="prose prose-sm prose-teal max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:rounded prose-code:bg-teal-100/60 prose-code:px-1 dark:prose-code:bg-teal-900/40">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {/* Blinking cursor for streaming */}
            {message.isStreaming && (
              <motion.span
                className="inline-block h-4 w-0.5 bg-teal-500 ml-0.5 align-text-bottom"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: 'steps(2)' }}
              />
            )}
          </div>
        ) : (
          <span>{message.content}</span>
        )}

        {/* Timestamp */}
        <div
          className={`mt-1 text-[10px] ${
            isHermes
              ? 'text-teal-500/60 dark:text-teal-400/50'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Thinking Dots ── */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[2px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-teal-400"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.7,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

/* ── Helpers ── */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
