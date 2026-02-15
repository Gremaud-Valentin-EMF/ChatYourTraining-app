"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  Button,
  Input,
  Spinner,
  Badge,
  DeleteConfirmationModal,
} from "@/components/ui";
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
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
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
  is_archived?: boolean;
}

interface PlanSession {
  title: string;
  sport?: string;
  duration_minutes?: number;
  description?: string;
  intensity?: string;
  weather_note?: string;
}

interface PlanDay {
  date: string;
  sessions?: PlanSession[];
}

interface PlanWeek {
  week_index?: number;
  focus?: string;
  days?: PlanDay[];
}

interface TrainingPlan {
  summary?: string;
  weeks: PlanWeek[];
}

interface PlanSuggestion {
  id: string;
  plan: TrainingPlan;
  createdAt: string;
  status: "pending" | "saving" | "error";
}

const quickActions = [
  {
    icon: Activity,
    label: "Analyser ma forme",
    prompt:
      "Peux-tu analyser ma forme actuelle et me dire si je suis prêt pour une séance intense ?",
    forcePlan: false,
  },
  {
    icon: Zap,
    label: "Séance du jour",
    prompt:
      "Que penses-tu de ma séance prévue aujourd'hui par rapport à ma récupération ?",
    forcePlan: false,
  },
  {
    icon: Calendar,
    label: "Adapter le planning",
    prompt:
      "Je me sens fatigué, peux-tu me proposer une adaptation de mon planning pour les prochains jours ?",
    forcePlan: true,
  },
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [planSuggestions, setPlanSuggestions] = useState<PlanSuggestion[]>([]);
  const [forcePlanMode, setForcePlanMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [adaptationDetected, setAdaptationDetected] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Removed - now handled by the showArchived useEffect below

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const applyMatches = (matches: boolean) => {
      setIsDesktop(matches);
      setSidebarOpen(matches);
    };

    applyMatches(media.matches);
    const listener = (event: MediaQueryListEvent) =>
      applyMatches(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = () => {
      setContextMenu(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [contextMenu]);

  const loadSessions = async () => {
    try {
      const url = showArchived ? "/api/chat?showArchived=true" : "/api/chat";
      const response = await fetch(url);
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
        setPlanSuggestions([]);
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

  const handleSend = async (
    message?: string,
    options?: { forcePlan?: boolean }
  ) => {
    const text = message || inputValue.trim();
    if (!text || isStreaming) return;

    const shouldForcePlan = options?.forcePlan ?? forcePlanMode;
    if (forcePlanMode) {
      setForcePlanMode(false);
    }

    // Get user timezone
    const getUserTimezone = () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return 'Europe/Paris';
      }
    };

    setInputValue("");
    setIsStreaming(true);
    setAdaptationDetected(null);

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
          forcePlanMode: shouldForcePlan,
          timezone: getUserTimezone(),
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

              if (data.plan) {
                const planId = data.planId || crypto.randomUUID();
                setPlanSuggestions((prev) => [
                  ...prev,
                  {
                    id: planId,
                    plan: data.plan as TrainingPlan,
                    createdAt: new Date().toISOString(),
                    status: "pending",
                  },
                ]);
              }

              if (data.adaptationDetected) {
                setAdaptationDetected(fullContent);
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
    setPlanSuggestions([]);
    setForcePlanMode(false);
    setAdaptationDetected(null);
  };

  const handleRenameStart = (session: ChatSession) => {
    setRenamingSession(session.id);
    setRenameValue(session.title || "");
    setContextMenu(null);
  };

  const handleRenameSave = async () => {
    if (!renamingSession || !renameValue.trim()) return;
    try {
      await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: renamingSession, title: renameValue.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === renamingSession ? { ...s, title: renameValue.trim() } : s
        )
      );
    } catch (error) {
      console.error("Error renaming session:", error);
    }
    setRenamingSession(null);
    setRenameValue("");
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/chat?sessionId=${deleteTarget.id}`, { method: "DELETE" });
      if (currentSession === deleteTarget.id) {
        setCurrentSession(null);
        setMessages([]);
        setPlanSuggestions([]);
      }
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch (error) {
      console.error("Error deleting session:", error);
    }
    setDeleteTarget(null);
  };

  const handleArchiveSession = async (sessionId: string) => {
    try {
      await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, is_archived: true }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (error) {
      console.error("Error archiving session:", error);
    }
    setContextMenu(null);
  };

  // Load sessions on mount and when showArchived changes
  useEffect(() => {
    loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

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

  const handleAcceptPlan = async (planId: string) => {
    const plan = planSuggestions.find((p) => p.id === planId);
    if (!plan || plan.status === "saving") return;

    setPlanSuggestions((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, status: "saving" } : p
      )
    );

    try {
      const response = await fetch("/api/plans/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan }),
      });

      if (!response.ok) {
        throw new Error("Plan accept failed");
      }

      setPlanSuggestions((prev) => prev.filter((p) => p.id !== planId));
    } catch (error) {
      console.error("Accept plan error:", error);
      setPlanSuggestions((prev) =>
        prev.map((p) =>
          p.id === planId ? { ...p, status: "error" } : p
        )
      );
    }
  };

  const handleAdaptPlan = (planId: string) => {
    const plan = planSuggestions.find((p) => p.id === planId);
    if (!plan) return;
    setForcePlanMode(true);
    setInputValue(
      "Peux-tu adapter ce plan à mes contraintes (explique ce que tu veux modifier) ?"
    );
    inputRef.current?.focus();
  };

  const handleRefusePlan = (planId: string) => {
    setPlanSuggestions((prev) => prev.filter((p) => p.id !== planId));
    setForcePlanMode(true);
    setInputValue(
      "Ce plan ne me convient pas. Voici ce que je souhaiterais à la place : "
    );
    inputRef.current?.focus();
  };

  const renderPlanSuggestion = (suggestion: PlanSuggestion) => {
    return (
      <Card
        key={suggestion.id}
        className="mb-6 border border-accent/30 bg-dark-50"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <p className="text-xs text-accent uppercase">Plan IA proposé</p>
            <h3 className="font-semibold text-lg">
              {suggestion.plan.weeks.length} semaine
              {suggestion.plan.weeks.length > 1 ? "s" : ""}
            </h3>
            {suggestion.plan.summary && (
              <p className="text-sm text-muted">{suggestion.plan.summary}</p>
            )}
          </div>
          <Badge variant="outline">
            {suggestion.status === "saving"
              ? "Ajout en cours..."
              : suggestion.status === "error"
              ? "Erreur"
              : "Proposé"}
          </Badge>
        </div>

        <div className="space-y-4">
          {suggestion.plan.weeks.map((week, weekIdx) => (
            <div key={week.week_index ?? weekIdx}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold">
                  Semaine {week.week_index ?? weekIdx + 1}
                </h4>
                {week.focus && (
                  <Badge variant="outline" size="sm">
                    {week.focus}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {week.days && week.days.length > 0 ? (
                  week.days.map((day, dayIdx) => (
                    <div
                      key={`${day.date}-${dayIdx}`}
                      className="p-3 bg-dark-100 rounded-xl"
                    >
                      <p className="text-sm font-semibold mb-2">
                        {formatPlanDate(day.date)}
                      </p>
                      {day.sessions && day.sessions.length > 0 ? (
                        <div className="space-y-2">
                          {day.sessions.map((session, sessionIdx) => (
                            <div
                              key={`${session.title}-${sessionIdx}`}
                              className="rounded-lg border border-dark-200 p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2 justify-between">
                                <span className="font-medium">
                                  {session.title}
                                </span>
                                <Badge variant="info">
                                  {session.duration_minutes || "--"} min
                                </Badge>
                              </div>
                              <p className="text-xs text-muted mt-1">
                                Sport: {session.sport || "N/A"} • Intensité:{" "}
                                {session.intensity || "N/A"}
                              </p>
                              {session.description && (
                                <p className="mt-2 text-sm">
                                  {session.description}
                                </p>
                              )}
                              {session.weather_note && (
                                <p className="mt-1 text-xs text-accent/80 flex items-center gap-1">
                                  <span>🌤️</span>
                                  {session.weather_note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Repos / Libre</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">
                    Aucun jour défini pour cette semaine.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {suggestion.status === "error" && (
          <p className="text-sm text-error mt-3">
            Impossible d&apos;ajouter le plan. Réessaie plus tard.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <Button
            onClick={() => handleAcceptPlan(suggestion.id)}
            disabled={suggestion.status === "saving"}
          >
            {suggestion.status === "saving" ? "Ajout..." : "Accepter"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAdaptPlan(suggestion.id)}
          >
            Adapter
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleRefusePlan(suggestion.id)}
          >
            Refuser
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="relative flex flex-col lg:flex-row h-[calc(100vh-8rem)] gap-4">
      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <div className={cn("flex-shrink-0", isDesktop ? "w-64" : "w-0")}>
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 border-r border-dark-200 flex flex-col bg-dark-50 transform transition-transform duration-200 lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
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
                  <div
                    key={session.id}
                    className={cn(
                      "relative group flex items-start rounded-xl transition-colors",
                      currentSession === session.id
                        ? "bg-accent/20 text-accent"
                        : "hover:bg-dark-100 text-foreground"
                    )}
                  >
                    {renamingSession === session.id ? (
                      <div className="w-full px-2 py-1">
                        <input
                          autoFocus
                          name="session-title"
                          aria-label="Renommer la conversation"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSave();
                            if (e.key === "Escape") {
                              setRenamingSession(null);
                              setRenameValue("");
                            }
                          }}
                          onBlur={() => {
                            setRenamingSession(null);
                            setRenameValue("");
                          }}
                          className="w-full bg-dark-100 border border-dark-200 rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            loadMessages(session.id);
                            if (!isDesktop) {
                              setSidebarOpen(false);
                            }
                          }}
                          className="flex-1 text-left px-3 py-2 min-w-0"
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm truncate">{session.title}</span>
                          </div>
                          <p className="text-xs text-muted mt-1 ml-6">
                            {formatDate(session.updated_at)}
                          </p>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu(contextMenu === session.id ? null : session.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 mt-1 mr-1 rounded-lg hover:bg-dark-200 transition-opacity"
                          aria-label="Options"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted" />
                        </button>

                        {contextMenu === session.id && (
                          <div className="absolute right-0 top-8 z-50 w-44 bg-dark-50 border border-dark-200 rounded-xl shadow-lg p-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameStart(session);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-foreground hover:bg-dark-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Renommer
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveSession(session.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-foreground hover:bg-dark-100"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archiver
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ id: session.id, title: session.title || "cette conversation" });
                                setContextMenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-error hover:bg-error/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowArchived((prev) => !prev)}
              className="w-full mt-3 text-xs text-muted hover:text-foreground text-center py-2 transition-colors"
            >
              {showArchived ? "Masquer archivées" : "Montrer archivées"}
            </button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="h-14 border-b border-dark-200 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
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
                    onClick={() => handleSend(action.prompt, { forcePlan: action.forcePlan })}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <action.icon className="h-5 w-5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm break-words">{action.label}</p>
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
              {planSuggestions.map(renderPlanSuggestion)}
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

        {/* Adaptation detected banner */}
        {adaptationDetected && !isStreaming && (
          <div className="mx-4 mt-2 mb-1 p-3 bg-secondary/10 border border-secondary/30 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-secondary flex-shrink-0" />
              <p className="text-sm text-secondary">
                Le coach suggère une adaptation de planning
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAdaptationDetected(null);
                handleSend("Formule cette suggestion comme une modification de plan structurée avec les détails (séance, date, action)", {
                  forcePlan: true,
                });
              }}
              disabled={isStreaming}
            >
              Formuler comme modification
            </Button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-dark-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
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
            <div className="flex items-center gap-2">
              <Button
                variant={forcePlanMode ? "primary" : "ghost"}
                size="icon"
                onClick={() => setForcePlanMode((prev) => !prev)}
                disabled={isStreaming}
                aria-label="Demander un plan IA"
                leftIcon={<Calendar className="h-4 w-4" />}
              />
              <Button
                variant="primary"
                size="icon"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isStreaming}
                aria-label="Envoyer"
                leftIcon={<Send className="h-4 w-4 text-dark" />}
              />
            </div>
          </div>
          {forcePlanMode && (
            <p className="text-xs text-accent mt-2">
              Vous demandez explicitement une proposition de plan IA.
            </p>
          )}
          <p className="text-xs text-muted text-center mt-2">
            Le coach analyse vos données de récupération, charge et planning en
            temps réel.
          </p>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSession}
        isLoading={false}
        description={
          deleteTarget
            ? `Supprimer "${deleteTarget.title}" et tous ses messages est irrémédiable.`
            : undefined
        }
      />
    </div>
  );
}

function formatPlanDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateString;
  }
}
