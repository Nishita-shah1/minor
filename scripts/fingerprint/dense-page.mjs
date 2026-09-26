import { embedDense } from "../../lib/fingerprint/dense/embed.ts";
import { rankDense } from "../../lib/fingerprint/dense/rank.ts";

window.denseEmbed = embedDense;
window.denseRank = rankDense;
window.denseReady = true;
