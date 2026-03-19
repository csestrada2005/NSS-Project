import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, CheckCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  warning?: string;
}

interface ChatInterfaceProps {
  isLoading: boolean;
  onSendMessage: (
    message: string,
    onProgress?: (step: number, total: number, file: string) => void,
    onRetry?: (attempt: number, error: string) => void
  ) => Promise<{ success: boolean; modifiedFiles: string[]; error?: string; warning?: string }>;
  selectedElement: { tagName: string; className?: string } | null;
}

function BuildProgress({
  lines,
  elapsedSeconds,
  isExpanded,
  onToggleExpand,
  lastError,
}: {
  lines: { text: string; status: 'pending' | 'done' | 'error' }[];
  elapsedSeconds: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  lastError: string | null;
}) {
  const isLastDone = lines.length > 0 && lines[lines.length - 1].status !== 'pending';

  const getPlainEnglish = () => {
    const pending = lines.find(l => l.status === 'pending');
    const lastLine = pending || lines[lines.length - 1];
    if (!lastLine) return 'Working on it...';
    const text = lastLine.text;
    if (text === 'Planning...') return 'Figuring out what to build...';
    if (text.includes('Creating')) return 'Writing new components...';
    if (text.includes('Fixing')) return 'Fixing a small issue...';
    if (text.includes('Modified')) return 'All done ✓';
    return 'Working on it...';
  };

  return (
    <div className="flex justify-start w-full">
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 w-[85%]">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {isLastDone
            ? <CheckCircle size={14} className="text-green-400 shrink-0" />
            : <Loader2 size={14} className="animate-spin shrink-0" />}
          <span>{getPlainEnglish()}</span>
          {!isLastDone && (
            <span className="text-gray-500 text-xs">{elapsedSeconds}s</span>
          )}
        </div>
        <button
          onClick={onToggleExpand}
          className="text-xs text-gray-500 mt-1 hover:text-gray-400 transition-colors"
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        {isExpanded && (
          <div className="mt-2 font-mono text-xs space-y-1">
            {lines.map((line, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className={`flex items-center gap-2 ${
                  line.status === 'done' ? 'text-gray-500' :
                  line.status === 'error' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {line.status === 'done' && <span>✓</span>}
                  {line.status === 'error' && <span>✗</span>}
                  {line.status === 'pending' && <span className="animate-spin inline-block">⟳</span>}
                  <span>{line.text}</span>
                </div>
                {line.status === 'pending' && (
                  <span className="text-gray-500">{elapsedSeconds}s</span>
                )}
              </div>
            ))}
            {lastError && (
              <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold">Error Details</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(lastError)}
                    className="text-gray-400 hover:text-white underline text-[10px]"
                  >
                    Copy error
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre-wrap text-[10px]">
                  {lastError}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatInterface({ isLoading, onSendMessage, selectedElement }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [progressLines, setProgressLines] = useState<{
    text: string;
    status: 'pending' | 'done' | 'error';
  }[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [buildLogExpanded, setBuildLogExpanded] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const buildAssistantMessage = (result: { success: boolean; modifiedFiles: string[]; error?: string; warning?: string }): { content: string; warning?: string } => {
    let content: string;
    if (!result.success) {
      content = 'Sorry, something went wrong processing your request.';
    } else if (result.modifiedFiles.length > 0) {
      content = `Done. Modified: ${result.modifiedFiles.join(', ')}`;
    } else {
      content = 'Done — no files needed changing.';
    }
    return { content, warning: result.warning };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setLastError(null);
    setProgressLines([{ text: 'Planning...', status: 'pending' }]);

    const intervalId = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    try {
      const result = await onSendMessage(
        userMessage,
        (_step, _total, file) => {
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Creating ${file}`, status: 'pending' });
            return next;
          });
        },
        (attempt, _errorMsg) => {
          setProgressLines(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].status === 'pending') {
              next[next.length - 1].status = 'done';
            }
            next.push({ text: `Fixing compile error (attempt ${attempt}/3)...`, status: 'pending' });
            return next;
          });
        }
      );

      clearInterval(intervalId);

      if (result.success) {
        setProgressLines([{ text: `Modified ${result.modifiedFiles.length} files in ${elapsedSeconds}s`, status: 'done' }]);
        setTimeout(() => setProgressLines([]), 4000);
      } else {
        setProgressLines(prev => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1].status = 'error';
          }
          next.push({ text: 'Failed after 3 retries', status: 'error' });
          return next;
        });
        if (result.error) {
          setLastError(result.error);
        }
      }

      const { content, warning } = buildAssistantMessage(result);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content, warning }
      ]);
    } catch (error) {
      clearInterval(intervalId);
      console.error('Error in chat:', error);
      setProgressLines(prev => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1].status = 'error';
        }
        return next;
      });
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, an unexpected error occurred.' }
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
        <Bot className="w-6 h-6 text-red-500 shrink-0" />
        <h2 className="text-xl font-bold text-white">Wyrd Forge</h2>
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
              {msg.warning && (
                <p className="text-yellow-400 text-xs mt-2">⚠️ {msg.warning}</p>
              )}
            </div>
          </div>
        ))}
        {progressLines.length > 0 && (
          <BuildProgress
            lines={progressLines}
            elapsedSeconds={elapsedSeconds}
            isExpanded={buildLogExpanded}
            onToggleExpand={() => setBuildLogExpanded(v => !v)}
            lastError={lastError}
          />
        )}
        {isLoading && progressLines.length === 0 && (
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
                    onSendMessage(trimmed).then((result) => {
                      const { content, warning } = buildAssistantMessage(result);
                      setMessages(prev => [
                        ...prev,
                        { role: 'assistant', content, warning },
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
            className="bg-red-600 text-white p-2 rounded-md hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
