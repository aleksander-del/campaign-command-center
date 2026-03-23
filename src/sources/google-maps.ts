import { LeadSource, Lead, LeadQuery } from './interface';
import { logger } from '../logger';

export class GoogleMapsSource implements LeadSource {
  name = 'google-maps';
  // Uses the google-maps-scraper REST API if deployed, otherwise skips
  private scraperUrl = process.env.GOOGLE_MAPS_SCRAPER_URL || '';

  isConfigured(): boolean {
    return !!this.scraperUrl;
  }

  async findLeads(query: LeadQuery): Promise<Lead[]> {
    if (!this.isConfigured()) return [];

    try {
      const searchQuery = `${query.audience} in ${query.location || 'Norway'}`;
      const res = await fetch(`${this.scraperUrl}/api/v1/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          max_results: query.limit || 50,
          extract_emails: true,
        }),
      });

      if (!res.ok) {
        logger.error(`Google Maps scraper error: ${res.status}`);
        return [];
      }

      const data = await res.json() as any;
      const results = data.results || data.places || [];

      return results.map((r: any) => ({
        email: r.email,
        company_name: r.name || r.title,
        phone: r.phone,
        website: r.website,
        location: r.address || r.full_address,
        industry: r.category || r.main_category,
        source: 'google-maps',
      }));
    } catch (err) {
      logger.error('Google Maps scraper failed', { error: err });
      return [];
    }
  }
}
