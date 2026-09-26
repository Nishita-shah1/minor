export function RankedEvidence({ named, scores, regions, margin, medianOther, scalesAgreeing }: {
  named?: string;
  scores: { candidateId: string; score: number; label: string }[];
  regions: number;
  margin: number;
  medianOther?: number;
  scalesAgreeing?: number;
}) {
  return <div className="space-y-3 rounded-xl border-2 border-black bg-background p-4 shadow-md">
    <p className="text-sm font-bold">{named ? "Probable copy match" : "Inconclusive crop"}</p>
    {named ? <p className="font-head text-2xl">{named}</p> : <p>No shared copy is named. Rank #1 is not a match.</p>}
    <p className="text-xs font-bold uppercase tracking-widest">Status: {named ? "PROBABLE_MATCH" : "INCONCLUSIVE"}</p>
    <ol className="space-y-2">
      {scores.map((score, index) => <li key={score.candidateId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
        <span className="font-mono">#{index + 1}</span>
        <span className="truncate font-bold">{score.label}</span>
        <span className="rounded-full border-2 border-black px-3 py-1 font-mono">{score.score.toFixed(2)}{score.score > 0 ? ` · ${Math.round(score.score * 100)}/100` : ""}</span>
      </li>)}
    </ol>
    <p className="text-xs text-muted-foreground">Relative forensic score — not a probability. Usable regions: {regions}. Leader margin: {margin.toFixed(2)}.{medianOther !== undefined ? ` Median of the other scores: ${medianOther.toFixed(2)}.` : ""}{scalesAgreeing ? ` Scales agreeing: ${scalesAgreeing}.` : ""} This suggests a displayed copy, not who disclosed it. Crop ranking is unqualified.</p>
  </div>;
}
