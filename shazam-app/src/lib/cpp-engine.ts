/**
 * C++ Engine Bridge with TypeScript Fallback
 *
 * This module provides a bridge between Node.js/Next.js and the C++ fingerprinting engine.
 * It spawns the C++ executable and communicates via stdin/stdout using JSON.
 *
 * If the C++ engine is not available, it falls back to the TypeScript implementation.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// Import TypeScript fallback implementation
import * as TSFingerprint from "./fingerprint";

// Path to the C++ engine executable
const ENGINE_PATH =
  process.env.SHAZAM_ENGINE_PATH ||
  path.join(process.cwd(), "..", "engine", "bin", "shazam_engine.exe");

// Use TypeScript for matching (faster - no process spawn overhead) vs C++ (slower but ensures consistency)
// Set SHAZAM_USE_TS_MATCHING=false to use C++ engine for matching
const USE_TS_MATCHING = process.env.SHAZAM_USE_TS_MATCHING !== "false";

// Cache engine availability
let engineAvailableCache: boolean | null = null;

export interface Fingerprint {
  hash: number;
  timeOffset: number;
}

export interface GenerateResult {
  fingerprints: Fingerprint[];
  peakCount: number;
  spectrogramFrames?: number;
  error?: string;
  usedCppEngine?: boolean;
}

export interface MatchResult {
  matchCount: number;
  alignedMatches: number;
  confidence: number;
  error?: string;
  usedCppEngine?: boolean;
}

/**
 * Check if the C++ engine executable exists
 */
function engineExists(): boolean {
  try {
    return fs.existsSync(ENGINE_PATH);
  } catch {
    return false;
  }
}

/**
 * Call the C++ engine with a command and input
 */
async function callEngine(command: string, input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const engineProcess = spawn(ENGINE_PATH, [command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    engineProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    engineProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    engineProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Engine exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse engine output: ${stdout}`));
      }
    });

    engineProcess.on("error", (err) => {
      reject(
        new Error(
          `Failed to start engine: ${err.message}. Make sure the C++ engine is built at ${ENGINE_PATH}`,
        ),
      );
    });

    // Send input as JSON
    const jsonInput = JSON.stringify(input);
    engineProcess.stdin.write(jsonInput);
    engineProcess.stdin.end();
  });
}

/**
 * Generate fingerprints using TypeScript fallback
 */
function generateFingerprintsTS(
  samples: Float32Array | number[],
): GenerateResult {
  try {
    const samplesArray =
      samples instanceof Float32Array ? samples : new Float32Array(samples);

    const fingerprints = TSFingerprint.generateFingerprints(samplesArray);

    return {
      fingerprints: fingerprints,
      peakCount: fingerprints.length,
      usedCppEngine: false,
    };
  } catch (error: any) {
    return {
      fingerprints: [],
      peakCount: 0,
      error: error.message,
      usedCppEngine: false,
    };
  }
}

/**
 * Match fingerprints using TypeScript fallback
 */
function matchFingerprintsTS(
  query: Fingerprint[],
  reference: Fingerprint[],
): MatchResult {
  try {
    // Use the TS matching function
    const confidence = TSFingerprint.matchFingerprints(
      query as TSFingerprint.Fingerprint[],
      reference as TSFingerprint.Fingerprint[],
    );

    return {
      matchCount: query.length,
      alignedMatches: Math.round((query.length * confidence) / 100),
      confidence: confidence,
      usedCppEngine: false,
    };
  } catch (error: any) {
    return {
      matchCount: 0,
      alignedMatches: 0,
      confidence: 0,
      error: error.message,
      usedCppEngine: false,
    };
  }
}

/**
 * Generate fingerprints from audio samples
 * Uses C++ engine if available, falls back to TypeScript
 *
 * @param samples - Audio samples (Float32Array or number array, values -1.0 to 1.0)
 * @param sampleRate - Sample rate in Hz (default: 44100)
 * @returns Generated fingerprints
 */
export async function generateFingerprints(
  samples: Float32Array | number[],
  sampleRate: number = 44100,
): Promise<GenerateResult> {
  // Check if C++ engine exists
  if (!engineExists()) {
    console.log("[Engine] C++ engine not found, using TypeScript fallback");
    return generateFingerprintsTS(samples);
  }

  // Convert Float32Array to regular array if needed
  const samplesArray =
    samples instanceof Float32Array ? Array.from(samples) : samples;

  const input = {
    samples: samplesArray,
    sampleRate: sampleRate,
  };

  try {
    const result = await callEngine("generate", input);
    console.log("[Engine] Using C++ engine");
    return { ...result, usedCppEngine: true } as GenerateResult;
  } catch (error: any) {
    console.warn(
      "[Engine] C++ engine failed, using TypeScript fallback:",
      error.message,
    );
    return generateFingerprintsTS(samples);
  }
}

/**
 * Match query fingerprints against reference fingerprints
 * Uses TypeScript implementation by default (faster - no process spawn overhead)
 * Falls back to C++ if SHAZAM_USE_TS_MATCHING=false
 *
 * @param query - Query fingerprints (from recorded audio)
 * @param reference - Reference fingerprints (from database)
 * @returns Match result with confidence score
 */
export async function matchFingerprints(
  query: Fingerprint[],
  reference: Fingerprint[],
): Promise<MatchResult> {
  // Use TypeScript implementation by default for performance (no process spawn)
  if (USE_TS_MATCHING) {
    return matchFingerprintsTS(query, reference);
  }

  // Fall back to C++ if explicitly requested
  if (!engineExists()) {
    console.log(
      "[Engine] C++ engine not found, using TypeScript fallback for matching",
    );
    return matchFingerprintsTS(query, reference);
  }

  const input = {
    query: query,
    reference: reference,
  };

  try {
    const result = await callEngine("match", input);
    console.log("[Engine] Using C++ engine for matching");
    return { ...result, usedCppEngine: true } as MatchResult;
  } catch (error: any) {
    console.warn(
      "[Engine] C++ engine match failed, using TypeScript fallback:",
      error.message,
    );
    return matchFingerprintsTS(query, reference);
  }
}

/**
 * Check if the C++ engine is available and working
 */
export async function checkEngineAvailable(): Promise<boolean> {
  if (engineAvailableCache !== null) {
    return engineAvailableCache;
  }

  if (!engineExists()) {
    engineAvailableCache = false;
    return false;
  }

  try {
    await callEngine("generate", { samples: [0, 0, 0, 0], sampleRate: 44100 });
    engineAvailableCache = true;
    return true;
  } catch {
    engineAvailableCache = false;
    return false;
  }
}

/**
 * Get the path to the C++ engine executable
 */
export function getEnginePath(): string {
  return ENGINE_PATH;
}
