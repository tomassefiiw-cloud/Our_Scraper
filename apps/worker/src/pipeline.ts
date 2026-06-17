/**
 * Pipeline orchestration helpers — shared between worker and scrape-once.
 *
 * Implements the doc §8.1 flow:
 *   scrape → store raw_messages → enqueue extract → AI extract →
 *   (if links) enqueue deeplink → merge deep-link data →
 *   deduplicate → match user prefs → enqueue notifications
 */
import { prisma } from '@tja/db';
import {
  AIExtractor,
  type AIExtractor as AIExtractorType,
} from '@tja/ai-router';
import { TelegramScraper, DeepLinkNavigator } from '@tja/scraper';
import { DeduplicationEngine } from '@tja/dedup';
import { FilterEngine } from '@tja/filter';
import { getChannelConfig } from '@tja/shared';
import type { ChannelConfig, ExtractedJob, RawTelegramMessage } from '@tja/shared';

const scraper = new TelegramScraper();
const dedup = new DeduplicationEngine();
const filter = new FilterEngine();
let navigatorInstance: DeepLinkNavigator | null = null;
function getNavigator(): DeepLinkNavigator {
  if (!navigatorInstance) navigatorInstance = new DeepLinkNavigator();
  return navigatorInstance;
}

export interface ScrapeResult {
  channel: string;
  messagesFound: number;
  messagesNew: number;
  jobsExtracted: number;
  jobsDuplicates: number;
  errors: string[];
}

/**
 * Scrape one channel and enqueue follow-up work.
 */
export async function scrapeChannel(channelId: string, username: string): Promise<ScrapeResult> {
  const config = getChannelConfig(username);
  const result: ScrapeResult = {
    channel: username,
    messagesFound: 0,
    messagesNew: 0,
    jobsExtracted: 0,
    jobsDuplicates: 0,
    errors: [],
  };

  if (!config) {
    result.errors.push(`No channel config found for ${username}`);
    return result;
  }

  const log = await prisma.scrapeLog.create({
    data: { channelId, status: 'running' },
  });

  try {
    // 1. Scrape
    const messages = await scraper.scrapeChannel(username, config.fetchLimit);
    result.messagesFound = messages.length;

    // 2. Filter by lookback + skip patterns
    const cutoff = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000);
    const fresh = messages.filter((m) => {
      if (m.postedAt && m.postedAt < cutoff) return false;
      const text = m.message_text ?? '';
      if (config.skipPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()))) return false;
      return true;
    });

    // 3. Persist raw_messages (skip already-seen by unique constraint)
    let newCount = 0;
    for (const msg of fresh) {
      try {
        await prisma.rawMessage.create({
          data: {
            channelId,
            telegramMsgId: BigInt(msg.telegram_msg_id),
            messageText: msg.message_text,
            messageHtml: msg.message_html,
            postedAt: msg.posted_at,
            views: msg.views,
            extractedLinks: msg.extracted_links.map((l) => l.url),
            status: 'pending',
          },
        });
        newCount++;
      } catch (err) {
        // Unique constraint violation = already scraped; skip silently
        if (!(err as Error).message.includes('Unique')) {
          result.errors.push(`raw_message persist: ${(err as Error).message}`);
        }
      }
    }
    result.messagesNew = newCount;

    // 4. Fetch pending messages and extract jobs
    const pending = await prisma.rawMessage.findMany({
      where: { channelId, status: 'pending' },
      orderBy: { postedAt: 'asc' },
    });

    // Load AI extractor with system + user provider configs
    const providerConfigs = await prisma.aiProviderConfig.findMany({
      where: { isActive: true, OR: [{ userId: null }] },
    });
    if (providerConfigs.length === 0) {
      result.errors.push('No AI provider configured — skipping extraction');
      throw new Error('No AI provider configured');
    }
    const extractor: AIExtractorType = new AIExtractor(
      providerConfigs.map((c) => ({
        provider_name: c.providerName as never,
        api_key: c.apiKey ?? undefined,
        api_base_url: c.apiBaseUrl ?? undefined,
        model_name: c.modelName,
        is_active: c.isActive,
        priority: c.priority,
        rate_limit_rpm: c.rateLimitRpm,
        daily_quota: c.dailyQuota,
        current_usage: c.currentUsage,
        is_local: c.isLocal,
        ollama_url: c.ollamaUrl ?? undefined,
      })),
    );

    for (const raw of pending) {
      try {
        const extracted = await extractFromRaw(raw.id, channelId, raw.messageText ?? '', raw.extractedLinks, config, extractor);

        // Mark raw as extracted
        await prisma.rawMessage.update({
          where: { id: raw.id },
          data: { status: 'extracted' },
        });

        if (extracted.length === 0) continue;

        // Deduplicate against recent existing jobs for this channel + cross-channel
        const recentJobs = await prisma.job.findMany({
          where: { postedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          take: 500,
        });
        const mappedRecent = recentJobs.map(mapPrismaJobToDomain);
        const mappedNew = extracted.map((e) => mapExtractedToDomain(e, raw.id, channelId, raw.postedAt, raw.extractedLinks[0] ?? null));

        const dupes = await dedup.deduplicate(mappedNew, mappedRecent);
        const dupeSet = new Set(dupes.map((d) => d.newJob.id));
        result.jobsDuplicates += dupes.length;

        // Persist non-duplicates
        for (const job of mappedNew) {
          if (dupeSet.has(job.id)) continue;
          await persistJob(job, raw.id, channelId);
          result.jobsExtracted++;
        }
      } catch (err) {
        result.errors.push(`extract raw ${raw.id}: ${(err as Error).message}`);
        await prisma.rawMessage.update({
          where: { id: raw.id },
          data: { status: 'failed' },
        }).catch(() => undefined);
      }
    }

    // 5. Update channel metadata
    await prisma.channel.update({
      where: { id: channelId },
      data: { lastScrapedAt: new Date(), errorCount: 0, lastError: null },
    });

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        endedAt: new Date(),
        status: 'completed',
        messagesFound: result.messagesFound,
        messagesNew: result.messagesNew,
        jobsExtracted: result.jobsExtracted,
        jobsDuplicates: result.jobsDuplicates,
        errors: result.errors,
      },
    });
  } catch (err) {
    result.errors.push((err as Error).message);
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        lastScrapedAt: new Date(),
        errorCount: { increment: 1 },
        lastError: (err as Error).message.slice(0, 500),
      },
    }).catch(() => undefined);
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: { endedAt: new Date(), status: 'failed', errors: result.errors },
    }).catch(() => undefined);
  }

  return result;
}

/**
 * Run AI extraction on a raw message; optionally follow deep links.
 */
async function extractFromRaw(
  rawId: string,
  channelId: string,
  messageText: string,
  links: string[],
  config: ChannelConfig,
  extractor: AIExtractorType,
): Promise<ExtractedJob[]> {
  const linksArr = links.map((url) => ({ url, text: '' }));
  const extracted = await extractor.extractJobs(
    { message_text: messageText, extracted_links: linksArr },
    config,
  );

  let jobs = extracted.jobs;

  // Deep-link extraction if required and links present
  if (config.deepLinkFollow !== 'none' && links.length > 0 && jobs.length > 0) {
    const nav = getNavigator();
    const deepUrl = links[0];
    const deepResult = await nav.extractFromDeepLink(deepUrl);

    if (deepResult.success && deepResult.jobs.length > 0) {
      // Merge: prefer deep-link data for description/requirements, keep telegram title/company
      jobs = jobs.map((tj, i) => {
        const dj = deepResult.jobs[i] ?? deepResult.jobs[0] ?? {};
        return {
          ...tj,
          description: dj.description ?? tj.description,
          requirements: dj.requirements?.length ? dj.requirements : tj.requirements,
          responsibilities: dj.responsibilities?.length ? dj.responsibilities : tj.responsibilities,
          application_link: dj.application_link ?? tj.application_link,
          application_email: dj.application_email ?? tj.application_email,
          deadline: dj.deadline ?? tj.deadline,
          salary_text: dj.salary_text ?? tj.salary_text,
          confidence: Math.min(1, (tj.confidence ?? 0.5) + 0.2),
        };
      });
    }
    // Track extraction method on first job for logging
    if (jobs[0]) {
      (jobs[0] as ExtractedJob & { _extractionMethod?: string })._extractionMethod = deepResult.fallback
        ? 'deep_link_failed_fallback'
        : 'deep_link';
    }
  }

  return jobs;
}

// --- Mapping helpers ------------------------------------------------------

interface DomainJob {
  id: string;
  title: string | null;
  titleAmharic: string | null;
  companyName: string | null;
  companyNameAmharic: string | null;
  jobCategory: string | null;
  employmentType: string | null;
  workType: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  experienceText: string | null;
  location: string | null;
  locationCity: string | null;
  locationArea: string | null;
  isRemote: boolean;
  salaryText: string | null;
  salaryMinEtb: number | null;
  salaryMaxEtb: number | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  howToApply: string | null;
  applicationLink: string | null;
  applicationEmail: string | null;
  deadline: string | null;
  isClosed: boolean;
  isVague: boolean;
  confidence: number;
  sourceUrl: string | null;
  deepExtractedUrl: string | null;
  aiProviderUsed: string | null;
  extractionMethod: string;
  rawMessageId: string;
  channelId: string;
  postedAt: Date | null;
}

function mapExtractedToDomain(
  e: ExtractedJob,
  rawId: string,
  channelId: string,
  postedAt: Date | null,
  sourceUrl: string | null,
): DomainJob {
  return {
    id: crypto.randomUUID(),
    title: e.title,
    titleAmharic: e.title_amharic,
    companyName: e.company_name,
    companyNameAmharic: e.company_name_amharic,
    jobCategory: e.job_category,
    employmentType: e.employment_type,
    workType: e.work_type,
    minExperienceYears: e.min_experience_years,
    maxExperienceYears: e.max_experience_years,
    experienceText: e.experience_text,
    location: e.location,
    locationCity: e.location_city,
    locationArea: e.location_area,
    isRemote: e.is_remote,
    salaryText: e.salary_text,
    salaryMinEtb: e.salary_min_etb,
    salaryMaxEtb: e.salary_max_etb,
    description: e.description,
    requirements: e.requirements,
    responsibilities: e.responsibilities,
    howToApply: e.how_to_apply,
    applicationLink: e.application_link,
    applicationEmail: e.application_email,
    deadline: e.deadline,
    isClosed: e.is_closed,
    isVague: e.is_vague,
    confidence: e.confidence,
    sourceUrl,
    deepExtractedUrl: null,
    aiProviderUsed: null,
    extractionMethod: 'telegram_only',
    rawMessageId: rawId,
    channelId,
    postedAt,
  };
}

function mapPrismaJobToDomain(p: {
  id: string;
  title: string | null;
  titleAmharic: string | null;
  companyName: string | null;
  companyNameAmharic: string | null;
  jobCategory: string | null;
  employmentType: string | null;
  workType: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  experienceText: string | null;
  location: string | null;
  locationCity: string | null;
  locationArea: string | null;
  isRemote: boolean;
  salaryText: string | null;
  salaryMinEtb: number | null;
  salaryMaxEtb: number | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  howToApply: string | null;
  applicationLink: string | null;
  applicationEmail: string | null;
  deadline: Date | null;
  isClosed: boolean;
  isVague: boolean;
  aiConfidence: Decimal | null;
  sourceUrl: string | null;
  deepExtractedUrl: string | null;
  aiProviderUsed: string | null;
  extractionMethod: string;
  rawMessageId: string | null;
  channelId: string;
  postedAt: Date | null;
}): DomainJob {
  return {
    id: p.id,
    title: p.title,
    titleAmharic: p.titleAmharic,
    companyName: p.companyName,
    companyNameAmharic: p.companyNameAmharic,
    jobCategory: p.jobCategory,
    employmentType: p.employmentType,
    workType: p.workType,
    minExperienceYears: p.minExperienceYears,
    maxExperienceYears: p.maxExperienceYears,
    experienceText: p.experienceText,
    location: p.location,
    locationCity: p.locationCity,
    locationArea: p.locationArea,
    isRemote: p.isRemote,
    salaryText: p.salaryText,
    salaryMinEtb: p.salaryMinEtb,
    salaryMaxEtb: p.salaryMaxEtb,
    description: p.description,
    requirements: p.requirements,
    responsibilities: p.responsibilities,
    howToApply: p.howToApply,
    applicationLink: p.applicationLink,
    applicationEmail: p.applicationEmail,
    deadline: p.deadline ? p.deadline.toISOString().slice(0, 10) : null,
    isClosed: p.isClosed,
    isVague: p.isVague,
    confidence: p.aiConfidence ? Number(p.aiConfidence) : 0.5,
    sourceUrl: p.sourceUrl,
    deepExtractedUrl: p.deepExtractedUrl,
    aiProviderUsed: p.aiProviderUsed,
    extractionMethod: p.extractionMethod,
    rawMessageId: p.rawMessageId ?? '',
    channelId: p.channelId,
    postedAt: p.postedAt,
  };
}

// Decimal shim (since Prisma.Decimal isn't imported)
type Decimal = { toString(): string };

async function persistJob(job: DomainJob, rawId: string, channelId: string): Promise<void> {
  await prisma.job.create({
    data: {
      id: job.id,
      rawMessageId: rawId,
      channelId,
      title: job.title,
      titleAmharic: job.titleAmharic,
      companyName: job.companyName,
      companyNameAmharic: job.companyNameAmharic,
      jobCategory: job.jobCategory,
      employmentType: job.employmentType,
      workType: job.workType,
      minExperienceYears: job.minExperienceYears,
      maxExperienceYears: job.maxExperienceYears,
      experienceText: job.experienceText,
      location: job.location,
      locationCity: job.locationCity,
      locationArea: job.locationArea,
      isRemote: job.isRemote,
      salaryText: job.salaryText,
      salaryMinEtb: job.salaryMinEtb,
      salaryMaxEtb: job.salaryMaxEtb,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      howToApply: job.howToApply,
      applicationLink: job.applicationLink,
      applicationEmail: job.applicationEmail,
      deadline: job.deadline ? new Date(job.deadline) : null,
      isClosed: job.isClosed,
      isVague: job.isVague,
      sourceUrl: job.sourceUrl,
      deepExtractedUrl: job.deepExtractedUrl,
      aiProviderUsed: job.aiProviderUsed,
      aiConfidence: job.confidence,
      extractionMethod: job.extractionMethod,
      postedAt: job.postedAt,
    },
  });
}
