# Shazam-CPP Audio Fingerprinting Engine

A C++ implementation of audio fingerprinting based on the Avery Wang algorithm (the same approach used by Shazam).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    C++ Fingerprinting Engine                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────┐     │
│  │   FFT    │───▶│ Spectrogram  │───▶│ Peak Extractor │     │
│  │ (fft.hpp)│    │(spectrogram  │    │(peak_extractor │     │
│  │          │    │    .hpp)     │    │    .hpp)       │     │
│  └──────────┘    └──────────────┘    └───────┬────────┘     │
│                                              │              │
│                                              ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Fingerprint Generator & Matcher         │   │
│  │                   (fingerprint.hpp)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. FFT Module (`include/fft.hpp`)

- **Algorithm:** Cooley-Tukey radix-2 decimation-in-time FFT
- **Complexity:** O(n log n)
- **Features:**
  - In-place bit-reversal permutation
  - Butterfly operations with twiddle factors
  - Hann windowing to reduce spectral leakage
  - Magnitude spectrum computation

### 2. Spectrogram Generator (`include/spectrogram.hpp`)

- **Purpose:** Creates 2D time-frequency representation
- **Configuration:**
  - FFT Size: 4096 samples (for 44.1kHz) or 2048 (for lower sample rates)
  - Hop Size: 50% overlap
  - Output: Logarithmic scale (dB) for better peak detection

### 3. Peak Extractor (`include/peak_extractor.hpp`)

- **Purpose:** Identifies constellation points for fingerprinting
- **Algorithm:**
  - Local maximum detection in time-frequency neighborhood
  - Adaptive thresholding based on local energy
  - Configurable max peaks per frame

### 4. Fingerprint Generator & Matcher (`include/fingerprint.hpp`)

- **Hash Generation:**
  - Pairs anchor peaks with nearby target peaks
  - Hash format: `[freq1(10 bits)][freq2(10 bits)][delta_t(12 bits)]`
  - Based on Avery Wang's combinatorial hashing

- **Matching:**
  - Hash lookup for candidate matches
  - Time coherence verification using histogram voting
  - Confidence calculation based on aligned matches

## Building

### Prerequisites

- C++17 compatible compiler:
  - Windows: MinGW-w64 (g++) or Visual Studio 2019+
  - Linux/Mac: GCC 7+ or Clang 5+

### Quick Build (Windows)

```batch
cd engine
build.bat
```

### CMake Build

```bash
cd engine
mkdir build && cd build
cmake ..
cmake --build . --config Release
```

### Manual Build (g++)

```bash
g++ -std=c++17 -O2 -I include src/main.cpp -o bin/shazam_engine
```

## Usage

The engine communicates via stdin/stdout using JSON format.

### Generate Fingerprints

```bash
echo '{"samples":[0.1,-0.2,0.3,...], "sampleRate":44100}' | ./shazam_engine generate
```

**Input:**

```json
{
  "samples": [float array of audio samples, -1.0 to 1.0],
  "sampleRate": 44100
}
```

**Output:**

```json
{
  "fingerprints": [
    { "hash": 123456789, "timeOffset": 0 },
    { "hash": 987654321, "timeOffset": 1 }
  ],
  "peakCount": 150,
  "spectrogramFrames": 100
}
```

### Match Fingerprints

```bash
echo '{"query":[...], "reference":[...]}' | ./shazam_engine match
```

**Input:**

```json
{
  "query": [{"hash": 123, "timeOffset": 0}, ...],
  "reference": [{"hash": 456, "timeOffset": 0}, ...]
}
```

**Output:**

```json
{
  "matchCount": 50,
  "alignedMatches": 45,
  "confidence": 85.5
}
```

## Integration with Next.js

The C++ engine is called from the Next.js API via the bridge module:

```typescript
// shazam-app/src/lib/cpp-engine.ts
import { generateFingerprints, matchFingerprints } from "@/lib/cpp-engine";

// Generate fingerprints
const result = await generateFingerprints(audioSamples, 44100);

// Match fingerprints
const matchResult = await matchFingerprints(queryFPs, referenceFPs);
```

## Configuration

### Environment Variables

- `SHAZAM_ENGINE_PATH`: Custom path to the engine executable

### Audio Processing Constants

| Constant            | Value       | Description                 |
| ------------------- | ----------- | --------------------------- |
| FFT_SIZE            | 4096        | Window size for FFT         |
| HOP_SIZE            | 2048        | 50% overlap between frames  |
| PEAK_THRESHOLD      | -60 dB      | Minimum magnitude for peaks |
| MAX_PEAKS_PER_FRAME | 5           | Peak limit per time frame   |
| FAN_OUT             | 15          | Target peaks per anchor     |
| TARGET_ZONE         | 1-10 frames | Time range for target peaks |

## Performance

- Typical fingerprint generation: <1 second for 30 seconds of audio
- Memory efficient: streaming FFT computation
- Optimized hash matching with O(1) lookup

## References

1. Wang, Avery. "An Industrial Strength Audio Search Algorithm." ISMIR 2003.
2. Ellis, Daniel. "Robust Landmark-Based Audio Fingerprinting."
