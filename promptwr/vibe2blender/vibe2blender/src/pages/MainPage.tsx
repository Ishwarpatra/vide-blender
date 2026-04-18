import React, { useState } from 'react';
import { useAction } from 'wasp/client/operations';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState(60);
  const [generatedCode, setGeneratedCode] = useState('');

  // Wasp Action Hooks
  const chatAction = useAction(chat);
  const generateAction = useAction(generateScript);

  const handleRateLimitError = (error: any) => {
    if (error.statusCode === 429) {
      setIsRateLimited(true);
      const seconds = error.data?.retryAfter || 60;
      setRetryAfter(seconds);
      setTimeout(() => setIsRateLimited(false), seconds * 1000);
    }
  };

  const handleSendMessage = async (text: string) => {
    // 1. Add User Message to UI
    const newUserMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);

    // 2. Call Wasp Chat Action with conversation history
    setIsTyping(true);
    try {
      const response = await chatAction({
        message: text,
        conversationHistory: updatedMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
    } catch (error: any) {
      console.error('CHAT_ERROR:', error);
      handleRateLimitError(error);
      if (error.statusCode !== 429) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "ERROR: Communication failure. Please check your connection or system logs."
        }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerate = async () => {
    if (messages.length === 0) return;

    // Use the last assistant message as the refined prompt
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
    const refinedPrompt = lastAssistantMsg?.content || messages[messages.length - 1].content;
    const originalPrompt = messages[0].content;

    setIsGenerating(true);
    try {
      const result = await generateAction({ refinedPrompt, originalPrompt });
      if (result && (result as any).generatedCode) {
        setGeneratedCode((result as any).generatedCode);
      }
    } catch (error: any) {
      console.error('GENERATE_ERROR:', error);
      handleRateLimitError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectExample = (prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden">
      {/* Rate Limit Alert */}
      <RateLimitBanner isVisible={isRateLimited} retryAfterSeconds={retryAfter} />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">

        {/* Left Side: Chat Workspace */}
        <section className="flex-1 flex flex-col border-r border-border h-full md:h-full overflow-hidden">
          <header className="p-4 border-b border-border bg-secondary/50 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-widest font-black text-accent">AI_INTERVIEWER (QWEN_LOCAL)</h2>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[9px] font-black uppercase tracking-widest">OLLAMA_ACTIVE</span>
            </div>
          </header>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            {messages.length === 0 ? (
              <WelcomeScreen onSelectExample={handleSelectExample} />
            ) : (
              <ChatWindow messages={messages} isTyping={isTyping} />
            )}
          </div>

          <ChatInput onSend={handleSendMessage} isDisabled={isTyping || isGenerating || isRateLimited} />
        </section>

        {/* Right Side: Code Pane */}
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
