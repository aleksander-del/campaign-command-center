import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';

const client = new Anthropic();

export interface Signal {
  type: 'HIRING' | 'FUNDING' | 'TECHNOLOGY' | 'GROWTH' | 'PAIN' | 'LEADERSHIP' | 'PARTNERSHIP' | 'EXPANSION';
  strength: 'HIGH' | 'MEDIUM' | 'LOW';
  detail: string;
  recommended_angle: string;
}

export async function detectSignals(lead: {
  company_name?: string;
  industry?: string;
  recent_news?: string;
  enrichment_data?: any;
}): Promise<Signal[]> {
  if (!lead.company_name) return [];

  try {
    const context = [
      `Company: ${lead.company_name}`,
      lead.industry ? `Industry: ${lead.industry}` : '',
      lead.recent_news ? `Recent news: ${lead.recent_news}` : '',
      lead.enrichment_data?.description ? `Description: ${lead.enrichment_data.description}` : '',
    ].filter(Boolean).join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analyze this company for buying signals. Return ONLY a JSON array (no markdown).

${context}

Signal types: HIRING, FUNDING, TECHNOLOGY, GROWTH, PAIN, LEADERSHIP, PARTNERSHIP, EXPANSION
Strength: HIGH (recent, specific, actionable), MEDIUM (somewhat recent), LOW (general)

Return JSON array:
[{"type": "HIRING", "strength": "HIGH", "detail": "specific detail", "recommended_angle": "how to leverage this signal"}]

If no signals found, return [].`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error('Signal detection failed', { company: lead.company_name, error: err });
    return [];
  }
}
