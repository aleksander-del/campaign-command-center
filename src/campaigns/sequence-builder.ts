import Anthropic from '@anthropic-ai/sdk';
import { Signal } from '../enrichment/signal-detector';
import { logger } from '../logger';

const client = new Anthropic();

export interface SequenceStep {
  step: number;
  day: number;
  channel: 'email';
  subject: string;
  body: string;
}

export async function buildSequence(lead: {
  first_name?: string;
  company_name?: string;
  title?: string;
  industry?: string;
}, signals: Signal[], hook: string, senderCompany: string, senderName: string): Promise<SequenceStep[]> {
  try {
    const signalContext = signals.map(s => `${s.type}: ${s.detail} → Angle: ${s.recommended_angle}`).join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Build a 4-email cold outreach sequence. Return ONLY a JSON array (no markdown).

Sender: ${senderName} at ${senderCompany}
Recipient: ${lead.first_name || 'there'} at ${lead.company_name || 'Company'}
Title: ${lead.title || 'Decision maker'}
Industry: ${lead.industry || 'unknown'}
Opening hook: ${hook}
Signals:
${signalContext || 'No specific signals'}

Sequence structure:
- Email 1 (Day 0): Hook + value prop + soft CTA (50-80 words)
- Email 2 (Day 3): New angle, reference a pain point (50-80 words)
- Email 3 (Day 7): Case study or social proof (50-80 words)
- Email 4 (Day 14): Breakup email, final CTA (30-50 words)

Return JSON array:
[{"step":1,"day":0,"channel":"email","subject":"subject line","body":"email body with {{first_name}} merge tags"}]`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return getDefaultSequence(lead, hook, senderCompany, senderName);

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error('Sequence building failed', { company: lead.company_name, error: err });
    return getDefaultSequence(lead, hook, senderCompany, senderName);
  }
}

function getDefaultSequence(lead: any, hook: string, company: string, sender: string): SequenceStep[] {
  const name = lead.first_name || 'there';
  return [
    { step: 1, day: 0, channel: 'email', subject: `Quick question for ${lead.company_name || 'you'}`, body: `Hi ${name},\n\n${hook}\n\nWould love to share how ${company} helps companies like yours. Open to a quick chat?\n\nBest,\n${sender}` },
    { step: 2, day: 3, channel: 'email', subject: `Re: Quick question`, body: `Hi ${name},\n\nFollowing up — I know you're busy. One thing we keep hearing from ${lead.industry || 'your industry'} is how hard it is to scale outbound effectively.\n\nHappy to share what's working. Worth 15 minutes?\n\n${sender}` },
    { step: 3, day: 7, channel: 'email', subject: `Thought this might help`, body: `Hi ${name},\n\nJust helped a similar company cut their outbound costs by 40% while doubling reply rates.\n\nWant me to send over the details?\n\n${sender}` },
    { step: 4, day: 14, channel: 'email', subject: `Closing the loop`, body: `Hi ${name},\n\nI'll take the hint if the timing isn't right. But if things change, I'd love to connect.\n\nAll the best,\n${sender}` },
  ];
}

export async function buildSequencesBatch(
  leads: Array<{ first_name?: string; company_name?: string; title?: string; industry?: string }>,
  signalsByIndex: Signal[][],
  hooks: string[],
  senderCompany: string,
  senderName: string,
): Promise<SequenceStep[][]> {
  const results: SequenceStep[][] = [];
  const batchSize = 3;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const seqs = await Promise.all(
      batch.map((lead, j) => buildSequence(lead, signalsByIndex[i + j] || [], hooks[i + j] || '', senderCompany, senderName))
    );
    results.push(...seqs);
    if (i + batchSize < leads.length) await new Promise(r => setTimeout(r, 1000));
  }

  logger.info(`Built ${results.length} sequences`);
  return results;
}
