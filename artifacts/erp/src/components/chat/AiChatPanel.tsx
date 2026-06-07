import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
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
          "fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg p-0 no-default-hover-elevate no-default-active-elevate",
          isOpen && "hidden"
        )}
        style={{ position: "fixed" }}
      >
        <MessageSquare className="w-6 h-6" />
      </Button>

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] max-h-[80vh] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              MediERP Assistant
            </h3>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground mt-10">
                <p>Hello! I am your MediERP AI assistant.</p>
                <p className="text-sm mt-2">Ask me anything about your data, how to use the system, or medical references.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={cn("flex flex-col max-w-[80%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className={cn("px-3 py-2 rounded-2xl", msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {chatMutation.isPending && (
              <div className="flex mr-auto items-start">
                <div className="px-3 py-2 rounded-2xl bg-muted text-foreground rounded-bl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Ask something..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-full"
                disabled={chatMutation.isPending}
              />
              <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!input.trim() || chatMutation.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
