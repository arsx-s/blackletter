import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inflateRaw, inflateZlib } from "../../lib/extraction/inflate";
import { isExtractionError } from "../../lib/extraction/errors";

/**
 * Round-trip the inflater against the platform zlib.
 *
 * This test exists because the inflater it replaced *passed* its own tests while
 * being broken: it keyed canonical Huffman codes by numeric value, so any block
 * using the compressed (Huffman) block types decoded incorrectly. Only stored
 * blocks worked. Comparing against zlib on inputs that exercise all three block
 * types is the check that would have caught it.
 */

const ENCODER = new TextEncoder();

function expectRoundTrip(payload: Uint8Array, options?: { level?: number }): void {
  const compressed = new Uint8Array(deflateSync(payload, options));
  const inflated = inflateRaw(compressed.subarray(2), Math.max(payload.length, 1) * 4 + 1024);
  expect(Array.from(inflated)).toEqual(Array.from(payload));
}

describe("inflate: round trip against zlib", () => {
  it("decodes a short ASCII payload", () => {
    expectRoundTrip(ENCODER.encode("Hello BlackLetter"));
  });

  it("decodes every byte value", () => {
    const payload = new Uint8Array(256);
    for (let i = 0; i < 256; i++) payload[i] = i;
    expectRoundTrip(payload);
  });

  it("decodes pseudo-random bytes, which forces dynamic Huffman blocks", () => {
    // A deterministic PRNG keeps the test reproducible while producing the
    // high-entropy input that makes zlib emit a dynamic-Huffman block.
    let state = 0x12345678;
    const payload = new Uint8Array(4096);
    for (let i = 0; i < payload.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      payload[i] = (state >> 16) & 0xff;
    }
    expectRoundTrip(payload);
  });

  it("decodes a highly repetitive payload, which forces long back-references", () => {
    const payload = ENCODER.encode("abcd".repeat(20_000));
    expectRoundTrip(payload);
  });

  it("decodes a stored (uncompressed) block", () => {
    expectRoundTrip(ENCODER.encode("Plain stored text"), { level: 0 });
  });

  it("decodes a multi-block payload larger than one window", () => {
    let state = 0x0badf00d;
    const payload = new Uint8Array(80_000);
    for (let i = 0; i < payload.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      // Mix structured and random data so several block types are used.
      payload[i] = i % 1000 < 500 ? 65 + (i % 26) : (state >> 16) & 0xff;
    }
    expectRoundTrip(payload);
  });

  it("accepts a full zlib stream through inflateZlib", () => {
    const payload = ENCODER.encode("zlib-wrapped content for PDF streams");
    const compressed = new Uint8Array(deflateSync(payload));
    const inflated = inflateZlib(compressed, 4096);
    expect(new TextDecoder().decode(inflated)).toBe("zlib-wrapped content for PDF streams");
  });
});

describe("inflate: refusal", () => {
  it("stops at the caller's byte budget", () => {
    // 1 MB of zeros compresses to a few hundred bytes; a 1 KB budget must stop it.
    const bomb = new Uint8Array(deflateSync(new Uint8Array(1024 * 1024)));
    let thrown: unknown;
    try {
      inflateRaw(bomb.subarray(2), 1024);
    } catch (error) {
      thrown = error;
    }
    expect(isExtractionError(thrown)).toBe(true);
    if (isExtractionError(thrown)) expect(thrown.code).toBe("EXTRACTION_LIMIT");
  });

  it("refuses a truncated stream", () => {
    const compressed = new Uint8Array(deflateSync(ENCODER.encode("x".repeat(5000))));
    const truncated = compressed.subarray(2, 10);
    let thrown: unknown;
    try {
      inflateRaw(truncated, 100_000);
    } catch (error) {
      thrown = error;
    }
    expect(isExtractionError(thrown)).toBe(true);
  });

  it("refuses a reserved block type", () => {
    let thrown: unknown;
    try {
      inflateRaw(new Uint8Array([0b00000111]), 1024);
    } catch (error) {
      thrown = error;
    }
    expect(isExtractionError(thrown)).toBe(true);
  });

  it("refuses a zlib stream with a bad header checksum", () => {
    const compressed = new Uint8Array(deflateSync(ENCODER.encode("header check")));
    compressed[1] = (compressed[1] + 1) & 0xff;
    let thrown: unknown;
    try {
      inflateZlib(compressed, 4096);
    } catch (error) {
      thrown = error;
    }
    expect(isExtractionError(thrown)).toBe(true);
  });

  it("refuses a back-reference that reaches before the start of the output", () => {
    // A hand-built dynamic block whose first action is a copy at distance 1.
    // Rather than craft the bits, assert the guard directly through copyFromHistory
    // behaviour: any stream that begins with a length/distance pair must fail.
    // Building it: BFINAL=1, BTYPE=01 (fixed), symbol 257 (len 3), distance 0 -> invalid.
    // Fixed literal code 257 is 7 bits: 0000001. Distance code 0 is 5 bits: 00000.
    // Bits are packed LSB-first.
    const bits = [1, 1, 0]; // BFINAL=1, BTYPE=01 → first byte 0b00000011
    // length symbol 257 → 7-bit code 0000001, MSB first
    bits.push(0, 0, 0, 0, 0, 0, 1);
    // distance symbol 0 → 5-bit code 00000
    bits.push(0, 0, 0, 0, 0);
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8 && i + j < bits.length; j++) byte |= bits[i + j] << j;
      bytes.push(byte);
    }    let thrown: unknown;
    try {
      inflateRaw(new Uint8Array(bytes), 1024);
    } catch (error) {
      thrown = error;
    }
    expect(isExtractionError(thrown)).toBe(true);
  });
});
