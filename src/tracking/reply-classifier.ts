import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';

const client = new Anthropic();

export type ReplyCategory = 'interested' | 'objection' | 'not_interested' | 'out_of_office' | 'auto_reply' | 'bounced' | 'unrelated';

export interface ClassifiedReply {
  email: string;
  category: ReplyCategory;
  sentiment: 'positive' | 'neutral' | 'negative';
  next_action: string;
  summary: string;
}

export async function classifyReplies(replies: Array<{ email: string; body: string }>): Promise<ClassifiedReply[]> {
  if (replies.length === 0) return [];

  try {
    const repliesText = replies.map((r, i) => `[${i}] From: ${r.email}\n${r.body}`).join('\n---\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Classify these email replies. Return ONLY a JSON array (no markdown).

${repliesText}

Categories: interested, objection, not_interested, out_of_office, auto_reply, bounced, unrelated
Sentiment: positive, neutral, negative

Return:
[{"email":"...","category":"interested","sentiment":"positive","next_action":"Book a call within 24h","summary":"Wants to learn more about pricing"}]`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error('Reply classification failed', { error: err });
    return [];
  }
}
