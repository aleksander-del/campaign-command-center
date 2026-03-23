import { parse } from 'csv-parse/sync';
import { Lead } from './interface';

export function parseCsvLeads(csvContent: string, sourceName = 'csv-import'): Lead[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((r: any) => ({
    email: r.email || r.Email || r.work_email || r['Email Address'],
    first_name: r.first_name || r.firstName || r['First Name'] || r.name?.split(' ')[0],
    last_name: r.last_name || r.lastName || r['Last Name'] || r.name?.split(' ').slice(1).join(' '),
    company_name: r.company_name || r.company || r.Company || r['Company Name'] || r.organization,
    title: r.title || r.Title || r.job_title || r['Job Title'] || r.position,
    phone: r.phone || r.Phone || r.mobile,
    linkedin_url: r.linkedin_url || r.linkedin || r.LinkedIn || r['LinkedIn URL'],
    website: r.website || r.Website || r.domain,
    industry: r.industry || r.Industry,
    employee_count: parseInt(r.employee_count || r.employees || r['Company Size']) || undefined,
    location: r.location || r.Location || r.city || r.Country,
    source: sourceName,
  }));
}
