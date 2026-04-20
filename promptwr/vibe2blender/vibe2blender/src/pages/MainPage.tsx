import React, { useState, useEffect, useCallback } from 'react';
import { useAction, useQuery } from 'wasp/client/operations';
import { chat, generateScript } from 'wasp/client/operations';
import { Sidebar } from '../components/Sidebar';
import { RateLimitBanner } from '../components/RateLimitBanner';
import { WelcomeScreen } from '../features/chat/WelcomeScreen';
import { ChatWindow } from '../features/chat/ChatWindow';
import { ChatInput } from '../features/chat/ChatInput';
import { CodeOutput } from '../features/generation/CodeOutput';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const MainPage = () => {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [isTyping, setIsTyping]         = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter]     = useState(60);
  const [generatedCode, setGeneratedCode] = useState('');

  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);

  // ── Wasp Action Hooks ──────────────────────────────────────────────
  const chatAction     = useAction(chat);
  const generateAction = useAction(generateScript);

  const [healthData, setHealthData] = useState<any>(null);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const fetchUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';
        const res = await fetch(`${fetchUrl}/ollama-health`);
        const data = await res.json();
        if (isMounted) {
          setHealthData(data);
          setOllamaOnline(data?.online ?? false);
        }
      } catch (e) {
        if (isMounted) {
          setOllamaOnline(false);
          setHealthData(null);
        }
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ── Rate Limit Handler ─────────────────────────────────────────────
  const handleRateLimitError = useCallback((error: any) => {
    if (error.statusCode === 429) {
      const seconds = error.data?.retryAfter || 60;
      setRetryAfter(seconds);         // triggers RateLimitBanner countdown reset
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), seconds * 1000);
    }
  }, []);

  // ── NEW_PROJECT — clear the workspace ─────────────────────────────
  const handleNewProject = useCallback(() => {
    setMessages([]);
    setGeneratedCode('');
    setIsTyping(false);
    setIsGenerating(false);
    setCurrentSessionId(undefined);
  }, []);

  // ── Load a past session from the sidebar ──────────────────────────
  const handleSelectSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    try {
      const ops = await import('wasp/client/operations');
      const details = await (ops as any).getChatSessionDetails({ sessionId });
      if (details) {
        setMessages(details.messages.map((m: any) => ({ role: m.role, content: m.content })));
        if (details.blenderScripts && details.blenderScripts.length > 0) {
          setGeneratedCode(details.blenderScripts[details.blenderScripts.length - 1].generatedCode);
        } else {
          setGeneratedCode('');
        }
      }
    } catch (e) {
      console.error('Failed to load session details:', e);
    }
  }, []);

  // ── Send Chat Message ──────────────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string) => {
    const newUserMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setIsTyping(true);
    try {
      const response = await chatAction({
        sessionId: currentSessionId,
        messages: updatedMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      } as any);
      setMessages((prev) => [...prev, { role: 'assistant', content: (response as any).content }]);
      if ((response as any).sessionId) {
        setCurrentSessionId((response as any).sessionId);
      }
    } catch (error: any) {
      console.error('CHAT_ERROR:', error);
      handleRateLimitError(error);
      if (error.statusCode !== 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              error.statusCode === 503 || error.message?.includes('OLLAMA')
                ? '⚠️ AI_INTERVIEWER_OFFLINE: The local model is unreachable. Ensure Ollama is running.'
                : `⚠️ ERROR: ${error.message || 'Communication failure. Check system logs.'}`,
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  }, [messages, chatAction, handleRateLimitError, currentSessionId]);

  // ── Generate Script ────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (messages.length === 0) return;

    // Use the last assistant response as the refined prompt.
    // Fall back to the last user message if no assistant response exists yet.
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const refinedPrompt = lastAssistant?.content || messages[messages.length - 1].content;
    const originalPrompt = messages[0].content;

    setIsGenerating(true);
    try {
      const result = await generateAction({ refinedPrompt, originalPrompt, sessionId: currentSessionId } as any);
      if (result && (result as any).generatedCode) {
        setGeneratedCode((result as any).generatedCode);
      }
    } catch (error: any) {
      console.error('GENERATE_ERROR:', error);
      handleRateLimitError(error);
    } finally {
      setIsGenerating(false);
    }
  }, [messages, generateAction, handleRateLimitError, currentSessionId]);

  const handleSelectExample = useCallback((prompt: string) => {
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  // ── Ollama Status Indicator ────────────────────────────────────────
  const statusColor =
    ollamaOnline === null  ? 'bg-yellow-500' :
    ollamaOnline           ? 'bg-green-500'  :
                             'bg-red-500';

  const statusLabel =
    ollamaOnline === null  ? 'CHECKING...' :
    ollamaOnline           ? `OLLAMA_ACTIVE${(healthData as any)?.latencyMs ? ` (${(healthData as any).latencyMs}ms)` : ''}` :
                             'OLLAMA_OFFLINE';

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden">
      {/* Rate Limit Alert */}
      <RateLimitBanner isVisible={isRateLimited} retryAfterSeconds={retryAfter} />

      {/* Sidebar — now receives callbacks */}
      <Sidebar
        onSelectSession={handleSelectSession}
        onNewProject={handleNewProject}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">

        {/* Left: Chat Workspace */}
        <section className="flex-1 flex flex-col border-r border-border h-full md:h-full overflow-hidden">
          <header className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between flex-shrink-0">
            <h2 className="text-[10px] uppercase tracking-widest font-black text-accent">
              AI_INTERVIEWER ({(healthData as any)?.model?.toUpperCase() ?? 'QWEN_LOCAL'})
            </h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${statusColor} ${ollamaOnline ? 'animate-pulse' : ''}`} />
              <span className="text-[9px] font-black uppercase tracking-widest">{statusLabel}</span>
            </div>
          </header>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            {messages.length === 0 ? (
              <WelcomeScreen onSelectExample={handleSelectExample} />
            ) : (
              <ChatWindow messages={messages} isTyping={isTyping} />
            )}
          </div>

          <ChatInput
            onSend={handleSendMessage}
            isDisabled={isTyping || isGenerating || isRateLimited}
          />
        </section>

        {/* Right: Code Pane */}
        <section className="flex-1 flex flex-col h-full md:h-full overflow-hidden">
          <CodeOutput
            code={generatedCode}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        </section>
      </main>
    </div>
  );
};
