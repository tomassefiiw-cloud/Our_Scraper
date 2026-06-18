import JobFeed from '@/components/JobFeed';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Latest Jobs</h1>
        <p className="text-sm text-gray-500">
          AI-extracted from 12 Ethiopian Telegram job channels, refreshed every 30 minutes.
        </p>
      </div>
      <JobFeed />
    </div>
  );
}
