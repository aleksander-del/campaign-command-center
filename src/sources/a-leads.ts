import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

// Company size mapping for A-leads API
// 1: 1-10, 2: 11-20, 3: 21-50, 4: 51-100, 5: 101-200,
// 6: 201-500, 7: 501-1000, 8: 1001-5000, 9: 5001-10000, 10: 10001+
function parseCompanySizes(text: string): number[] {
  const lower = text.toLowerCase();
  if (lower.includes('50-1000') || lower.includes('50–1,000') || lower.includes('50–1000')) return [4, 5, 6, 7];
  if (lower.includes('1-10') || lower.includes('startup')) return [1];
  if (lower.includes('5-50') || lower.includes('small')) return [1, 2, 3];
  if (lower.includes('10-50')) return [2, 3];
  if (lower.includes('50-200') || lower.includes('mid')) return [4, 5];
  if (lower.includes('200-500')) return [6];
  if (lower.includes('500-1000')) return [7];
  if (lower.includes('enterprise') || lower.includes('1000+')) return [8, 9, 10];
  return [];
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
      const icp = query.icp_config;
      const advancedFilters: Record<string, any> = {};

      // Use ICP config titles if available, otherwise parse from audience
      if (icp?.target_titles && icp.target_titles.length > 0) {
        advancedFilters.job_title = icp.target_titles;
      } else {
        advancedFilters.job_title = ['Owner', 'CEO', 'Founder', 'General Manager', 'Director', 'VP Operations'];
      }

      // Use ICP config locations if available
      if (icp?.locations && icp.locations.length > 0) {
        advancedFilters.member_location_raw_address = icp.locations;
      } else if (query.location) {
        advancedFilters.member_location_raw_address = [query.location];
      } else {
        // Try to extract "in <Location>" from audience
        const match = query.audience.match(/\bin\s+(USA|United States|US|[A-Z][a-zA-Z\s]+?)(?:\s+with|\s*$)/i);
        if (match) {
          advancedFilters.member_location_raw_address = [match[1].trim()];
        }
      }

      // Use ICP config industries if available
      if (icp?.industries && icp.industries.length > 0) {
        advancedFilters.company_industry = icp.industries;
      } else if (query.industry) {
        advancedFilters.company_industry = [query.industry];
      }

      // Company size from ICP config or audience text
      const sizeText = icp?.company_size || query.audience;
      const companySizes = parseCompanySizes(sizeText);
      if (companySizes.length > 0) {
        advancedFilters.mapped_company_size = companySizes;
      }

      // Company domain if applicable
      if (query.company.includes('.')) {
        advancedFilters.bulk_domains = query.company;
      }

      logger.info(`A-leads search filters: ${JSON.stringify(advancedFilters)}`);

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
        logger.error(`A-leads API error: ${res.status} ${text.slice(0, 500)}`);
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
