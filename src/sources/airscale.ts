import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

export class AirscaleSource implements LeadSource {
  name = 'airscale';
  private apiKey: string;
  private baseUrl = 'https://api.airscale.io/v1';

  constructor() {
    this.apiKey = process.env.AIRSCALE_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      const res = await fetch(`${this.baseUrl}/contacts/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.audience,
          company: query.company,
          location: query.location,
          industry: query.industry,
          per_page: query.limit || 50,
        }),
      });

      if (!res.ok) {
        logger.error(`Airscale API error: ${res.status} ${await res.text()}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.contacts || data.results || data.data || [];

      return results.map((r: any) => ({
        email: r.email || r.work_email,
        first_name: r.first_name || r.firstName,
        last_name: r.last_name || r.lastName,
        company_name: r.company_name || r.company,
        title: r.title || r.job_title,
        phone: r.phone,
        linkedin_url: r.linkedin_url || r.linkedin,
        website: r.website,
        industry: r.industry,
        employee_count: r.employee_count || r.company_size,
        location: r.location || r.country,
        source: 'airscale',
      }));
    } catch (err) {
      logger.error('Airscale search failed', { error: err });
      return [];
    }
  }
}
