import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import robotAvatar from "@/assets/robot-avatar.png";
import ReactMarkdown from "react-markdown";
import { useOrg } from "@/hooks/use-org";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chatbot`;

export function AiChatbot() {
  const { t, i18n } = useTranslation();
  const { orgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

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
        throw new Error("Stream failed");
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

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 h-[72px] w-[72px] rounded-full bg-primary/20 ring-2 ring-primary/20 text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center group cursor-grab active:cursor-grabbing"
        aria-label="Open AI assistant"
      >
        <img src={robotAvatar} alt="AI Assistant" className="w-[70px] h-[70px] rounded-full object-cover group-hover:scale-110 transition-transform" />
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[520px] rounded-2xl border border-border bg-background shadow-2xl flex flex-col animate-slide-up overflow-hidden">
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
