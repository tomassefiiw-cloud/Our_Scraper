/**
 * Quick sanity test for the rule-based extractor.
 * Run: npx tsx scripts/test-rule-extractor.ts
 */
import { extractJobsRuleBased } from '../lib/rule-extractor';

const samples: Array<{ channel: string; text: string; links: string[] }> = [
  {
    channel: 'elelanajobs',
    text: `Senior Software Engineer at Awash Bank
Deadline: July 30, 2026
Location: Addis Ababa, Bole
Requirements:
- 5+ years of experience in Java
- Bachelor's degree in Computer Science
- Strong communication skills
How to Apply:
Send your CV to hr@awashbank.com or apply at https://awashbank.com/careers`,
    links: ['https://awashbank.com/careers'],
  },
  {
    channel: 'Maroset',
    text: `Job Title: Full Stack Developer
Company: Gebeya Inc.
Location: Remote
Employment: Full-time
Salary: 50,000 - 80,000 ETB
Deadline: June 25, 2026
Requirements:
- 3-5 years experience with React + Node.js
- Experience with PostgreSQL
- Excellent English communication
How to Apply:
Apply at https://gebeya.com/jobs/fsd-2026`,
    links: ['https://gebeya.com/jobs/fsd-2026'],
  },
  {
    channel: 'hahujobs',
    text: `Data Analyst
#ethiopian_airlines
#data
#Addis_Ababa
#fulltime
Quantity Required: 2
Minimum Years Of Experience: 2
Maximum Years Of Experience: 5
Deadline: July 15, 2026
How To Apply: Click the apply button below`,
    links: [],
  },
  {
    channel: 'elelanajobs',
    text: `Kerchanshe Trading Job Vacancy
1. Senior Accountant
2. Junior Accountant
3. Internal Auditor
4. Branch Manager
Find More Details here: https://kerchanshe.com/jobs
Deadline: July 20, 2026`,
    links: ['https://kerchanshe.com/jobs'],
  },
];

for (const s of samples) {
  console.log(`\n=== ${s.channel} ===`);
  console.log('--- message ---');
  console.log(s.text);
  console.log('--- extracted ---');
  const jobs = extractJobsRuleBased(s.text, s.links, s.channel);
  console.log(`Found ${jobs.length} job(s):`);
  for (const j of jobs) {
    console.log(JSON.stringify({
      title: j.title,
      company: j.company_name,
      category: j.job_category,
      location: j.location,
      location_city: j.location_city,
      location_area: j.location_area,
      employment_type: j.employment_type,
      work_type: j.work_type,
      is_remote: j.is_remote,
      min_exp: j.min_experience_years,
      max_exp: j.max_experience_years,
      salary: j.salary_text,
      deadline: j.deadline,
      application_link: j.application_link,
      application_email: j.application_email,
      requirements_count: j.requirements.length,
      confidence: j.confidence,
    }, null, 2));
  }
}
