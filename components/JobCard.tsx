'use client';

import Link from 'next/link';

export interface Job {
  id: string;
  title: string | null;
  titleAmharic: string | null;
  companyName: string | null;
  jobCategory: string | null;
  jobCategories?: string[];
  employmentType: string | null;
  workType: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  location: string | null;
  locationCity: string | null;
  isRemote: number;
  salaryText: string | null;
  deadline: string | null;
  postedAt: string | null;
  channelUsername: string | null;
}

export default function JobCard({ job }: { job: Job }) {
  const deadline = job.deadline ? new Date(job.deadline) : null;
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">
            {job.title ?? 'Untitled Position'}
          </h3>
          {job.titleAmharic && (
            <p className="text-sm text-gray-500 truncate" lang="am">{job.titleAmharic}</p>
          )}
          <p className="text-sm text-gray-700 mt-0.5">
            {job.companyName ?? 'Unknown company'}
          </p>
        </div>
        {job.isRemote === 1 && (
          <span className="shrink-0 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            Remote
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
        {job.locationCity && (
          <span className="bg-gray-100 px-2 py-0.5 rounded">📍 {job.locationCity}</span>
        )}
        {job.employmentType && (
          <span className="bg-gray-100 px-2 py-0.5 rounded">💼 {job.employmentType}</span>
        )}
        {(job.jobCategories && job.jobCategories.length > 0 ? job.jobCategories : [job.jobCategory].filter(Boolean)).map((cat) => (
          <span key={cat} className="bg-gray-100 px-2 py-0.5 rounded">🏷️ {cat}</span>
        ))}
        {job.minExperienceYears !== null && (
          <span className="bg-gray-100 px-2 py-0.5 rounded">
            ⏳ {job.minExperienceYears}
            {job.maxExperienceYears !== null ? `-${job.maxExperienceYears}` : '+'} yrs
          </span>
        )}
        {daysLeft !== null && daysLeft >= 0 && (
          <span className={`px-2 py-0.5 rounded ${
            daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          }`}>
            ⌛ {daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
          </span>
        )}
      </div>

      {job.channelUsername && (
        <p className="mt-2 text-xs text-gray-400">via {job.channelUsername}</p>
      )}
    </Link>
  );
}
