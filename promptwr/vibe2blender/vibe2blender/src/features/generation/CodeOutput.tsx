import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeOutputProps {
  code: string;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const CodeOutput = ({ code, onGenerate, isGenerating }: CodeOutputProps) => {
  const [copied, setCopied] = useState(false);

  // Strip HTML-encoded entities before displaying/copying
  // (the backend HTML-encodes for XSS safety; we decode for display)
  const displayCode = code
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

  const handleCopy = () => {
    if (!displayCode) return;
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = displayCode ? displayCode.split('\n').length : 0;

  return (
    <div className="flex flex-col h-full bg-secondary/10 overflow-hidden">
      <header className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-orange-500 animate-pulse' : 'bg-accent'}`} />
          <h2 className="text-[10px] uppercase tracking-widest font-black text-accent">
            {isGenerating ? 'COMPILING_ASSETS...' : 'GENERATED_SCRIPT.BPY'}
          </h2>
        </div>

        <div className="flex gap-2">
          <button
            id="copy-code-btn"
            onClick={handleCopy}
            disabled={!displayCode || isGenerating}
            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 transition-all border ${
              copied
                ? 'bg-text text-bg border-text'
                : 'bg-transparent text-text border-border hover:bg-bg disabled:opacity-20'
            }`}
          >
            {copied ? 'COPIED!' : 'COPY_CLIPBOARD'}
          </button>

          <button
            id="generate-script-btn"
            onClick={onGenerate}
            disabled={isGenerating}
            className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-bg border border-border text-text hover:bg-accent disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isGenerating && (
              <div className="w-2 h-2 border-2 border-text border-t-transparent rounded-full animate-spin" />
            )}
            GENERATE_SCRIPT
          </button>
        </div>
      </header>

      {/* Code display — now uses real syntax highlighting */}
      <div className="flex-1 overflow-auto font-mono text-[11px]">
        {displayCode ? (
          <SyntaxHighlighter
            language="python"
            style={vscDarkPlus}
            showLineNumbers
            wrapLines
            customStyle={{
              margin: 0,
              padding: '1.5rem',
              background: 'rgba(0,0,0,0.4)',
              fontSize: '11px',
              height: '100%',
              borderRadius: 0,
            }}
            lineNumberStyle={{ color: '#4a4a4a', fontSize: '10px', minWidth: '2.5em' }}
          >
            {displayCode}
          </SyntaxHighlighter>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-accent/30 space-y-4 opacity-50 grayscale bg-black/40">
            <div className="text-4xl">⌨️</div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em]">AWAITING_COMPILATION</div>
          </div>
        )}
      </div>

      <footer className="p-3 border-t border-border bg-secondary/30 flex items-center justify-between px-6 flex-shrink-0">
        <div className="text-[9px] font-bold text-accent">
          {displayCode ? `LINES: ${lineCount} | CHARS: ${displayCode.length}` : '0 LINES | 0 CHARS'}
        </div>
        <div className="text-[9px] font-bold text-accent">
          TARGET: BLENDER 4.0+
        </div>
      </footer>
    </div>
  );
};
