import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Send, Code, MessageSquare, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { SupabaseService } from "@/services/SupabaseService";

type Tab = "chat" | "builder";
type Message = { role: 'user' | 'assistant'; content: string };
type HistoryEntry = { role: string; content: string };

const AIStudioPage = () => {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [chatInput, setChatInput] = useState("");

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const savedMessages = sessionStorage.getItem('ai_studio_messages');
    const savedHistory = sessionStorage.getItem('ai_studio_history');
    if (savedMessages) { try { setMessages(JSON.parse(savedMessages)); } catch {} }
    if (savedHistory) { try { setConversationHistory(JSON.parse(savedHistory)); } catch {} }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('ai_studio_messages', JSON.stringify(messages));
      sessionStorage.setItem('ai_studio_history', JSON.stringify(conversationHistory));
    }
  }, [messages, conversationHistory]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || isSending) return;

    const userContent = chatInput;
    const userMessage: Message = { role: 'user', content: userContent };
    const newHistory: HistoryEntry = { role: 'user', content: userContent };

    setMessages((prev) => [...prev, userMessage]);
    setConversationHistory((prev) => [...prev, newHistory]);
    setChatInput('');
    setIsSending(true);

    try {
      const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Authorization
        },
        body: JSON.stringify({
          messages: [...conversationHistory, { role: 'user', content: userContent }],
        }),
      });

      const data = await response.json();
      const assistantContent = data.content?.[0]?.text ?? 'Sin respuesta';
      const assistantMessage: Message = { role: 'assistant', content: assistantContent };
      const assistantHistory: HistoryEntry = { role: 'assistant', content: assistantContent };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationHistory((prev) => [...prev, assistantHistory]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: lang === 'es' ? 'Error al conectar con el asistente.' : 'Error connecting to the assistant.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const quickActions = lang === 'es'
    ? ["Resumen del día", "Nueva cotización", "Analizar sitio web", "Ideas de contenido", "Redactar email"]
    : ["Daily summary", "New quote", "Analyze website", "Content ideas", "Draft email"];

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chat", label: "Novy", icon: <MessageSquare size={16} /> },
    { id: "builder", label: lang === 'es' ? "Constructor Web" : "Web Builder", icon: <Code size={16} /> },
  ];

  return (
    <div className="space-y-4 h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === 'es' ? 'Chat con Novy y construye sitios web con IA' : 'Chat with Novy and build websites with AI'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg border border-border w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* CHAT TAB */}
      {activeTab === "chat" && (
        <div className="flex gap-4 h-[calc(100%-80px)]">
          {/* Conversations sidebar */}
          <div className="hidden lg:flex flex-col w-64 shrink-0 bg-muted/50 border border-border rounded-xl">
            <div className="p-3 border-b border-border">
              <button
                onClick={() => { setMessages([]); setConversationHistory([]); setChatInput(''); sessionStorage.removeItem('ai_studio_messages'); sessionStorage.removeItem('ai_studio_history'); }}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={16} />
                {lang === 'es' ? 'Nueva conversación' : 'New conversation'}
              </button>
            </div>
            <div className="flex-1 p-3 space-y-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground text-center py-8">
                {lang === 'es' ? 'Sin conversaciones previas' : 'No previous conversations'}
              </p>
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col bg-muted/30 border border-border rounded-xl overflow-hidden">
            {/* Chat messages / empty state */}
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl flex items-center justify-center mb-6 border border-primary/20">
                  <Bot size={36} className="text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Novy</h3>
                <p className="text-sm text-muted-foreground max-w-md text-center mb-8">
                  {lang === 'es'
                    ? 'Tu asistente de negocios inteligente. Pregunta sobre tus proyectos, genera cotizaciones, analiza métricas o crea reportes.'
                    : 'Your intelligent business assistant. Ask about your projects, generate quotes, analyze metrics, or create reports.'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => setChatInput(action)}
                      className="text-xs bg-secondary hover:bg-secondary/80 text-muted-foreground px-3 py-1.5 rounded-full border border-border transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-muted text-foreground rounded-2xl px-4 py-2.5 text-sm">
                      <span className="animate-pulse">...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  disabled={isSending}
                  className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
                  placeholder={lang === 'es' ? 'Pregunta lo que necesites...' : 'Ask anything...'}
                />
                <button
                  onClick={handleSendChat}
                  disabled={isSending || !chatInput.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEB BUILDER TAB */}
      {activeTab === "builder" && (
        <div className="flex items-center justify-center h-[calc(100%-80px)]">
          <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
              <Code size={32} className="text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {lang === 'es' ? 'Abrir Wyrd Forge' : 'Open Wyrd Forge'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {lang === 'es'
                ? 'Wyrd Forge es nuestro entorno de desarrollo con IA. Crea tu sitio web o SAAS con nuestra IA'
                : 'Wyrd Forge is our AI development environment. Prompt and build your website or SaaS with our AI'}
            </p>
            <button
              onClick={() => navigate('/forge')}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-xl transition-colors"
            >
              <Code size={18} />
              {lang === 'es' ? 'Abrir Wyrd Forge' : 'Open Wyrd Forge'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIStudioPage;
