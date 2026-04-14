/**
 * Shazam-CPP Audio Fingerprinting Engine
 *
 * This module implements the Avery Wang-style audio fingerprinting algorithm:
 * 1. Audio preprocessing (PCM conversion to mono 44.1kHz)
 * 2. Spectrogram generation using Short-Time Fourier Transform (STFT)
 * 3. Peak extraction (constellation mapping)
 * 4. Hash generation from peak pairs
 */

// FFT Window size as per SRS requirement
const FFT_SIZE = 1024; // Reduced for downsampled audio
const SAMPLE_RATE = 11025; // Downsampled from 44100Hz (factor of 4)
const HOP_SIZE = FFT_SIZE / 4; // 75% overlap
const MIN_FREQUENCY = 300; // Hz
const MAX_FREQUENCY = 5000; // Hz

// Peak extraction parameters
const PEAK_NEIGHBORHOOD_SIZE = 10;
const MIN_AMPLITUDE_THRESHOLD = 0.005;

// Hashing parameters
const TARGET_ZONE_SIZE = 5; // Number of peaks to pair with each anchor
const MAX_TIME_DELTA = 200; // Maximum time difference between paired peaks

export interface Fingerprint {
  hash: number;
  timeOffset: number;
}

export interface Peak {
  time: number;
  frequency: number;
  amplitude: number;
}

/**
 * Simple FFT implementation using Cooley-Tukey algorithm
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;

  if (n <= 1) return;

  // Bit reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey iterative FFT
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = (2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = -Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const evenIdx = i + j;
        const oddIdx = i + j + halfLen;

        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] += tReal;
        imag[evenIdx] += tImag;

        const newReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newReal;
      }
    }
  }
}

/**
 * Apply Hann window to audio samples
 */
function applyHannWindow(samples: Float32Array): Float32Array {
  const windowed = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const multiplier =
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (samples.length - 1)));
    windowed[i] = samples[i] * multiplier;
  }
  return windowed;
}

/**
 * Generate spectrogram from audio samples using STFT
 */
function generateSpectrogram(samples: Float32Array): Float32Array[] {
  const numFrames = Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1;
  const spectrogram: Float32Array[] = [];

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * HOP_SIZE;
    const frameData = samples.slice(start, start + FFT_SIZE);

    // Apply window
    const windowed = applyHannWindow(frameData);

    // Prepare FFT buffers
    const real = new Float32Array(FFT_SIZE);
    const imag = new Float32Array(FFT_SIZE);
    real.set(windowed);

    // Perform FFT
    fft(real, imag);

    // Calculate magnitude spectrum (only positive frequencies)
    const magnitude = new Float32Array(FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    spectrogram.push(magnitude);
  }

  return spectrogram;
}

/**
 * Convert frequency bin to Hz
 */
function binToFrequency(bin: number): number {
  return (bin * SAMPLE_RATE) / FFT_SIZE;
}

/**
 * Convert Hz to frequency bin
 */
function frequencyToBin(freq: number): number {
  return Math.round((freq * FFT_SIZE) / SAMPLE_RATE);
}

/**
 * Extract peaks from spectrogram (constellation mapping)
 */
function extractPeaks(spectrogram: Float32Array[]): Peak[] {
  const peaks: Peak[] = [];
  const minBin = frequencyToBin(MIN_FREQUENCY);
  const maxBin = frequencyToBin(MAX_FREQUENCY);

  for (
    let time = PEAK_NEIGHBORHOOD_SIZE;
    time < spectrogram.length - PEAK_NEIGHBORHOOD_SIZE;
    time++
  ) {
    const frame = spectrogram[time];

    for (
      let freq = Math.max(minBin, PEAK_NEIGHBORHOOD_SIZE);
      freq < Math.min(maxBin, frame.length - PEAK_NEIGHBORHOOD_SIZE);
      freq++
    ) {
      const amplitude = frame[freq];

      // Skip if below threshold
      if (amplitude < MIN_AMPLITUDE_THRESHOLD) continue;

      // Check if this is a local maximum
      let isLocalMax = true;

      // Check neighborhood
      for (
        let dt = -PEAK_NEIGHBORHOOD_SIZE;
        dt <= PEAK_NEIGHBORHOOD_SIZE && isLocalMax;
        dt++
      ) {
        for (
          let df = -PEAK_NEIGHBORHOOD_SIZE;
          df <= PEAK_NEIGHBORHOOD_SIZE && isLocalMax;
          df++
        ) {
          if (dt === 0 && df === 0) continue;

          const neighborTime = time + dt;
          const neighborFreq = freq + df;

          if (
            neighborTime >= 0 &&
            neighborTime < spectrogram.length &&
            neighborFreq >= 0 &&
            neighborFreq < frame.length
          ) {
            if (spectrogram[neighborTime][neighborFreq] >= amplitude) {
              isLocalMax = false;
            }
          }
        }
      }

      if (isLocalMax) {
        peaks.push({
          time,
          frequency: binToFrequency(freq),
          amplitude,
        });
      }
    }
  }

  // Sort peaks by time
  peaks.sort((a, b) => a.time - b.time);

  return peaks;
}

/**
 * Generate fingerprint hashes from peaks
 * Hash format: combines anchor frequency, target frequency, and time delta
 */
function generateHashes(peaks: Peak[]): Fingerprint[] {
  const fingerprints: Fingerprint[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const anchor = peaks[i];

    // Find target peaks in the target zone
    let targetCount = 0;
    for (
      let j = i + 1;
      j < peaks.length && targetCount < TARGET_ZONE_SIZE;
      j++
    ) {
      const target = peaks[j];
      const timeDelta = target.time - anchor.time;

      // Skip if outside target zone
      if (timeDelta > MAX_TIME_DELTA) break;
      if (timeDelta < 1) continue;

      // Generate hash: combine frequencies and time delta
      // Hash = (f1 * 2^20) + (f2 * 2^10) + delta_t
      const f1 = Math.round(anchor.frequency / 10) & 0x3ff; // 10 bits
      const f2 = Math.round(target.frequency / 10) & 0x3ff; // 10 bits
      const dt = timeDelta & 0x3ff; // 10 bits

      const hash = (f1 << 20) | (f2 << 10) | dt;

      fingerprints.push({
        hash,
        timeOffset: anchor.time,
      });

      targetCount++;
    }
  }

  return fingerprints;
}

/**
 * Convert audio buffer to mono PCM samples at 44.1kHz
 * Input: ArrayBuffer containing audio data
 * Output: Float32Array of normalized samples (-1 to 1)
 */
export async function preprocessAudio(
  audioBuffer: ArrayBuffer,
): Promise<Float32Array> {
  // For browser: use Web Audio API to decode
  // For server: we receive pre-processed Float32Array

  // If audioBuffer is already Float32Array-like
  if (audioBuffer instanceof Float32Array) {
    return audioBuffer;
  }

  // Convert raw bytes to Float32Array assuming 16-bit PCM
  const dataView = new DataView(audioBuffer);
  const samples = new Float32Array(Math.floor(audioBuffer.byteLength / 2));

  for (let i = 0; i < samples.length; i++) {
    // Read 16-bit signed integer and normalize to -1 to 1
    const sample = dataView.getInt16(i * 2, true);
    samples[i] = sample / 32768;
  }

  return samples;
}

/**
 * Generate fingerprints from audio samples
 */
export function generateFingerprints(samples: Float32Array): Fingerprint[] {
  // Check minimum duration (1 second at downsampled rate)
  if (samples.length < 5000) {
    throw new Error("INSUFFICIENT_DATA: Audio must be at least 1 second long");
  }

  // Check for silence
  const rms = Math.sqrt(
    samples.reduce((sum, s) => sum + s * s, 0) / samples.length,
  );
  if (rms < 0.0005) {
    throw new Error("SILENCE_DETECTED: No audio signal detected");
  }

  // Generate spectrogram
  const spectrogram = generateSpectrogram(samples);

  // Extract peaks
  const peaks = extractPeaks(spectrogram);

  if (peaks.length < 10) {
    throw new Error("SILENCE_DETECTED: Insufficient audio features detected");
  }

  // Generate hashes
  const fingerprints = generateHashes(peaks);

  return fingerprints;
}

/**
 * Match fingerprints against a reference set
 * Returns confidence score (0-100)
 */
export function matchFingerprints(
  queryFingerprints: Fingerprint[],
  referenceFingerprints: Fingerprint[],
): number {
  if (queryFingerprints.length === 0 || referenceFingerprints.length === 0) {
    return 0;
  }

  // Create hash lookup for reference
  const refHashMap = new Map<number, number[]>();
  for (const fp of referenceFingerprints) {
    if (!refHashMap.has(fp.hash)) {
      refHashMap.set(fp.hash, []);
    }
    refHashMap.get(fp.hash)!.push(fp.timeOffset);
  }

  // Count matching hashes and calculate time offset histogram
  const offsetHistogram = new Map<number, number>();
  let matchCount = 0;

  for (const queryFp of queryFingerprints) {
    const refOffsets = refHashMap.get(queryFp.hash);
    if (refOffsets) {
      matchCount++;
      for (const refOffset of refOffsets) {
        const timeDiff = refOffset - queryFp.timeOffset;
        const bucket = Math.round(timeDiff / 5) * 5; // 5-frame buckets
        offsetHistogram.set(bucket, (offsetHistogram.get(bucket) || 0) + 1);
      }
    }
  }

  if (matchCount === 0) {
    return 0;
  }

  // Find peak in offset histogram (indicates consistent time alignment)
  let maxAlignedCount = 0;
  const counts = Array.from(offsetHistogram.values());
  for (let i = 0; i < counts.length; i++) {
    maxAlignedCount = Math.max(maxAlignedCount, counts[i]);
  }

  // Calculate confidence based on aligned matches
  const alignmentRatio = maxAlignedCount / queryFingerprints.length;
  const matchRatio = matchCount / queryFingerprints.length;

  // Combine ratios for final confidence
  const confidence = Math.min(
    100,
    (alignmentRatio * 70 + matchRatio * 30) * 100,
  );

  return confidence;
}

/**
 * Main fingerprinting function for audio blob
 */
export async function fingerprintAudio(
  audioData: Float32Array,
): Promise<Fingerprint[]> {
  return generateFingerprints(audioData);
}

export { FFT_SIZE, SAMPLE_RATE, HOP_SIZE };
