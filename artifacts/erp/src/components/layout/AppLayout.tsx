import { Sidebar } from "./Sidebar";
import { AiChatPanel } from "../chat/AiChatPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </main>
      <AiChatPanel />
    </div>
  );
}
