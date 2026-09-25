// Shortened systematic binary BCH(127, 71, t=8), primitive polynomial 137.
// TrustMark schema 0: 40 data bits + 56 parity bits + four zero schema bits.
// This algebraic implementation uses MSB-first packet order; no byte padding.
const exp = new Uint8Array(254);
const log = new Int16Array(128).fill(-1);
let element = 1;
for (let i = 0; i < 127; i++) {
  exp[i] = exp[i + 127] = element;
  log[element] = i;
  element <<= 1;
  if (element & 128) element ^= 137;
}
const multiply = (a: number, b: number) => a && b ? exp[log[a] + log[b]] : 0;
const divide = (a: number, b: number) => {
  if (!b) throw new Error("BCH division by zero");
  return a ? exp[(log[a] - log[b] + 127) % 127] : 0;
};

function generatorPolynomial(): Uint8Array {
  const roots = new Set<number>();
  for (let i = 1; i <= 16; i++) {
    let root = i;
    do { roots.add(root); root = (root * 2) % 127; } while (root !== i);
  }
  let coefficients: number[] = [1]; // Ascending powers.
  for (const root of roots) {
    const next = new Array<number>(coefficients.length + 1).fill(0);
    coefficients.forEach((value, i) => {
      next[i] ^= multiply(value, exp[root]);
      next[i + 1] ^= value;
    });
    coefficients = next;
  }
  if (coefficients.length !== 57 || coefficients.some((x) => x !== 0 && x !== 1)) {
    throw new Error("Invalid BCH generator");
  }
  return Uint8Array.from(coefficients.reverse());
}
const generator = generatorPolynomial();

export function encodePacket(identifier: Uint8Array): Uint8Array<ArrayBuffer> {
  if (identifier.length !== 5) throw new Error("Expected a five-byte copy identifier");
  const packet = new Uint8Array(100);
  for (let i = 0; i < 40; i++) packet[i] = (identifier[i >> 3] >> (7 - i % 8)) & 1;
  const remainder = packet.slice(0, 96);
  for (let i = 0; i < 40; i++) {
    if (remainder[i]) for (let j = 0; j < generator.length; j++) remainder[i + j] ^= generator[j];
  }
  packet.set(remainder.subarray(40), 40);
  return packet;
}

function syndromes(packet: Uint8Array): Uint8Array {
  const result = new Uint8Array(17);
  for (let order = 1; order <= 16; order++) {
    for (let i = 0; i < 96; i++) {
      if (packet[i]) result[order] ^= exp[((95 - i) * order) % 127];
    }
  }
  return result;
}

export function decodePacket(packet: Uint8Array): { identifier: Uint8Array<ArrayBuffer>; correctedBits: number } | null {
  if (packet.length !== 100 || packet.some((bit) => bit !== 0 && bit !== 1) || packet.subarray(96).some(Boolean)) return null;
  const corrected = packet.slice();
  const syndrome = syndromes(corrected);
  let degree = 0;
  let shift = 1;
  let previousDiscrepancy = 1;
  const locator = new Uint8Array(17);
  let previous = new Uint8Array(17);
  locator[0] = previous[0] = 1;
  // Berlekamp-Massey determines the error-locator polynomial.
  for (let n = 0; n < 16; n++) {
    let discrepancy = syndrome[n + 1];
    for (let i = 1; i <= degree; i++) discrepancy ^= multiply(locator[i], syndrome[n + 1 - i]);
    if (!discrepancy) { shift++; continue; }
    const saved = locator.slice();
    const scale = divide(discrepancy, previousDiscrepancy);
    for (let i = 0; i + shift < locator.length; i++) locator[i + shift] ^= multiply(scale, previous[i]);
    if (2 * degree <= n) {
      degree = n + 1 - degree;
      previous = saved;
      previousDiscrepancy = discrepancy;
      shift = 1;
    } else shift++;
  }
  if (degree > 8) return null;
  let correctedBits = 0;
  // Chien search only within the transmitted shortened word.
  for (let power = 0; power < 96; power++) {
    let value = locator[0];
    for (let i = 1; i <= degree; i++) value ^= multiply(locator[i], exp[(127 - (power * i) % 127) % 127]);
    if (!value) { corrected[95 - power] ^= 1; correctedBits++; }
  }
  if (correctedBits !== degree || syndromes(corrected).some(Boolean)) return null;
  const identifier = new Uint8Array(5);
  for (let i = 0; i < 40; i++) identifier[i >> 3] |= corrected[i] << (7 - i % 8);
  return { identifier, correctedBits };
}
