import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

export class ALeadsSource implements LeadSource {
  name = 'a-leads';
  private apiKey: string;
  private baseUrl = 'https://api.a-leads.co/v1';

  constructor() {
    this.apiKey = process.env.A_LEADS_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${query.audience} at ${query.company}`,
          location: query.location,
          industry: query.industry,
          limit: query.limit || 50,
        }),
      });

      if (!res.ok) {
        logger.error(`A-leads API error: ${res.status} ${await res.text()}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.results || data.leads || data.data || [];

      return results.map((r: any) => ({
        email: r.email || r.work_email,
        first_name: r.first_name || r.firstName,
        last_name: r.last_name || r.lastName,
        company_name: r.company_name || r.company || r.organization,
        title: r.title || r.job_title || r.position,
        phone: r.phone || r.mobile,
        linkedin_url: r.linkedin_url || r.linkedin,
        website: r.website || r.company_website,
        industry: r.industry,
        employee_count: r.employee_count || r.employees,
        location: r.location || r.city,
        source: 'a-leads',
      }));
    } catch (err) {
      logger.error('A-leads search failed', { error: err });
      return [];
    }
  }
}
