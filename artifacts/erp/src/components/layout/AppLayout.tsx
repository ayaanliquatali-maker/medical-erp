import { AiChatPanel } from "../chat/AiChatPanel";
import { Navbar } from "./Navbar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 py-6">
          {children}
        </div>
      </main>
      <AiChatPanel />
    </div>
  );
}
