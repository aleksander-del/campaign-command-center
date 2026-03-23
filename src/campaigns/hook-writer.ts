import Anthropic from '@anthropic-ai/sdk';
import { Signal } from '../enrichment/signal-detector';
import { logger } from '../logger';

const client = new Anthropic();

export async function writeHook(lead: {
  first_name?: string;
  company_name?: string;
  title?: string;
  industry?: string;
}, signals: Signal[], company: string): Promise<string> {
  try {
    const signalContext = signals.length > 0
      ? `Signals: ${signals.map(s => `${s.type}: ${s.detail}`).join('; ')}`
      : 'No specific signals detected.';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Write a cold email opening line (max 120 characters) for:
Sender company: ${company}
Recipient: ${lead.first_name || 'there'} at ${lead.company_name || 'their company'}
Title: ${lead.title || 'unknown'}
${signalContext}

Rules:
- Max 120 characters
- No "I saw", "Congrats", "Hope you're well", "I noticed"
- Reference a specific signal or pain point
- Be direct and specific
- Return ONLY the opening line, nothing else.`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return text.slice(0, 120);
  } catch (err) {
    logger.error('Hook writing failed', { company: lead.company_name, error: err });
    return `Quick question about ${lead.company_name || 'your'} growth plans`;
  }
}

export async function writeHooksBatch(
  leads: Array<{ first_name?: string; company_name?: string; title?: string; industry?: string }>,
  signalsByIndex: Signal[][],
  senderCompany: string,
): Promise<string[]> {
  const results: string[] = [];
  const batchSize = 5;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const hooks = await Promise.all(
      batch.map((lead, j) => writeHook(lead, signalsByIndex[i + j] || [], senderCompany))
    );
    results.push(...hooks);
    if (i + batchSize < leads.length) await new Promise(r => setTimeout(r, 500));
  }

  logger.info(`Generated ${results.length} hooks`);
  return results;
}
