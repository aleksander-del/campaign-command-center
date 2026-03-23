import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

// Company size mapping for A-leads API
// 1: 1-10, 2: 11-20, 3: 21-50, 4: 51-100, 5: 101-200,
// 6: 201-500, 7: 501-1000, 8: 1001-5000, 9: 5001-10000, 10: 10001+
function parseCompanySizes(audience: string): number[] {
  const lower = audience.toLowerCase();
  if (lower.includes('1-10') || lower.includes('startup')) return [1];
  if (lower.includes('5-50') || lower.includes('small')) return [1, 2, 3];
  if (lower.includes('10-50')) return [2, 3];
  if (lower.includes('50-200') || lower.includes('mid')) return [4, 5];
  if (lower.includes('200-500')) return [6];
  if (lower.includes('500-1000')) return [7];
  if (lower.includes('enterprise') || lower.includes('1000+')) return [8, 9, 10];
  return []; // No size filter
}

function parseTitles(audience: string): string[] {
  const titles: string[] = [];
  const lower = audience.toLowerCase();

  // Extract role keywords from audience description
  const roleKeywords = [
    'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'VP', 'Director', 'Manager',
    'Head of', 'Owner', 'Founder', 'Partner', 'President',
    'Sales', 'Marketing', 'Engineering', 'Operations', 'Finance',
    'Dealer', 'Principal', 'General Manager',
  ];

  for (const role of roleKeywords) {
    if (lower.includes(role.toLowerCase())) {
      titles.push(role);
    }
  }

  // If no specific titles found, use common decision-maker titles
  if (titles.length === 0) {
    titles.push('Owner', 'CEO', 'Founder', 'General Manager', 'Director');
  }

  return titles;
}

export class ALeadsSource implements LeadSource {
  name = 'a-leads';
  private apiKey: string;
  private baseUrl = 'https://api.a-leads.co/gateway/v1';

  constructor() {
    this.apiKey = process.env.A_LEADS_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      const titles = parseTitles(query.audience);
      const companySizes = parseCompanySizes(query.audience);

      const advancedFilters: Record<string, any> = {
        job_title: titles,
      };

      // Add location if provided or parse from audience
      if (query.location) {
        advancedFilters.member_location_raw_address = [query.location];
      } else {
        // Try to extract location from audience text
        const locationMatch = query.audience.match(/\bin\s+([A-Z][a-zA-Z\s]+?)(?:\s+\d|\s*$)/);
        if (locationMatch) {
          advancedFilters.member_location_raw_address = [locationMatch[1].trim()];
        }
      }

      // Add company domain if company looks like a domain
      if (query.company.includes('.')) {
        advancedFilters.bulk_domains = query.company;
      }

      if (companySizes.length > 0) {
        advancedFilters.mapped_company_size = companySizes;
      }

      // Add industry keywords if present
      if (query.industry) {
        advancedFilters.company_industry = [query.industry];
      }

      const res = await fetch(`${this.baseUrl}/search/advanced-search`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          advanced_filters: advancedFilters,
          current_page: 0,
          search_type: 'total',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`A-leads API error: ${res.status} ${text.slice(0, 200)}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.data || [];

      logger.info(`A-leads returned ${results.length} leads (total: ${data.meta_data?.total_count || 'unknown'})`);

      return results.slice(0, query.limit || 50).map((r: any) => ({
        email: r.email || r.work_email,
        first_name: r.member_full_name?.split(' ')[0],
        last_name: r.member_full_name?.split(' ').slice(1).join(' '),
        company_name: r.company_name,
        title: r.job_title,
        phone: r.phone_number,
        linkedin_url: r.member_linkedin_url,
        website: r.domain,
        industry: r.industry,
        employee_count: undefined,
        location: r.hq_full_address || r.member_location,
        source: 'a-leads',
      }));
    } catch (err) {
      logger.error('A-leads search failed', { error: err });
      return [];
    }
  }
}
