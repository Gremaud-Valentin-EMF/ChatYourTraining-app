import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import {
  SYSTEM_PROMPT,
  buildCoachContext,
  formatContextForPrompt,
  checkProactiveAlerts,
  PLAN_GENERATION_PROMPT,
} from "@/lib/openai/coach";
import type { InsertTables, Json, Tables } from "@/types/database";

// Lazy initialization to avoid build-time errors
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      message,
      sessionId,
      includeProactiveAlerts = true,
      forcePlanMode = false,
    } = body;

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Get or create chat session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const sessionPayload: InsertTables<"chat_sessions"> = {
        user_id: user.id,
        title: message.substring(0, 50),
      };
      const { data: newSession, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert(sessionPayload)
        .select()
        .single();

      if (sessionError) {
        console.error("Error creating session:", sessionError);
        return NextResponse.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      currentSessionId = newSession.id;
    }

    // Build context from database
    const context = await buildCoachContext(user.id);
    const contextPrompt = formatContextForPrompt(context);

    // Check for proactive alerts
    const alerts = includeProactiveAlerts ? checkProactiveAlerts(context) : [];
    const alertsPrefix =
      alerts.length > 0 ? alerts.join("\n\n") + "\n\n---\n\n" : "";

    type ChatHistoryEntry = Pick<Tables<"chat_messages">, "role" | "content">;
    // Get recent messages for conversation context
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", currentSessionId)
      .order("created_at", { ascending: true })
      .limit(10);
    const typedRecentMessages = (recentMessages ??
      []) as ChatHistoryEntry[];

    // Build messages array for AI provider
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT + contextPrompt,
      },
      ...typedRecentMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    // Save user message
    const userMessagePayload: InsertTables<"chat_messages"> = {
      session_id: currentSessionId,
      role: "user",
      content: message,
      context_snapshot: context as unknown as Json,
    };
    await supabase.from("chat_messages").insert(userMessagePayload);

    const provider = getChatProvider();
    const planRequested = forcePlanMode || isPlanRequest(message);
    if (provider === "gemini" && !process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Create a readable stream
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        const sendChunk = (content: string) => {
          if (!content) return;
          fullResponse += content;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
          );
        };

        // Send alerts first if any
        if (alertsPrefix) {
          sendChunk(alertsPrefix);
        }

        try {
          if (planRequested) {
            try {
              const planResult = await generatePlanSuggestion({
                messages,
                userMessage: message,
                provider,
              });

              if (!planResult) {
                const fallback =
                  "Je n'ai pas pu générer le plan demandé. Peux-tu reformuler ta demande ?";
                sendChunk(fallback);
              } else {
                if (planResult.summary) {
                  sendChunk(planResult.summary);
                  fullResponse += planResult.summary;
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      plan: planResult.plan,
                      planId: planResult.planId,
                      done: false,
                    })}\n\n`
                  )
                );
              }
            } catch (planError) {
              const fallback = getPlanErrorMessage(planError);
              sendChunk(fallback);
            }

            if (fullResponse.trim()) {
              await supabase.from("chat_messages").insert({
                session_id: currentSessionId,
                role: "assistant",
                content: fullResponse,
              } as InsertTables<"chat_messages">);
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  done: true,
                  sessionId: currentSessionId,
                })}\n\n`
              )
            );
            controller.close();
            return;
          }

          if (provider === "gemini") {
            await streamWithGemini({ messages, onChunk: sendChunk });
          } else {
            await streamWithOpenAI({ messages, onChunk: sendChunk });
          }

          if (!fullResponse.trim()) {
            const fallback =
              "Désolé, je n'ai pas pu générer de réponse pour le moment. Réessaie dans une minute.";
            sendChunk(fallback);
          }

          // Save assistant response
          if (fullResponse.trim()) {
            const assistantMessagePayload: InsertTables<"chat_messages"> = {
              session_id: currentSessionId,
              role: "assistant",
              content: fullResponse,
            };
            await supabase.from("chat_messages").insert(assistantMessagePayload);
          }

          // Send done signal
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                sessionId: currentSessionId,
              })}\n\n`
            )
          );
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

type ChatProvider = "openai" | "gemini";

function getChatProvider(): ChatProvider {
  const envProvider = process.env.AI_PROVIDER?.toLowerCase();
  if (envProvider === "gemini" || envProvider === "openai") {
    return envProvider;
  }
  return process.env.GOOGLE_GEMINI_API_KEY ? "gemini" : "openai";
}

type StreamOptions = {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  onChunk: (content: string) => void;
};

function isPlanRequest(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("plan d'entrainement") ||
    normalized.includes("plan d'entraînement") ||
    normalized.includes("plan d entrainement") ||
    normalized.includes("plan d'entrainement") ||
    normalized.includes("programme") ||
    normalized.includes("planning") ||
    /plan\s+pour\s+les\s+\d+/.test(normalized)
  );
}

async function generatePlanSuggestion({
  messages,
  userMessage,
  provider,
}: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  userMessage: string;
  provider: ChatProvider;
}) {
  const planMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: "system",
      content: PLAN_GENERATION_PROMPT,
    },
    {
      role: "user",
      content:
        userMessage +
        "\n\nTu dois répondre STRICTEMENT avec le JSON décrit ci-dessus.",
    },
  ];

  if (provider === "gemini") {
    return generatePlanWithGemini(planMessages);
  }

  return generatePlanWithOpenAI(planMessages);
}

async function generatePlanWithOpenAI(
  planMessages: OpenAI.Chat.ChatCompletionMessageParam[]
) {
  const response = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || "gpt-4o",
    messages: planMessages,
    temperature: 0.5,
    stream: false,
  });

  const content = response.choices[0]?.message?.content || "";
  return parsePlanContent(content);
}

async function generatePlanWithGemini(
  planMessages: OpenAI.Chat.ChatCompletionMessageParam[]
) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }
  const model = process.env.GOOGLE_GEMINI_MODEL || "gemini-1.5-flash";
  const payload = buildGeminiPayload(planMessages, {
    temperature: 0.4,
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini plan generation error (${response.status}): ${
        errorText || response.statusText
      }`
    );
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error.message || "Gemini API returned an error");
  }

  const candidate = data?.candidates?.[0];
  const content = extractGeminiText(candidate);
  if (!content) {
    console.error("Gemini plan response without text:", data);
    return null;
  }

  return parsePlanContent(content);
}

function parsePlanContent(content: string) {
  const jsonString = extractJsonBlock(content);
  if (!jsonString) {
    console.error("Plan JSON introuvable dans la réponse IA:", content);
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.weeks || !Array.isArray(parsed.weeks)) {
      throw new Error("Plan invalide");
    }
    const planId = randomUUID();
    return {
      plan: parsed,
      planId,
      summary: parsed.summary || "Voici un plan personnalisé pour toi 👇",
    };
  } catch (error) {
    console.error("Erreur parsing plan:", error, jsonString);
    return null;
  }
}

function extractJsonBlock(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function getPlanErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "insufficient_quota"
  ) {
    return "Je suis à court de crédit OpenAI pour générer un plan. Peux-tu réessayer plus tard ?";
  }
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: number }).status === 429
  ) {
    return "Je suis temporairement saturé. Réessaie dans quelques minutes pour que je génère ton plan.";
  }
  return "Un imprévu empêche la génération du plan. Reformule ta demande ou réessaie dans un instant.";
}

async function streamWithOpenAI({ messages, onChunk }: StreamOptions) {
  const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o";
  const maxTokens =
    Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) > 0
      ? Number(process.env.OPENAI_MAX_OUTPUT_TOKENS)
      : 1500;
  const stream = await getOpenAI().chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: maxTokens,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      onChunk(content);
    }
  }
}

async function streamWithGemini({ messages, onChunk }: StreamOptions) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }
  const model = process.env.GOOGLE_GEMINI_MODEL || "gemini-1.5-flash";
  const payload = buildGeminiPayload(messages);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API error (${response.status}): ${errorText || response.statusText}`
    );
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error.message || "Gemini API returned an error");
  }

  const candidate = data?.candidates?.[0];
  const text = extractGeminiText(candidate);
  if (!text) {
    throw new Error("Gemini API returned no text content");
  }
  onChunk(text);
}

function buildGeminiPayload(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: { temperature?: number; maxOutputTokens?: number }
) {
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  const systemParts: string[] = [];
  const maxTokensEnv = Number(process.env.GOOGLE_GEMINI_MAX_OUTPUT_TOKENS);
  const maxTokens =
    options?.maxOutputTokens ??
    (Number.isFinite(maxTokensEnv) && maxTokensEnv > 0 ? maxTokensEnv : 2048);
  const temperature =
    typeof options?.temperature === "number"
      ? options.temperature
      : 0.7;

  for (const message of messages) {
    const text = extractMessageText(message.content);
    if (!text) continue;

    if (message.role === "system") {
      systemParts.push(text);
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemParts.length > 0) {
    payload.systemInstruction = {
      role: "system",
      parts: [{ text: systemParts.join("\n\n") }],
    };
  }

  return payload;
}

function extractMessageText(
  content: OpenAI.Chat.ChatCompletionMessageParam["content"]
): string {
  if (!content) return "";
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function extractGeminiText(candidate: unknown): string | null {
  const parts =
    (Array.isArray((candidate as { content?: { parts?: unknown[] } })?.content?.parts)
      ? (candidate as { content?: { parts?: unknown[] } }).content?.parts
      : undefined) ||
    (Array.isArray((candidate as { content?: unknown[] })?.content)
      ? (candidate as { content?: unknown[] }).content
      : undefined) ||
    (Array.isArray((candidate as { parts?: unknown[] })?.parts)
      ? (candidate as { parts?: unknown[] }).parts
      : undefined) ||
    [];

  const textSegments: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string" && part.trim()) {
      textSegments.push(part);
      continue;
    }
    if (typeof part === "object") {
      const fnCall = (part as { functionCall?: { args?: unknown } }).functionCall;
      if (fnCall?.args) {
        const argsText =
          typeof fnCall.args === "string"
            ? fnCall.args
            : JSON.stringify(fnCall.args);
        if (argsText) {
          textSegments.push(argsText);
          continue;
        }
      }
      const textValue = (part as { text?: string }).text;
      if (typeof textValue === "string" && textValue.trim()) {
        textSegments.push(textValue.trim());
        continue;
      }
      const serialized = JSON.stringify(part);
      if (serialized && serialized !== "{}") {
        textSegments.push(serialized);
      }
    }
  }

  if (textSegments.length === 0) {
    const fallbackText =
      typeof (candidate as { text?: string })?.text === "string"
        ? (candidate as { text?: string }).text?.trim()
        : null;
    return fallbackText || null;
  }

  return textSegments.join("\n\n");
}

// Get chat history
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      // Get messages for specific session
      const { data: messages, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        return NextResponse.json(
          { error: "Failed to fetch messages" },
          { status: 500 }
        );
      }

      return NextResponse.json({ messages });
    } else {
      // Get all sessions
      const { data: sessions, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) {
        return NextResponse.json(
          { error: "Failed to fetch sessions" },
          { status: 500 }
        );
      }

      return NextResponse.json({ sessions });
    }
  } catch (error) {
    console.error("Chat GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
