import { Lead } from './interface';
import { logger } from '../logger';

export function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Map<string, Lead>();

  for (const lead of leads) {
    const key = lead.email?.toLowerCase() || `${lead.first_name}-${lead.last_name}-${lead.company_name}`.toLowerCase();
    if (!key || key === '--') continue;

    const existing = seen.get(key);
    if (existing) {
      // Merge: keep the most complete record
      seen.set(key, mergeLead(existing, lead));
    } else {
      seen.set(key, lead);
    }
  }

  const deduped = Array.from(seen.values());
  const removed = leads.length - deduped.length;
  if (removed > 0) {
    logger.info(`Deduplicated: ${leads.length} → ${deduped.length} (removed ${removed} duplicates)`);
  }
  return deduped;
}

function mergeLead(a: Lead, b: Lead): Lead {
  return {
    email: a.email || b.email,
    first_name: a.first_name || b.first_name,
    last_name: a.last_name || b.last_name,
    company_name: a.company_name || b.company_name,
    title: a.title || b.title,
    phone: a.phone || b.phone,
    linkedin_url: a.linkedin_url || b.linkedin_url,
    website: a.website || b.website,
    industry: a.industry || b.industry,
    employee_count: a.employee_count || b.employee_count,
    location: a.location || b.location,
    source: `${a.source}+${b.source}`,
  };
}
