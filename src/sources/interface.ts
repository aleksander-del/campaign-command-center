export interface Lead {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  title?: string;
  phone?: string;
  linkedin_url?: string;
  website?: string;
  industry?: string;
  employee_count?: number;
  location?: string;
  source: string;
}

export interface LeadQuery {
  company: string;
  audience: string;
  location?: string;
  industry?: string;
  limit?: number;
  icp_config?: {
    industries?: string[];
    locations?: string[];
    target_titles?: string[];
    company_size?: string;
    [key: string]: any;
  };
}

export interface LeadSource {
  name: string;
  isConfigured(): boolean;
  findLeads(query: LeadQuery): Promise<Lead[]>;
}
