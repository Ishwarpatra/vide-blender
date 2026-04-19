import { useState, useEffect } from 'react';
import { useAuth, logout } from 'wasp/client/auth';
import { useQuery } from 'wasp/client/operations';
import { getScripts } from 'wasp/client/operations';

interface SidebarProps {
  /** Called when user clicks a past session to load it */
  onSelectScript: (code: string, originalPrompt: string) => void;
  /** Called when user clicks NEW_PROJECT to clear the workspace */
  onNewProject: () => void;
}

export const Sidebar = ({ onSelectScript, onNewProject }: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const { data: user } = useAuth();
  const { data: scripts, isLoading } = useQuery(getScripts);

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-secondary border-r border-border transition-all duration-300 z-50 ${
        isOpen ? 'w-64' : 'w-0 overflow-hidden'
      } md:relative md:w-64 md:translate-x-0`}
    >
      <div className="flex flex-col h-full p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-black tracking-tighter">VIBE2BLENDER</h1>
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden text-text hover:text-accent"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* NEW_PROJECT button — now fully wired */}
        <button
          id="new-project-btn"
          onClick={onNewProject}
          className="w-full py-2 px-4 border border-border bg-bg hover:bg-accent hover:text-bg transition-colors text-[10px] font-black tracking-widest mb-6 flex items-center justify-center gap-2"
        >
          + NEW_PROJECT
        </button>

        {/* Session history */}
        <nav className="flex-1 overflow-y-auto">
          <div className="text-[9px] text-accent uppercase font-black mb-4 tracking-widest opacity-50">
            SESSION_HISTORY
          </div>
          <div className="space-y-1">
            {isLoading && (
              <div className="p-3 text-[10px] text-accent/40 italic animate-pulse">
                LOADING_HISTORY...
              </div>
            )}
            {!isLoading && (!scripts || scripts.length === 0) && (
              <div className="p-3 text-[10px] border border-border bg-bg/50 text-accent grayscale italic">
                NO_SAVED_SCRIPTS
              </div>
            )}
            {scripts?.map((script) => (
              <button
                key={script.id}
                onClick={() => onSelectScript(script.generatedCode, script.originalPrompt)}
                className="w-full text-left p-3 text-[10px] border border-border bg-bg/30 hover:bg-accent hover:text-bg transition-colors group"
              >
                <div className="font-black uppercase truncate tracking-tight text-accent group-hover:text-bg/80 mb-1">
                  {script.originalPrompt.substring(0, 40)}{script.originalPrompt.length > 40 ? '…' : ''}
                </div>
                <div className="text-[8px] opacity-50 font-mono">
                  {new Date(script.createdAt).toLocaleDateString()} · {script.generatedCode.split('\n').length} LINES
                </div>
              </button>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="mt-auto pt-4 border-t border-border">
          <div className="flex items-center justify-between gap-3 p-2 bg-bg/20 rounded">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-text text-bg rounded-none flex items-center justify-center text-[10px] font-black">
                {user?.username?.substring(0, 2).toUpperCase() || '??'}
              </div>
              <div className="text-[10px] truncate font-black tracking-tighter uppercase">{user?.username}</div>
            </div>
            <button
              onClick={() => logout()}
              className="text-[9px] font-black text-accent hover:text-text transition-colors"
            >
              LOGOUT
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
