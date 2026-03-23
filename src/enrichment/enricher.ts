import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';

const client = new Anthropic();

interface EnrichmentResult {
  industry?: string;
  employee_count?: number;
  website?: string;
  recent_news?: string;
  tech_stack?: string[];
  description?: string;
}

export async function enrichLead(lead: {
  company_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}): Promise<EnrichmentResult> {
  if (!lead.company_name) return {};

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Research this company and return ONLY valid JSON (no markdown):
Company: ${lead.company_name}
${lead.first_name ? `Contact: ${lead.first_name} ${lead.last_name || ''}, ${lead.title || ''}` : ''}

Return JSON with these fields (use null for unknown):
{
  "industry": "string",
  "employee_count": number,
  "website": "string",
  "recent_news": "string (one sentence about latest news/activity)",
  "tech_stack": ["string"],
  "description": "string (one sentence)"
}`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error('Enrichment failed', { company: lead.company_name, error: err });
    return {};
  }
}

export async function enrichLeadsBatch(leads: Array<{
  company_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}>): Promise<EnrichmentResult[]> {
  // Process in batches of 5 to avoid rate limits
  const results: EnrichmentResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(enrichLead));
    results.push(...batchResults);

    if (i + batchSize < leads.length) {
      await new Promise(r => setTimeout(r, 1000)); // Rate limit pause
    }
  }

  logger.info(`Enriched ${results.filter(r => r.industry || r.website).length}/${leads.length} leads`);
  return results;
}
