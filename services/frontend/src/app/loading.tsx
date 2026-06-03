export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-28 sm:px-10 sm:pt-36">
      <div className="mb-10 h-12 w-64 animate-pulse rounded-card bg-surface" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <div className="aspect-square animate-pulse rounded-card bg-surface" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
