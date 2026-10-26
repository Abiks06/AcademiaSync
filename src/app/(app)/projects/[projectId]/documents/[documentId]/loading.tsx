export default function Loading() {
  return (
    <div className="mx-auto max-w-[78rem]" aria-busy="true" aria-label="Opening manuscript">
      <div className="shimmer h-5 w-40 rounded-lg bg-line" />
      <div className="shimmer mt-4 h-11 w-2/3 rounded-xl bg-line" />
      <div className="glass mt-10 min-h-[60dvh] rounded-2xl p-14">
        {[92, 100, 78, 96, 60].map((w, i) => (
          <div key={i} className="shimmer mb-4 h-3.5 rounded-full bg-line/70" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
