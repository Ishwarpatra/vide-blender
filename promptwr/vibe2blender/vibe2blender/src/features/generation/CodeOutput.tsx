import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const CodeOutput = ({ 
  code, 
  onGenerate, 
  isGenerating 
}: { 
  code: string; 
  onGenerate: () => void; 
  isGenerating: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-secondary/10 overflow-hidden">
      <header className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-orange-500 animate-pulse' : 'bg-accent'}`}></div>
          <h2 className="text-[10px] uppercase tracking-widest font-black text-accent">
            {isGenerating ? 'COMPILING_ASSETS...' : 'GENERATED_SCRIPT.BPY'}
          </h2>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleCopy}
            disabled={!code || isGenerating}
            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 transition-all border ${
              copied 
                ? 'bg-text text-bg border-text' 
                : 'bg-transparent text-text border-border hover:bg-bg disabled:opacity-20'
            }`}
          >
            {copied ? 'COPIED!' : 'COPY_CLIPBOARD'}
          </button>
          
          <button 
            onClick={onGenerate}
            disabled={isGenerating}
            className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-bg border border-border text-text hover:bg-accent disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isGenerating && <div className="w-2 h-2 border-2 border-text border-t-transparent rounded-full animate-spin"></div>}
            GENERATE_SCRIPT
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-black/40 font-mono text-[11px]">
        {code ? (
          <pre className="p-6 overflow-auto text-green-400 m-0 h-full">
            <code>{code}</code>
          </pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-accent/30 space-y-4 opacity-50 grayscale">
            <div className="text-4xl">⌨️</div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em]">AWAITING_COMPILATION</div>
          </div>
        )}
      </div>

      <footer className="p-3 border-t border-border bg-secondary/30 flex items-center justify-between px-6">
        <div className="text-[9px] font-bold text-accent">
          {code ? `LINES: ${code.split('\n').length} | CHARS: ${code.length}` : '0 LINES | 0 CHARS'}
        </div>
        <div className="text-[9px] font-bold text-accent">
          TARGET: BLENDER 4.0+
        </div>
      </footer>
    </div>
  );
};
