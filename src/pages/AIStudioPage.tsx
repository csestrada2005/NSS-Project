import { useState } from "react";
import { toast } from "sonner";
import { Bot, Send, Image, Code, MessageSquare, Plus, Settings, Wand2, PanelLeftClose } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Tab = "chat" | "images" | "builder";
type Message = { role: 'user' | 'assistant'; content: string };
type HistoryEntry = { role: string; content: string };

const AIStudioPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [chatInput, setChatInput] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [builderPrompt, setBuilderPrompt] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const navigate = useNavigate();

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [assistantName, setAssistantName] = useState('NOVY');
  const [assistantPersonality, setAssistantPersonality] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [conversationHistory, setConversationHistory] = useState<HistoryEntry[]>([]);

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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 1000,
          system: assistantPersonality || `Eres un asistente útil llamado ${assistantName}`,
          messages: [...conversationHistory, { role: 'user', content: userContent }],
          apiKey,
        }),
      });

      const data = await response.json();
      const assistantContent = data.content?.[0]?.text ?? 'Sin respuesta';
      const assistantMessage: Message = { role: 'assistant', content: assistantContent };
      const assistantHistory: HistoryEntry = { role: 'assistant', content: assistantContent };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationHistory((prev) => [...prev, assistantHistory]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error al conectar con el asistente. Verifica tu API key.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chat", label: "Chat", icon: <MessageSquare size={16} /> },
    { id: "images", label: "Image Studio", icon: <Image size={16} /> },
    { id: "builder", label: "Web Builder", icon: <Code size={16} /> },
  ];

  return (
    <div className="space-y-4 h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">Chat, genera imágenes y construye sitios web con IA</p>
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
                onClick={() => { setMessages([]); setConversationHistory([]); setChatInput(''); }}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={16} />
                Nueva conversación
              </button>
            </div>
            <div className="flex-1 p-3 space-y-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground text-center py-8">Sin conversaciones previas</p>
            </div>
            <div className="p-3 border-t border-border">
              <button onClick={() => setShowConfig(!showConfig)} className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm px-3 py-2 rounded-lg hover:bg-secondary transition-colors">
                <Settings size={14} />
                Configurar asistente
              </button>
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col bg-muted/30 border border-border rounded-xl overflow-hidden">
            {/* Config panel */}
            {showConfig && (
              <div className="p-4 border-b border-border bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Personaliza tu asistente</h3>
                  <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground">
                    <PanelLeftClose size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Nombre del asistente</label>
                    <input
                      value={assistantName}
                      onChange={(e) => setAssistantName(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                      placeholder="NOVY"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Modelo de IA</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                    >
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="claude-sonnet-4-6">Claude 3.5 Sonnet</option>
                      <option value="gemini-pro">Gemini Pro</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Personalidad / Instrucciones</label>
                    <textarea
                      value={assistantPersonality}
                      onChange={(e) => setAssistantPersonality(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none h-16"
                      placeholder="Eres un asistente especializado en..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                      placeholder="sk-..."
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => toast.success('Configuración guardada')}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chat messages / empty state */}
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl flex items-center justify-center mb-6 border border-primary/20">
                  <Bot size={36} className="text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Tu asistente IA</h3>
                <p className="text-sm text-muted-foreground max-w-md text-center mb-8">
                  Configura tu asistente con tu propia API key. Pregunta sobre tus proyectos, genera cotizaciones, analiza métricas y más.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {["Resumen del día", "Nueva cotización", "Analizar sitio web", "Ideas de contenido", "Redactar email"].map((action) => (
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
                  placeholder="Pregunta lo que necesites..."
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

      {/* IMAGE STUDIO TAB */}
      {activeTab === "images" && (
        <div className="flex gap-4 h-[calc(100%-80px)]">
          {/* Controls */}
          <div className="w-80 shrink-0 bg-muted/50 border border-border rounded-xl p-4 space-y-4 overflow-y-auto">
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Describe la imagen</label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none h-24"
                placeholder="Un banner minimalista para tienda de café con tonos cálidos..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Estilo</label>
              <div className="grid grid-cols-2 gap-2">
                {["Realista", "Ilustración", "3D", "Minimalista", "Ad Creative", "Social Post"].map((style) => (
                  <button key={style} className="text-xs bg-secondary hover:bg-secondary/80 text-muted-foreground px-3 py-2 rounded-lg border border-border transition-colors">
                    {style}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Formato</label>
              <select className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring">
                <option>1:1 Instagram</option>
                <option>16:9 Banner</option>
                <option>9:16 Story</option>
                <option>4:5 Feed</option>
                <option>Custom</option>
              </select>
            </div>
            <button className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-xl transition-colors">
              <Wand2 size={18} />
              Generar imagen
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 bg-muted/30 border border-border rounded-xl flex flex-col items-center justify-center p-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-3xl flex items-center justify-center mb-6 border border-purple-500/20">
              <Image size={36} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Genera contenido visual con IA</h3>
            <p className="text-sm text-muted-foreground max-w-md text-center">
              Banners, posts para redes, mockups y más. Describe lo que necesitas y la IA lo genera.
            </p>
          </div>
        </div>
      )}

      {/* WEB BUILDER TAB */}
      {activeTab === "builder" && (
        <div className="flex gap-4 h-[calc(100%-80px)]">
          {/* Builder controls */}
          <div className="w-80 shrink-0 bg-muted/50 border border-border rounded-xl p-4 space-y-4 overflow-y-auto">
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Describe tu sitio web</label>
              <textarea
                value={builderPrompt}
                onChange={(e) => setBuilderPrompt(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none h-32"
                placeholder="Landing page para restaurante japonés con sección de menú, reservas y galería..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Tipo de sitio</label>
              <div className="grid grid-cols-2 gap-2">
                {["Landing", "Portfolio", "E-commerce", "Blog", "Dashboard", "App"].map((type) => (
                  <button key={type} className="text-xs bg-secondary hover:bg-secondary/80 text-muted-foreground px-3 py-2 rounded-lg border border-border transition-colors">
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 rounded-xl transition-colors">
              <Wand2 size={18} />
              Generar sitio
            </button>
          </div>

          {/* Preview */}
          <div className="flex-1 bg-muted/30 border border-border rounded-xl flex flex-col items-center justify-center p-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/20">
              <Code size={36} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Construye sitios web con IA</h3>
            <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
              Ares es nuestro entorno de desarrollo funcional. Describe el sitio que necesitas y genera un prototipo funcional en segundos.
            </p>
            <button
              onClick={() => navigate('/studio')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg"
            >
              <Code size={18} />
              Abrir Web Builder (Ares)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIStudioPage;
