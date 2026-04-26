import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, GripVertical } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import robotAvatar from "@/assets/robot-avatar.png";
import ReactMarkdown from "react-markdown";
import { useOrg } from "@/hooks/use-org";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chatbot`;
const HISTORY_KEY = "actv_nova_history_v1";
const MAX_PERSISTED_MSGS = 30; // keep last ~30 turns

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
  } catch {
    return [];
  }
}

function saveHistory(msgs: Msg[]) {
  try {
    const trimmed = msgs.slice(-MAX_PERSISTED_MSGS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore quota */ }
}

// Panel dimensions (must match JSX classes below)
const PANEL_WIDTH = 380;
const PANEL_MAX_HEIGHT = 520;
const BUTTON_SIZE = 72;
const GRIP_WIDTH = 20;
const EDGE_PADDING = 8;

export function AiChatbot() {
  const { t, i18n } = useTranslation();
  const { orgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist messages on change
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 }); // offset from default bottom-right
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posAtDragStart = useRef({ x: 0, y: 0 });

  // Clamp BUBBLE position so the avatar+grip stay on-screen.
  // The bubble sits flush in the corner the user drops it in — independent of the panel.
  const clampPosition = useCallback((pos: { x: number; y: number }) => {
    if (typeof window === "undefined") return pos;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const bubbleWidth = BUTTON_SIZE + GRIP_WIDTH;
    const bubbleHeight = BUTTON_SIZE;

    // right offset = 24 - x. Keep bubble visible.
    const maxX = 24 - EDGE_PADDING; // can't pass right edge
    const minX = -(vw - bubbleWidth - 24 - EDGE_PADDING); // can't pass left edge

    const maxY = 24 - EDGE_PADDING; // can't pass bottom edge
    const minY = -(vh - bubbleHeight - 24 - EDGE_PADDING); // can't pass top edge

    return {
      x: Math.min(maxX, Math.max(minX, pos.x)),
      y: Math.min(maxY, Math.max(minY, pos.y)),
    };
  }, []);

  // Re-clamp when window resizes
  useEffect(() => {
    const onResize = () => setPosition((p) => clampPosition(p));
    window.addEventListener("resize", onResize);
    setPosition((p) => clampPosition(p));
    return () => window.removeEventListener("resize", onResize);
  }, [clampPosition]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posAtDragStart.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition(clampPosition({
      x: posAtDragStart.current.x + dx,
      y: posAtDragStart.current.y + dy,
    }));
  }, [clampPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    // If barely moved, treat as click
    const dx = Math.abs(e.clientX - dragStart.current.x);
    const dy = Math.abs(e.clientY - dragStart.current.y);
    if (dx < 5 && dy < 5) {
      setOpen((o) => !o);
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: newMessages,
          language: i18n.language,
          orgId,
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          setRateLimited(true);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: t("chatbot.rateLimited", "You've used all 300 AI assistant messages this month. They'll reset next month!") },
          ]);
          setIsLoading(false);
          return;
        }
        if (resp.status === 402) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "AI usage limit reached for this workspace. Please add credits in Settings → Workspace → Usage and try again." },
          ]);
          setIsLoading(false);
          return;
        }
        if (resp.status === 503) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "The AI service is temporarily overloaded. Please wait a few seconds and try again — your account is fine, this is a momentary hiccup." },
          ]);
          setIsLoading(false);
          return;
        }
        let detail = "";
        try {
          const j = await resp.clone().json();
          detail = j?.error ? ` (${j.error})` : "";
        } catch { /* ignore */ }
        throw new Error(`Stream failed: ${resp.status}${detail}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        const content = assistantSoFar;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsert(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("chatbot.error") },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, i18n.language, t, orgId]);

  // Compute button style with drag offset (bubble stays exactly where dropped)
  const buttonStyle: React.CSSProperties = {
    position: "fixed",
    bottom: `${24 - position.y}px`,
    right: `${24 - position.x}px`,
    zIndex: 50,
    touchAction: "none",
  };

  // Panel position: anchor near the bubble, but shift inward to stay fully on-screen.
  // We compute absolute left/top in pixels so the panel can move independently of the bubble.
  const computePanelStyle = (): React.CSSProperties => {
    if (typeof window === "undefined") {
      return { position: "fixed", bottom: "96px", right: "24px", zIndex: 50 };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Bubble's actual screen rect (approx)
    const bubbleRight = 24 - position.x;            // px from right edge
    const bubbleBottom = 24 - position.y;           // px from bottom edge
    const bubbleLeft = vw - bubbleRight - (BUTTON_SIZE + GRIP_WIDTH);
    const bubbleTop = vh - bubbleBottom - BUTTON_SIZE;

    // Preferred: panel sits ABOVE the bubble, right-aligned with it
    let left = bubbleLeft + (BUTTON_SIZE + GRIP_WIDTH) - PANEL_WIDTH; // align right edges
    let top = bubbleTop - PANEL_MAX_HEIGHT - 12; // 12px gap above bubble

    // If no room above, place BELOW the bubble
    if (top < EDGE_PADDING) {
      top = bubbleTop + BUTTON_SIZE + 12;
      // If also no room below, pin to top
      if (top + PANEL_MAX_HEIGHT > vh - EDGE_PADDING) {
        top = Math.max(EDGE_PADDING, vh - PANEL_MAX_HEIGHT - EDGE_PADDING);
      }
    }

    // Horizontal clamp — keep panel fully visible
    if (left < EDGE_PADDING) left = EDGE_PADDING;
    if (left + PANEL_WIDTH > vw - EDGE_PADDING) {
      left = vw - PANEL_WIDTH - EDGE_PADDING;
    }

    return {
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 50,
    };
  };

  const panelStyle = computePanelStyle();

  return (
    <>
      {/* Floating button with drag grip */}
      <div
        style={buttonStyle}
        className="flex items-center gap-0"
      >
        {/* Grip handle */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex items-center justify-center h-8 w-5 rounded-l-full bg-muted/80 border border-r-0 border-border cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 transition-opacity select-none"
          aria-label="Drag to reposition"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {/* Avatar button */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-[72px] w-[72px] rounded-full bg-primary/20 ring-2 ring-primary/20 text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center group"
          aria-label="Open AI assistant"
        >
          <img src={robotAvatar} alt="AI Assistant" className="w-[70px] h-[70px] rounded-full object-cover group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div style={panelStyle} className="w-[380px] max-h-[520px] rounded-2xl border border-border bg-background shadow-2xl flex flex-col animate-slide-up overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-primary/5">
            <img src={robotAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{t("chatbot.title")}</h3>
            </div>
            <IconTooltip label={t("chatbot.close", "Close chat")}>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </IconTooltip>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px]">
            {messages.length === 0 && (
              <div className="flex gap-2">
                <img src={robotAvatar} alt="" className="w-6 h-6 mt-0.5 flex-shrink-0 rounded-full object-cover" />
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  {t("chatbot.greeting")}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <img src={robotAvatar} alt="" className="w-6 h-6 mt-0.5 flex-shrink-0 rounded-full object-cover" />
                )}
                <div
                  className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <img src={robotAvatar} alt="" className="w-6 h-6 mt-0.5 flex-shrink-0 rounded-full object-cover" />
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("chatbot.thinking")}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-border"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chatbot.placeholder")}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              disabled={isLoading}
            />
            <IconTooltip label={t("chatbot.send", "Send message")} side="top">
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="text-primary hover:text-primary/80 disabled:opacity-30 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </IconTooltip>
          </form>
        </div>
      )}
    </>
  );
}
