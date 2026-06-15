import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAiChat } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AiChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const chatMutation = useAiChat();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    chatMutation.mutate(
      { data: { message: userMessage.content, history: messages } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        },
        onError: () => {
          setMessages((prev) => [...prev, { role: "assistant", content: "Error communicating with AI. Please try again." }]);
        }
      }
    );
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg p-0 no-default-hover-elevate no-default-active-elevate bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:shadow-xl hover:scale-105 transition-all duration-300",
          isOpen && "hidden"
        )}
        style={{ position: "fixed" }}
      >
        <MessageSquare className="w-6 h-6" />
      </Button>

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] max-h-[80vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">MediBot</h3>
                <p className="text-[10px] text-muted-foreground">AI Assistant</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-muted" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-transparent via-transparent to-muted/10">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground px-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-primary/40" />
                </div>
                <p className="text-sm font-medium text-foreground/80">Hello! I'm MediBot</p>
                <p className="text-xs mt-2 leading-relaxed">Ask me about your store data, sales, inventory, or financial insights.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className={cn(
                    "px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                      : "bg-muted/70 text-foreground rounded-2xl rounded-bl-md border border-border/50"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {chatMutation.isPending && (
              <div className="flex mr-auto items-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted/70 text-foreground text-sm border border-border/50 flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card/80 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-xl bg-muted/30 border-border/60"
                disabled={chatMutation.isPending}
              />
              <Button type="submit" size="icon" className="rounded-xl shrink-0 bg-gradient-to-br from-primary to-primary/80 hover:shadow-md" disabled={!input.trim() || chatMutation.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
