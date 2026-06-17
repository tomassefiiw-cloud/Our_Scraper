import { notFound } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  let job;
  try {
    const res = await apiClient.job(params.id);
    job = res.job;
  } catch {
    notFound();
  }

  const deadline = job.deadline ? new Date(job.deadline) : null;
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <article className="space-y-6">
      <Link href="/" className="text-sm text-brand-600 hover:underline">
        ← Back to feed
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{job.title ?? 'Untitled Position'}</h1>
        {job.titleAmharic && (
          <p className="text-lg text-gray-600" lang="am">{job.titleAmharic}</p>
        )}
        <p className="text-lg text-gray-700">{job.companyName ?? 'Unknown company'}</p>
        {job.channel?.displayName && (
          <p className="text-xs text-gray-400">via {job.channel.displayName}</p>
        )}
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        {job.locationCity && <Chip>📍 {job.locationCity}</Chip>}
        {job.isRemote && <Chip>🌐 Remote</Chip>}
        {job.employmentType && <Chip>💼 {job.employmentType}</Chip>}
        {job.workType && <Chip>🏢 {job.workType}</Chip>}
        {job.jobCategory && <Chip>🏷️ {job.jobCategory}</Chip>}
        {job.minExperienceYears !== null && (
          <Chip>
            ⏳ {job.minExperienceYears}
            {job.maxExperienceYears !== null ? `-${job.maxExperienceYears}` : '+'} years
          </Chip>
        )}
        {job.salaryText && <Chip>💰 {job.salaryText}</Chip>}
        {deadline && (
          <Chip>
            ⌛ Deadline {deadline.toLocaleDateString()}
            {daysLeft !== null && daysLeft >= 0 && ` (${daysLeft}d left)`}
          </Chip>
        )}
      </div>

      {job.description && (
        <section>
          <h2 className="font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{job.description}</p>
        </section>
      )}

      {job.requirements.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Requirements</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {job.requirements.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}

      {job.responsibilities.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Responsibilities</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}

      {job.howToApply && (
        <section>
          <h2 className="font-semibold mb-2">How to Apply</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{job.howToApply}</p>
        </section>
      )}

      <section className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
        {job.applicationLink && (
          <a
            href={job.applicationLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700"
          >
            Apply on website ↗
          </a>
        )}
        {job.applicationEmail && (
          <a
            href={`mailto:${job.applicationEmail}`}
            className="px-4 py-2 border border-brand-600 text-brand-600 rounded-lg font-medium hover:bg-brand-50"
          >
            Email application ✉
          </a>
        )}
        <SaveButton jobId={job.id} />
      </section>

      <p className="text-xs text-gray-400 pt-4">
        Extracted via {job.extractionMethod} · AI confidence: {job.aiConfidence !== null ? `${Math.round(job.aiConfidence * 100)}%` : 'n/a'}
      </p>
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="bg-gray-100 px-3 py-1 rounded-full text-xs">{children}</span>;
}

function SaveButton({ jobId }: { jobId: string }) {
  return (
    <button
      onClick={async () => {
        const { apiClient } = await import('@/lib/api');
        await apiClient.interact(jobId, 'saved');
        alert('Saved!');
      }}
      className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
    >
      ★ Save
    </button>
  );
}
