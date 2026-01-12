"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Input, Spinner, Badge } from "@/components/ui";
import {
  Send,
  Plus,
  MessageSquare,
  Activity,
  Zap,
  Calendar,
  ChevronRight,
  Bot,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}

const quickActions = [
  {
    icon: Activity,
    label: "Analyser ma forme",
    prompt:
      "Peux-tu analyser ma forme actuelle et me dire si je suis prêt pour une séance intense ?",
  },
  {
    icon: Zap,
    label: "Séance du jour",
    prompt:
      "Que penses-tu de ma séance prévue aujourd'hui par rapport à ma récupération ?",
  },
  {
    icon: Calendar,
    label: "Adapter le planning",
    prompt:
      "Je me sens fatigué, peux-tu me proposer une adaptation de mon planning pour les prochains jours ?",
  },
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSessions = async () => {
    try {
      const response = await fetch("/api/chat");
      const data = await response.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error("Error loading sessions:", error);
    }
  };

  const loadMessages = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/chat?sessionId=${sessionId}`);
      const data = await response.json();
      if (data.messages) {
        setMessages(data.messages);
        setCurrentSession(sessionId);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async (message?: string) => {
    const text = message || inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue("");
    setIsStreaming(true);

    // Add user message optimistically
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Add empty assistant message for streaming
    const assistantMessage: Message = {
      id: `temp-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: currentSession,
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.content) {
                fullContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.role === "assistant") {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: fullContent,
                    };
                  }
                  return updated;
                });
              }

              if (data.done && data.sessionId) {
                if (!currentSession) {
                  setCurrentSession(data.sessionId);
                  loadSessions();
                }
              }
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove the assistant message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleNewChat = () => {
    setCurrentSession(null);
    setMessages([]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} jours`;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === "user";

    return (
      <div
        key={message.id}
        className={cn("flex gap-3 mb-4", isUser && "flex-row-reverse")}
      >
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
            isUser ? "bg-accent" : "bg-secondary"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-dark" />
          ) : (
            <Bot className="h-4 w-4 text-white" />
          )}
        </div>

        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3",
            isUser
              ? "bg-accent text-dark rounded-br-sm"
              : "bg-dark-100 rounded-bl-sm"
          )}
        >
          <div
            className={cn(
              "prose prose-sm max-w-none",
              isUser ? "prose-invert" : ""
            )}
            dangerouslySetInnerHTML={{
              __html: formatMessageContent(message.content),
            }}
          />
        </div>
      </div>
    );
  };

  const formatMessageContent = (content: string) => {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-4 lg:-m-8">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-64 border-r border-dark-200 flex flex-col bg-dark-50">
          <div className="p-4 border-b border-dark-200">
            <Button
              variant="primary"
              className="w-full"
              onClick={handleNewChat}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Nouvelle conversation
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">
                Aucune conversation
              </p>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => loadMessages(session.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-xl transition-colors",
                      currentSession === session.id
                        ? "bg-accent/20 text-accent"
                        : "hover:bg-dark-100 text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm truncate">{session.title}</span>
                    </div>
                    <p className="text-xs text-muted mt-1 ml-6">
                      {formatDate(session.updated_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="h-14 border-b border-dark-200 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-dark-100 rounded-lg lg:hidden"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-gradient-to-br from-accent to-secondary rounded-full flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Coach IA</h2>
                <p className="text-xs text-muted">
                  Basé sur vos données temps réel
                </p>
              </div>
            </div>
          </div>

          <Badge variant="success" size="sm">
            <span className="h-1.5 w-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
            En ligne
          </Badge>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner size="lg" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="h-16 w-16 bg-gradient-to-br from-accent/20 to-secondary/20 rounded-2xl flex items-center justify-center mb-6">
                <Bot className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Coach IA</h3>
              <p className="text-muted text-center max-w-md mb-8">
                Posez-moi vos questions sur votre entraînement, votre
                récupération ou votre planning. J&apos;analyse vos données en
                temps réel pour vous conseiller.
              </p>

              {/* Quick actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-2xl">
                {quickActions.map((action) => (
                  <Card
                    key={action.label}
                    variant="interactive"
                    padding="sm"
                    className="cursor-pointer"
                    onClick={() => handleSend(action.prompt)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-accent/20 rounded-xl flex items-center justify-center">
                        <action.icon className="h-5 w-5 text-accent" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{action.label}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}
              {isStreaming && (
                <div className="flex items-center gap-2 text-muted text-sm">
                  <Spinner size="sm" />
                  <span>Le coach réfléchit...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-dark-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Posez votre question au coach..."
                className="pr-12"
                disabled={isStreaming}
              />
            </div>
            <Button
              variant="primary"
              size="icon"
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isStreaming}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted text-center mt-2">
            Le coach analyse vos données de récupération, charge et planning en
            temps réel.
          </p>
        </div>
      </div>
    </div>
  );
}
