import { describe, expect, it } from "vitest";
import { decodePacket, encodePacket } from "./bch";
import golden from "./fixtures/bch-super.json";

describe("BCH_SUPER packets", () => {
  const identifier = new Uint8Array([1, 35, 69, 103, 137]);
  it.each(golden.vectors)("matches Adobe's Python packet for $payloadHex", (vector) => {
    const bytes = Uint8Array.from(vector.payloadHex.match(/../g)!, (x) => parseInt(x, 16));
    expect(Array.from(encodePacket(bytes)).join("")).toBe(vector.packetBits);
    expect(decodePacket(Uint8Array.from(vector.packetBits, Number))).toEqual({ identifier: bytes, correctedBits: 0 });
  });
  it("corrects 960 reproducible distinct-error cases against reference payloads", () => {
    let seed = 20260925;
    for (const vector of golden.vectors) for (let count = 1; count <= 8; count++) for (let trial = 0; trial < 10; trial++) {
      const packet = Uint8Array.from(vector.packetBits, Number);
      const positions = Array.from({ length: 96 }, (_, i) => i);
      for (let i = 0; i < count; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = i + seed % (96 - i);
        [positions[i], positions[j]] = [positions[j], positions[i]];
        packet[positions[i]] ^= 1;
      }
      const result = decodePacket(packet);
      expect(result?.correctedBits).toBe(count);
      expect(Array.from(result!.identifier, (x) => x.toString(16).padStart(2, "0")).join("")).toBe(vector.payloadHex);
    }
  });
  it("encodes a 40-bit identifier into a 100-bit schema-zero packet", () => {
    const packet = encodePacket(identifier);
    expect(packet).toHaveLength(100);
    expect(Array.from(packet.slice(96))).toEqual([0, 0, 0, 0]);
    expect(decodePacket(packet)).toEqual({ identifier, correctedBits: 0 });
  });
  it.each(Array.from({ length: 9 }, (_, i) => i))("corrects %i distinct protected-bit errors", (count) => {
    const packet = encodePacket(identifier);
    for (let i = 0; i < count; i++) packet[i * 11] ^= 1;
    expect(decodePacket(packet)).toEqual({ identifier, correctedBits: count });
  });
  it("rejects unsupported schemas, malformed bits and lengths", () => {
    const packet = encodePacket(identifier);
    packet[99] = 1;
    expect(decodePacket(packet)).toBeNull();
    packet[99] = 0;
    packet[0] = 2;
    expect(decodePacket(packet)).toBeNull();
    expect(decodePacket(new Uint8Array(99))).toBeNull();
    expect(() => encodePacket(new Uint8Array(6))).toThrow();
  });
});
