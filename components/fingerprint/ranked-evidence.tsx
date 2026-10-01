function ScoreRing({ percent, label, size = 176 }: { percent: number; label: string; size?: number }) {
  const value = Math.max(0, Math.min(100, percent));
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  return <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value} percent for ${label}`}>
    <svg viewBox="0 0 144 144" className="size-full -rotate-90" aria-hidden="true">
      <circle cx="72" cy="72" r={radius} fill="none" stroke="#e6e6e6" strokeWidth="16" />
      <circle cx="72" cy="72" r={radius} fill="none" stroke="#ffdc58" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(value / 100) * circumference} ${circumference}`} />
    </svg>
    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-head text-5xl tracking-tight">{value}%</span>
  </div>;
}

export function RankedEvidence({ named, namedKey, scores }: {
  named?: string;
  namedKey?: string;
  scores: { candidateId: string; score: number; label: string; email: string; personKey: string }[];
}) {
  const people = new Map<string, { candidateId: string; score: number; label: string; email: string; personKey: string }>();
  for (const score of scores) {
    const current = people.get(score.personKey);
    if (!current || score.score > current.score) people.set(score.personKey, score);
  }
  const ranked = [...people.values()].sort((left, right) => right.score - left.score);
  const positive = ranked.filter((score) => score.score > 0);
  const namedPerson = namedKey ? ranked.find((score) => score.personKey === namedKey) ?? ranked[0] : undefined;
  const board = !namedPerson && positive.length > 1;
  const shown = namedPerson ? [namedPerson] : board ? positive : positive.slice(0, 1);
  const positiveTotal = positive.reduce((sum, score) => sum + score.score, 0);
  const percent = (score: number) => board && positiveTotal > 0
    ? Math.round((score / positiveTotal) * 100)
    : Math.max(0, Math.round(score * 100));
  const displayName = (score: { label: string }) => namedPerson && named ? named : score.label;
  const status = namedPerson ? "Probable match" : "Inconclusive";

  if (!shown.length) return <p>No shared copy is named.</p>;

  if (shown.length === 1) {
    const person = shown[0];
    return <div className="overflow-hidden rounded-xl border-2 border-black bg-white text-black shadow-md">
      <div className="border-b-2 border-black px-5 py-4">
        <p className="font-head text-2xl">{displayName(person)}</p>
        {person.email && <p className="mt-1 break-all text-sm text-neutral-600">{person.email}</p>}
      </div>
      <div className="flex flex-col items-center gap-4 px-5 py-8">
        <ScoreRing percent={percent(person.score)} label={displayName(person)} />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{status}</p>
      </div>
    </div>;
  }

  return <ol className="space-y-4">
    {shown.map((score, index) => <li key={score.personKey} className="overflow-hidden rounded-xl border-2 border-black bg-white text-black shadow-md">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-head text-xl">#{index + 1} {score.label}</p>
          {score.email && <p className="break-all text-sm text-neutral-600">{score.email}</p>}
        </div>
      </div>
      <div className="flex justify-center px-4 py-5">
        <ScoreRing percent={percent(score.score)} label={score.label} size={132} />
      </div>
    </li>)}
  </ol>;
}
