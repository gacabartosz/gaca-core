// Convert messages array format to prompt + systemPrompt for gaca-core engine

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function convertMessages(
  messages: ChatMessage[],
  existingSystemPrompt?: string,
): { prompt: string; systemPrompt?: string } {
  const systemMsg = messages.find((m) => m.role === 'system');
  const systemPrompt = existingSystemPrompt || systemMsg?.content;
  const others = messages.filter((m) => m.role !== 'system');

  const prompt =
    others.length === 1 && others[0].role === 'user'
      ? others[0].content
      : others.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n\n');

  return { prompt, systemPrompt };
}
