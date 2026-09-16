import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiUrl } from '@/lib/api-url';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  provider?: string;
  isFallback?: boolean;
  timestamp: string;
}

interface AiStatus {
  configured_provider: string;
  gemini_configured: boolean;
  ollama_available: boolean;
  fallback_available: boolean;
  gemini_model?: string;
  ollama_model?: string;
}

function getLocalKnowledgeReply(query: string, role?: string | null): { reply: string; suggestions: string[] } | null {
  const q = query.toLowerCase().trim();

  if (q.includes("what is farm2fork") || q.includes("about farm2fork") || q.includes("how does farm2fork work")) {
    return {
      reply: "Farm2Fork is a transparent agricultural marketplace connecting verified Indian farmers directly with bulk commercial buyers and household consumers.\n\nKey features:\n• Direct Farm-to-Table: Farmers sell crops directly at transparent prices.\n• Market Intelligence: Real APMC mandi modal price references.\n• Escrow Protection: Digital payments secured until delivery verification.\n• Verified Delivery: Local drivers with secure OTP pickup verification.",
      suggestions: ["How do farmers sell produce here?", "How do I buy fresh crops?", "What does modal price mean?"],
    };
  }

  if (q.includes("sell") || q.includes("add a crop") || q.includes("listing") || q.includes("how to sell")) {
    return {
      reply: "To sell a crop as a Farmer:\n1. Open 'Sell a Crop' from your dashboard.\n2. Select the specific Crop and Variety (e.g. Potato → Kufri Jyoti).\n3. Enter your available quantity (in quintals or kg) and asking price per unit.\n4. Upload verified crop photos showing real produce condition.\n5. Click 'Publish Listing' to make it live for buyers.",
      suggestions: ["What does modal price mean?", "How do I upload crop photos?", "How does pickup verification work?"],
    };
  }

  if (q.includes("modal price") || q.includes("modal") || q.includes("mandi price")) {
    return {
      reply: "Modal Price is the most frequently occurring transaction price observed at an APMC mandi on a given arrival date. It represents the central market tendency. Unlike minimum or maximum prices, modal price reflects the price point where the largest volume actually traded. Check 'Market Insights' before setting your asking price!",
      suggestions: ["What is the difference between Crop and Variety?", "How do I sell a crop?", "Where can I compare mandis?"],
    };
  }

  if (q.includes("crop vs variety") || q.includes("crop and variety") || q.includes("variety")) {
    return {
      reply: "In agriculture, Crop ≠ Variety:\n• Crop: The general plant species (e.g. Potato, Tomato, Onion, Wheat).\n• Variety: The specific cultivated botanical or commercial strain (e.g. for Potato: Kufri Jyoti, Kufri Pukhraj; for Tomato: Vaishali, Abhinav; for Onion: Nasik Red).\n\nNever call a crop name a variety. Knowing your exact variety helps you get the true market price!",
      suggestions: ["What does modal price mean?", "How do I add a crop to sell?", "Where can I compare mandis?"],
    };
  }

  if (q.includes("bulk") || q.includes("wholesale") || role === "buyer") {
    return {
      reply: "To source wholesale produce as a Bulk Buyer:\n1. Open the 'Marketplace' and filter by Crop, Variety, and Location (State/District).\n2. Compare farmer asking prices against official mandi modal references.\n3. Click a listing to inspect quality photos and farm harvest details.\n4. Place a bulk order or message the farmer directly with escrow payment protection.",
      suggestions: ["How do I contact a farmer?", "Where can I see market prices?", "How does payment protection work?"],
    };
  }

  if (q.includes("2 kg") || q.includes("consumer") || q.includes("buy")) {
    return {
      reply: "To purchase fresh produce as a Consumer:\n1. Browse the 'Marketplace' for nearby farm listings.\n2. Choose fresh local produce for fast delivery.\n3. Select your quantity (e.g. 2 kg tomatoes or 5 kg potatoes) and add to cart.\n4. Enter your delivery address and checkout securely. You can track delivery directly from your Orders page!",
      suggestions: ["How do I track my order delivery?", "How do I pay securely?", "What is Farm2Fork?"],
    };
  }

  if (q.includes("driver") || q.includes("pickup") || q.includes("verification")) {
    return {
      reply: "For Logistics Drivers:\n1. View 'Nearby Pickups' assigned in your operating district.\n2. When arriving at the farm, inspect cargo and enter the secure pickup verification code.\n3. Transport the produce safely to the destination.\n4. Confirm drop-off to receive transparent earnings directly in your wallet.",
      suggestions: ["Where can I see my earnings?", "How does pickup verification work?", "What is Farm2Fork?"],
    };
  }

  if (q.includes("pay") || q.includes("payment") || q.includes("escrow") || q.includes("refund")) {
    return {
      reply: "Farm2Fork uses secure digital escrow payments. When a buyer places an order, funds are held securely until the crop is delivered and verified. Once delivery confirmation is completed, funds are automatically disbursed to the farmer.",
      suggestions: ["How do I track my order delivery?", "How do I buy fresh crops?", "What is Farm2Fork?"],
    };
  }

  if (q.includes("photo") || q.includes("image") || q.includes("upload")) {
    return {
      reply: "To upload crop photos:\n1. Go to 'Sell a Crop' or edit an existing listing.\n2. In the Media section, upload clear, well-lit photos of your actual harvested produce.\n3. Verified real crop photos build buyer trust and lead to faster orders!",
      suggestions: ["How do I sell a crop?", "What does modal price mean?", "What is Farm2Fork?"],
    };
  }

  return null;
}

export function AiAssistantDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);

  const { appRole, isAuthenticated, profile } = useAuth();
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch operational status on mount or when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    fetch(apiUrl('/api/ai/status'), { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => undefined);
  }, [isOpen]);

  // Set initial contextual greeting and suggestions when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const roleName = appRole
        ? appRole.charAt(0).toUpperCase() + appRole.slice(1)
        : 'Guest';
      const welcomeMessage: ChatMessage = {
        id: 'welcome-0',
        sender: 'assistant',
        content: `Hello${profile?.name ? `, ${profile.name}` : ''}! I am your Farm2Fork AI Assistant. How can I help you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([welcomeMessage]);

      // Set default contextual suggestions
      if (appRole === 'farmer') {
        setSuggestions([
          'How do I add a crop to sell?',
          'What does modal price mean?',
          'How do I upload crop photos?',
          'How does driver pickup verification work?',
        ]);
      } else if (appRole === 'buyer') {
        setSuggestions([
          'How do I place a bulk order?',
          'How do I contact a farmer?',
          'Where can I compare mandi prices?',
          'How does payment protection work?',
        ]);
      } else if (appRole === 'consumer') {
        setSuggestions([
          'How do I buy 2 kg tomatoes?',
          'How do I track my order delivery?',
          'How do I pay securely?',
        ]);
      } else if (appRole === 'driver') {
        setSuggestions([
          'How do I accept a pickup?',
          'How does pickup verification work?',
          'Where can I see my earnings?',
        ]);
      } else if (appRole === 'admin') {
        setSuggestions([
          'How many active listings exist?',
          'Show market data sync status',
          'How many pending driver approvals exist?',
        ]);
      } else {
        setSuggestions([
          'What is Farm2Fork?',
          'How do farmers sell produce here?',
          'How do I buy fresh crops?',
        ]);
      }
    }
  }, [isOpen, messages.length, appRole, profile]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend ?? input).trim();
    if (!queryText || isLoading) return;

    setInput('');
    setErrorMessage(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let data: any = null;
      try {
        const response = await fetch(apiUrl('/api/ai/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            message: queryText,
            conversation_id: conversationId,
            page_context: location,
            role: appRole ? appRole.toUpperCase() : 'GUEST',
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          data = await response.json();
        } else if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment before sending another message.');
        } else if (response.status === 503) {
          throw new Error('AI assistance is temporarily unavailable.');
        }
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') return;
        // Network error or backend offline: fall through to built-in knowledge responder
      }

      // If backend was not reached or returned non-JSON (e.g. Netlify SPA fallback),
      // resolve with our built-in domain knowledge responder!
      if (!data) {
        const localKnowledge = getLocalKnowledgeReply(queryText, appRole);
        if (localKnowledge) {
          data = {
            reply: localKnowledge.reply,
            provider: 'Farm2Fork Assistant',
            is_fallback: false,
            suggestions: localKnowledge.suggestions,
          };
        } else {
          throw new Error(
            'AI assistance is temporarily unavailable. If you are on Netlify, please configure your backend API URL in VITE_API_BASE_URL.'
          );
        }
      }

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        content: data.reply,
        provider: data.provider,
        isFallback: data.is_fallback,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setErrorMessage(err.message || 'AI assistance is temporarily unavailable.');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setConversationId(null);
    setErrorMessage(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSendMessage();
  };

  return (
    <>
      {/* Floating Button in Bottom-Right Corner */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#163625] px-4 py-3 text-white shadow-xl ring-2 ring-[#f4a024]/40 transition-all hover:scale-105 hover:bg-[#1a412c] focus:outline-hidden"
          aria-label="Ask Farm2Fork AI Assistant"
          data-testid="button-ai-assistant-toggle"
        >
          <span className="relative flex size-6 items-center justify-center rounded-full bg-[#f4a024] text-white">
            <Sparkles size={14} />
          </span>
          <span className="text-sm font-semibold tracking-tight">Ask Farm2Fork</span>
        </button>
      )}

      {/* Slide-over Drawer / Panel */}
      {isOpen && (
        <aside
          aria-label="Farm2Fork AI Assistant"
          className={`fixed bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl transition-all duration-200 ${
            isExpanded
              ? 'h-[85vh] w-[95vw] max-w-[700px]'
              : 'h-[580px] max-h-[85vh] w-[92vw] sm:w-[420px]'
          }`}
          data-testid="panel-ai-assistant"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[#163625] px-4 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#f4a024] text-white shadow-xs">
                <Bot size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Farm2Fork Assistant</h3>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
                  <span>
                    {status?.ollama_available && status.configured_provider === 'ollama'
                      ? 'Local Ollama'
                      : status?.gemini_configured
                        ? 'Gemini'
                        : 'Local AI'}
                  </span>
                  {status?.fallback_available && (
                    <span className="rounded bg-white/15 px-1 py-0.2 text-[9px] text-zinc-200">
                      Fallback Ready
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-zinc-300">
              <button
                type="button"
                onClick={handleClear}
                title="Clear conversation"
                className="rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
                aria-label="Clear chat"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Minimize' : 'Maximize'}
                className="hidden rounded-lg p-1.5 sm:block hover:bg-white/10 hover:text-white"
                aria-label="Resize panel"
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
                aria-label="Close assistant"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3.5 overflow-y-auto p-4 text-xs leading-relaxed sm:text-sm"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#163625] text-white">
                    <Bot size={13} />
                  </span>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                    msg.sender === 'user'
                      ? 'rounded-tr-xs bg-[#163625] text-white'
                      : 'rounded-tl-xs border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
                      msg.sender === 'user' ? 'text-zinc-300' : 'text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {msg.isFallback && (
                      <span className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">
                        Ollama fallback
                      </span>
                    )}
                    <span>{msg.timestamp}</span>
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f4a024] text-white">
                    <User size={13} />
                  </span>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2.5 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="flex size-6 items-center justify-center rounded-full bg-[#163625] text-white">
                  <Bot size={13} />
                </span>
                <span className="flex items-center gap-1.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2">
                  <Loader2 size={13} className="animate-spin text-[#f4a024]" />
                  <span>Thinking...</span>
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <p className="font-semibold">{errorMessage}</p>
                  <p className="mt-0.5 text-[11px] text-red-700 dark:text-red-400">
                    The marketplace remains fully operational. You can try again in a moment.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestion Chips */}
          {suggestions.length > 0 && !isLoading && (
            <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void handleSendMessage(suggestion)}
                    className="shrink-0 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-left font-medium text-[hsl(var(--foreground))] transition-colors hover:border-[#f4a024] hover:bg-[#f4a024]/10"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about Farm2Fork..."
              disabled={isLoading}
              className="h-10 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3.5 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[#f4a024] focus:outline-hidden sm:text-sm"
              data-testid="input-ai-assistant"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex size-10 items-center justify-center rounded-xl bg-[#163625] text-white transition-opacity hover:bg-[#1a412c] disabled:opacity-40"
              aria-label="Send message"
              data-testid="button-ai-assistant-send"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
