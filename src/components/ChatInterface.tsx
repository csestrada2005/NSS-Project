import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  isLoading: boolean;
  onSendMessage: (message: string) => Promise<boolean>;
  selectedElement: { tagName: string; className?: string } | null;
  editMode: 'interaction' | 'visual' | 'code';
  setEditMode: (mode: 'interaction' | 'visual' | 'code') => void;
}

export function ChatInterface({ isLoading, onSendMessage, selectedElement }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const success = await onSendMessage(userMessage);

      if (success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `I received your request: ${userMessage}` }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Sorry, something went wrong processing your request.` }
        ]);
      }
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Sorry, an unexpected error occurred.` }
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900">
      <div className="p-4 border-b border-gray-800 flex items-center gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="w-6 h-6 text-red-500" />
          Wyrd Forge
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start w-full">
             <div className="bg-gray-800 text-gray-200 rounded-lg p-3 text-sm flex items-center gap-1">
               <Loader2 className="w-4 h-4 animate-spin" />
               <span className="text-xs text-gray-400">Thinking...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-800 bg-gray-900">
        {selectedElement && (
          <div className="mb-2 px-3 py-1.5 bg-red-900/30 border border-red-500/30 rounded text-xs text-red-200 flex items-center justify-between">
            <span>
              Selected: <span className="font-mono text-red-100">&lt;{selectedElement.tagName.toLowerCase()}{selectedElement.className ? `.${selectedElement.className.split(' ')[0]}` : ''}&gt;</span>
            </span>
          </div>
        )}
        {!isLoading && input === '' && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              '✨ Build a Pipeline View for Leads',
              '✨ Create a Paid Payments Bar Chart',
              '✨ Build an Active Projects Dashboard',
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setInput(suggestion);
                  setTimeout(() => {
                    const trimmed = suggestion.trim();
                    setInput('');
                    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
                    onSendMessage(trimmed).then((success) => {
                      setMessages(prev => [
                        ...prev,
                        {
                          role: 'assistant',
                          content: success
                            ? `I received your request: ${trimmed}`
                            : 'Sorry, something went wrong processing your request.',
                        },
                      ]);
                    });
                  }, 0);
                }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-500/50 text-gray-300 hover:text-white rounded-full text-xs transition-colors truncate max-w-full"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-red-600 text-white p-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
