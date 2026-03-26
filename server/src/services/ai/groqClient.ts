const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "llama-3.1-8b-instant";

type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function isGroqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export async function groqChat(messages: GroqMessage[], options?: { temperature?: number; maxTokens?: number }) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 800,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq error ${response.status}: ${errText}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content?.trim() || "";
}

