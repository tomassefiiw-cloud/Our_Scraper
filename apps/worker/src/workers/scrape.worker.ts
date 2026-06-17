/**
 * Scrape worker — consumes the 'scrape' queue, runs the pipeline, then enqueues
 * follow-up 'notify' jobs for matching users.
 */
import { prisma } from '@tja/db';
import { FilterEngine } from '@tja/filter';
import { makeWorker, notifyQueue } from './queues.js';
import { scrapeChannel } from './pipeline.js';

const filter = new FilterEngine();

export const scrapeWorker = makeWorker<{ channelId: string; username: string }>(
  'scrape',
  async (job) => {
    console.log(`[scrape-worker] processing ${job.data.username} (job ${job.id})`);
    const result = await scrapeChannel(job.data.channelId, job.data.username);
    console.log(
      `[scrape-worker] done ${job.data.username}: new=${result.messagesNew} jobs=${result.jobsExtracted} dupes=${result.jobsDuplicates} errors=${result.errors.length}`,
    );

    // After scrape, find users whose prefs match the freshly-extracted jobs and
    // enqueue notifications. We look at jobs scraped in the last 5 minutes.
    const recentJobs = await prisma.job.findMany({
      where: { scrapedAt: { gt: new Date(Date.now() - 5 * 60 * 1000) }, isClosed: false },
    });
    const users = await prisma.user.findMany({
      where: { isActive: true },
      include: { preferences: true },
    });
    for (const user of users) {
      if (!user.preferences) continue;
      for (const j of recentJobs) {
        const domainJob = {
          id: j.id,
          title: j.title,
          titleAmharic: j.titleAmharic,
          companyName: j.companyName,
          companyNameAmharic: j.companyNameAmharic,
          jobCategory: j.jobCategory,
          employmentType: j.employmentType,
          workType: j.workType,
          minExperienceYears: j.minExperienceYears,
          maxExperienceYears: j.maxExperienceYears,
          experienceText: j.experienceText,
          location: j.location,
          locationCity: j.locationCity,
          locationArea: j.locationArea,
          isRemote: j.isRemote,
          salaryText: j.salaryText,
          salaryMinEtb: j.salaryMinEtb,
          salaryMaxEtb: j.salaryMaxEtb,
          description: j.description,
          requirements: j.requirements,
          responsibilities: j.responsibilities,
          howToApply: j.howToApply,
          applicationLink: j.applicationLink,
          applicationEmail: j.applicationEmail,
          deadline: j.deadline,
          isClosed: j.isClosed,
          isExpired: j.isExpired,
          isVague: j.isVague,
          aiConfidence: j.aiConfidence ? Number(j.aiConfidence) : 0,
          extractionMethod: j.extractionMethod,
          sourceUrl: j.sourceUrl,
          deepExtractedUrl: j.deepExtractedUrl,
          aiProviderUsed: j.aiProviderUsed,
          duplicateGroupId: j.duplicateGroupId,
          isPrimary: j.isPrimary,
          rawMessageId: j.rawMessageId ?? '',
          channelId: j.channelId,
          postedAt: j.postedAt,
          scrapedAt: j.scrapedAt,
          expiresAt: j.expiresAt,
        } as never;
        const prefs = {
          min_experience_years: user.preferences.minExperienceYears,
          max_experience_years: user.preferences.maxExperienceYears,
          job_categories: user.preferences.jobCategories as never,
          locations: user.preferences.locations,
          addis_ababa_areas: user.preferences.addisAbabaAreas,
          work_types: user.preferences.workTypes as never,
          employment_types: user.preferences.employmentTypes as never,
          exclude_keywords: user.preferences.excludeKeywords,
          min_salary_etb: user.preferences.minSalaryEtb,
          max_salary_etb: user.preferences.maxSalaryEtb,
          notify_push: user.preferences.notifyPush,
          notify_email: user.preferences.notifyEmail,
          purge_after_days: user.preferences.purgeAfterDays,
        } as never;
        if (filter.matches(domainJob, prefs) && user.preferences.notifyPush) {
          await notifyQueue.add(
            'notify',
            { userId: user.id, jobId: j.id, title: j.title, company: j.companyName },
            { jobId: `${user.id}-${j.id}` },
          );
        }
      }
    }
    return result;
  },
  { concurrency: 2 },
);
