/**
 * Job Description Formatter - beautifies raw job data for display
 * No AI needed - uses clean formatting rules
 */

export interface DisplayJob {
  id: string;
  title: string;
  title_amharic: string | null;
  company_name: string;
  categories: string[];
  employment_type: string | null;
  work_type: string | null;
  min_experience: number | null;
  max_experience: number | null;
  location: string | null;
  location_city: string | null;
  is_remote: boolean;
  salary_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description_html: string;
  requirements: string[];
  responsibilities: string[];
  how_to_apply: string | null;
  application_link: string | null;
  application_email: string | null;
  deadline: string | null;
  channel: string | null;
  posted_at: string | null;
  source_url: string | null;
  extraction_method: string | null;
}

/**
 * Take raw job data from DB and format it into beautiful display HTML
 */
export function formatJobForDisplay(
  job: Record<string, unknown>
): DisplayJob {
  // Parse JSON fields
  const requirements = safeParseArray(job.requirements_json ?? job.requirements);
  const responsibilities = safeParseArray(job.responsibilities_json ?? job.responsibilities);
  const categories = safeParseArray(job.job_categories_json ?? job.job_categories ?? []);
  
  const rawTitle = String(job.title ?? 'Untitled Position');
  const rawCompany = String(job.company_name ?? job.channel_username ?? 'Unknown Company');
  const rawDesc = String(job.description ?? '');
  
  // Build beautiful description HTML
  const description_html = buildDescriptionHtml(rawTitle, rawCompany, rawDesc, requirements);
  
  return {
    id: String(job.id ?? ''),
    title: rawTitle,
    title_amharic: String(job.title_amharic ?? '') || null,
    company_name: rawCompany,
    categories: categories.length > 0 ? categories : [String(job.job_category ?? 'other')],
    employment_type: String(job.employment_type ?? '') || null,
    work_type: String(job.work_type ?? '') || null,
    min_experience: safeParseInt(job.min_experience_years),
    max_experience: safeParseInt(job.max_experience_years),
    location: String(job.location ?? '') || null,
    location_city: String(job.location_city ?? '') || null,
    is_remote: job.is_remote === 1 || job.is_remote === true,
    salary_text: String(job.salary_text ?? '') || null,
    salary_min: safeParseInt(job.salary_min_etb),
    salary_max: safeParseInt(job.salary_max_etb),
    description_html,
    requirements,
    responsibilities,
    how_to_apply: String(job.how_to_apply ?? '') || null,
    application_link: String(job.application_link ?? '') || null,
    application_email: String(job.application_email ?? '') || null,
    deadline: String(job.deadline ?? '') || null,
    channel: String(job.channel_username ?? '') || null,
    posted_at: String(job.posted_at ?? '') || null,
    source_url: String(job.source_url ?? '') || null,
    extraction_method: String(job.extraction_method ?? 'telegram_only') || null,
  };
}

function buildDescriptionHtml(
  title: string,
  company: string,
  rawDesc: string,
  requirements: string[],
): string {
  // If we have a proper description, format it nicely
  if (rawDesc && rawDesc.length > 50) {
    // Split into paragraphs and format
    const paragraphs = rawDesc.split(/\n{2,}/).filter(Boolean);
    const html = paragraphs.map(p => {
      const cleaned = p.trim();
      if (!cleaned) return '';
      
      // Check if it's a labeled field
      const labelMatch = cleaned.match(/^([^:\n]{3,40}?):\s*(.+)$/s);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        const value = labelMatch[2].trim();
        return `<div class="mb-2"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
      }
      
      // Check for bullet list
      if (/^[•\-*●◆➤▪️]/.test(cleaned)) {
        const items = cleaned.split('\n').filter(l => l.trim()).map(l => 
          `<li>${escapeHtml(l.replace(/^[•\-*●◆➤▪️\s]+/, '').trim())}</li>`
        );
        return `<ul class="list-disc pl-5 space-y-1">${items.join('\n')}</ul>`;
      }
      
      return `<p class="mb-2 leading-relaxed">${escapeHtml(cleaned)}</p>`;
    }).filter(Boolean).join('\n');
    
    return html || `<p class="text-gray-700 leading-relaxed">${escapeHtml(rawDesc.slice(0, 2000))}</p>`;
  }
  
  // No proper description - build one from the title and company
  return `<p class="text-gray-700 leading-relaxed">
    <strong>${escapeHtml(title)}</strong> position at <strong>${escapeHtml(company)}</strong>.
    Click "Apply on Website" below for full job details and application instructions.
  </p>
  ${requirements.length > 0 ? `
  <div class="mt-3">
    <strong class="text-sm text-gray-600">Key Requirements:</strong>
    <ul class="list-disc pl-5 mt-1 space-y-1">
      ${requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('\n')}
    </ul>
  </div>` : ''}`;
}

function safeParseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string' && v.length > 0);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string' && v.length > 0);
    } catch { /* not JSON */ }
  }
  return [];
}

function safeParseInt(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
