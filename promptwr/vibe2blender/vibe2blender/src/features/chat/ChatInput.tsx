import { useState, useRef, useEffect } from 'react';

export const ChatInput = ({ onSend, isDisabled }: { onSend: (text: string) => void, isDisabled: boolean }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxLength = 500;

  const handleSend = () => {
    if (text.trim() && !isDisabled) {
      onSend(text.trim());
      setText('');
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-6 border-t border-border bg-bg">
      <div className="relative border border-border bg-secondary/30 focus-within:border-text transition-colors">
        <textarea
          id="chat-input-textarea"
          name="chatPrompt"
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={isDisabled ? "WAITING FOR AI RESPONSE..." : "TYPE YOUR 3D CONCEPT..."}
          className="w-full bg-transparent p-4 text-xs resize-none outline-none min-h-[56px] max-h-40 scrollbar-hide"
          rows={1}
        />
        
        <div className="flex items-center justify-between px-4 pb-2">
          <div className={`text-[9px] font-bold ${text.length >= maxLength ? 'text-red-500' : 'text-accent'}`}>
            {text.length}/{maxLength} CHARS
          </div>
          
          <button 
            onClick={handleSend}
            disabled={!text.trim() || isDisabled}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1 bg-text text-bg hover:opacity-80 disabled:opacity-20 transition-all"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
};
