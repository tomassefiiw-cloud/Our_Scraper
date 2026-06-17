/**
 * kebenajobs.com strategy — same family as elelanjobs (direct job page).
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { ElelanJobsStrategy } from './elelanjobs.js';

export class KebenaJobsStrategy extends ElelanJobsStrategy {
  readonly domain = 'kebenajobs.com';
}
