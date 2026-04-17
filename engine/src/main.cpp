/**
 * Shazam-CPP Audio Fingerprinting Engine
 * 
 * Algorithm: Avery Wang-style audio fingerprinting
 * 1. Spectrogram generation via STFT (FFT_SIZE=1024, HOP_SIZE=256)
 * 2. Peak extraction (constellation mapping, neighborhood=10)
 * 3. Hash generation from peak pairs (freq/10 encoding, 10+10+10 bit hash)
 */

#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <cmath>
#include <complex>
#include <algorithm>
#include <unordered_map>
#include <cstdint>

// ============================================================
// Constants — MUST match fingerprint.ts exactly
// ============================================================
static const int    FFT_SIZE                = 1024;
static const int    SAMPLE_RATE             = 11025;
static const int    HOP_SIZE                = FFT_SIZE / 4;  // 256, 75% overlap
static const double MIN_FREQUENCY           = 300.0;
static const double MAX_FREQUENCY           = 5000.0;
static const int    PEAK_NEIGHBORHOOD_SIZE  = 10;
static const double MIN_AMPLITUDE_THRESHOLD = 0.005;
static const int    TARGET_ZONE_SIZE        = 5;
static const int    MAX_TIME_DELTA          = 200;

static const double PI = 3.14159265358979323846;

// ============================================================
// Structures
// ============================================================
struct Peak {
    int    time;
    double frequency;  // in Hz (not bin index)
    double amplitude;
};

struct Fingerprint {
    uint32_t hash;
    int32_t  timeOffset;
};

// ============================================================
// FFT — Cooley-Tukey radix-2 (matches TS fft() exactly)
// ============================================================
void fft(std::vector<double>& real, std::vector<double>& imag) {
    int n = (int)real.size();
    if (n <= 1) return;

    // Bit reversal permutation
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if (i < j) {
            std::swap(real[i], real[j]);
            std::swap(imag[i], imag[j]);
        }
    }

    // Cooley-Tukey iterative FFT
    for (int len = 2; len <= n; len *= 2) {
        int halfLen = len / 2;
        double angle = (2.0 * PI) / len;
        double wReal = cos(angle);
        double wImag = -sin(angle);

        for (int i = 0; i < n; i += len) {
            double curReal = 1.0;
            double curImag = 0.0;

            for (int j = 0; j < halfLen; j++) {
                int evenIdx = i + j;
                int oddIdx  = i + j + halfLen;

                double tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
                double tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];

                real[oddIdx] = real[evenIdx] - tReal;
                imag[oddIdx] = imag[evenIdx] - tImag;
                real[evenIdx] += tReal;
                imag[evenIdx] += tImag;

                double newReal = curReal * wReal - curImag * wImag;
                curImag = curReal * wImag + curImag * wReal;
                curReal = newReal;
            }
        }
    }
}

// ============================================================
// Hann window (matches TS applyHannWindow())
// ============================================================
std::vector<double> applyHannWindow(const std::vector<double>& samples) {
    std::vector<double> windowed(samples.size());
    int n = (int)samples.size();
    for (int i = 0; i < n; i++) {
        double multiplier = 0.5 * (1.0 - cos((2.0 * PI * i) / (n - 1)));
        windowed[i] = samples[i] * multiplier;
    }
    return windowed;
}

// ============================================================
// Spectrogram generation (matches TS generateSpectrogram())
// ============================================================
// Returns spectrogram[frame][bin] = magnitude (raw, NOT dB)
std::vector<std::vector<double>> generateSpectrogram(const std::vector<double>& samples) {
    int numFrames = ((int)samples.size() - FFT_SIZE) / HOP_SIZE + 1;
    std::vector<std::vector<double>> spectrogram;

    for (int frame = 0; frame < numFrames; frame++) {
        int start = frame * HOP_SIZE;

        // Extract frame
        std::vector<double> frameData(samples.begin() + start,
                                      samples.begin() + start + FFT_SIZE);

        // Apply Hann window
        std::vector<double> windowed = applyHannWindow(frameData);

        // Prepare FFT buffers
        std::vector<double> real(FFT_SIZE, 0.0);
        std::vector<double> imag(FFT_SIZE, 0.0);
        for (int i = 0; i < FFT_SIZE; i++) {
            real[i] = windowed[i];
        }

        // Perform FFT
        fft(real, imag);

        // Calculate magnitude spectrum (only positive frequencies)
        // Using sqrt(re^2 + im^2) — same as TS
        std::vector<double> magnitude(FFT_SIZE / 2);
        for (int i = 0; i < FFT_SIZE / 2; i++) {
            magnitude[i] = sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        spectrogram.push_back(magnitude);
    }

    return spectrogram;
}

// ============================================================
// Helper: bin <-> frequency conversion (matches TS)
// ============================================================
double binToFrequency(int bin) {
    return (double)bin * SAMPLE_RATE / FFT_SIZE;
}

int frequencyToBin(double freq) {
    return (int)round(freq * FFT_SIZE / SAMPLE_RATE);
}

// ============================================================
// Peak extraction (matches TS extractPeaks() exactly)
// ============================================================
std::vector<Peak> extractPeaks(const std::vector<std::vector<double>>& spectrogram) {
    std::vector<Peak> peaks;
    int minBin = frequencyToBin(MIN_FREQUENCY);
    int maxBin = frequencyToBin(MAX_FREQUENCY);
    int numFrames = (int)spectrogram.size();

    for (int time = PEAK_NEIGHBORHOOD_SIZE;
         time < numFrames - PEAK_NEIGHBORHOOD_SIZE;
         time++) {

        const std::vector<double>& frame = spectrogram[time];
        int frameLen = (int)frame.size();

        int freqStart = std::max(minBin, PEAK_NEIGHBORHOOD_SIZE);
        int freqEnd   = std::min(maxBin, frameLen - PEAK_NEIGHBORHOOD_SIZE);

        for (int freq = freqStart; freq < freqEnd; freq++) {
            double amplitude = frame[freq];

            // Skip if below threshold
            if (amplitude < MIN_AMPLITUDE_THRESHOLD) continue;

            // Check if local maximum in neighborhood
            bool isLocalMax = true;
            for (int dt = -PEAK_NEIGHBORHOOD_SIZE;
                 dt <= PEAK_NEIGHBORHOOD_SIZE && isLocalMax;
                 dt++) {
                for (int df = -PEAK_NEIGHBORHOOD_SIZE;
                     df <= PEAK_NEIGHBORHOOD_SIZE && isLocalMax;
                     df++) {
                    if (dt == 0 && df == 0) continue;

                    int neighborTime = time + dt;
                    int neighborFreq = freq + df;

                    if (neighborTime >= 0 && neighborTime < numFrames &&
                        neighborFreq >= 0 && neighborFreq < frameLen) {
                        if (spectrogram[neighborTime][neighborFreq] >= amplitude) {
                            isLocalMax = false;
                        }
                    }
                }
            }

            if (isLocalMax) {
                Peak p;
                p.time = time;
                p.frequency = binToFrequency(freq);  // Store in Hz, same as TS
                p.amplitude = amplitude;
                peaks.push_back(p);
            }
        }
    }

    // Sort peaks by time
    std::sort(peaks.begin(), peaks.end(),
              [](const Peak& a, const Peak& b) { return a.time < b.time; });

    return peaks;
}

// ============================================================
// Hash generation (matches TS generateHashes() exactly)
// ============================================================
std::vector<Fingerprint> generateHashes(const std::vector<Peak>& peaks) {
    std::vector<Fingerprint> fingerprints;

    for (size_t i = 0; i < peaks.size(); i++) {
        const Peak& anchor = peaks[i];
        int targetCount = 0;

        for (size_t j = i + 1; j < peaks.size() && targetCount < TARGET_ZONE_SIZE; j++) {
            const Peak& target = peaks[j];
            int timeDelta = target.time - anchor.time;

            // Skip if outside target zone
            if (timeDelta > MAX_TIME_DELTA) break;
            if (timeDelta < 1) continue;

            // Generate hash: combine frequencies and time delta
            // Hash = (f1 * 2^20) + (f2 * 2^10) + delta_t
            // EXACTLY matching TS: Math.round(freq/10) & 0x3FF
            uint32_t f1 = ((uint32_t)round(anchor.frequency / 10.0)) & 0x3FF;  // 10 bits
            uint32_t f2 = ((uint32_t)round(target.frequency / 10.0)) & 0x3FF;  // 10 bits
            uint32_t dt = ((uint32_t)timeDelta) & 0x3FF;                        // 10 bits

            uint32_t hash = (f1 << 20) | (f2 << 10) | dt;

            Fingerprint fp;
            fp.hash = hash;
            fp.timeOffset = anchor.time;
            fingerprints.push_back(fp);

            targetCount++;
        }
    }

    return fingerprints;
}

// ============================================================
// Fingerprint matching (matches TS matchFingerprints() exactly)
// ============================================================
struct MatchResult {
    int    matchCount;
    int    alignedMatches;
    double confidence;
};

MatchResult matchFingerprintsImpl(
    const std::vector<Fingerprint>& query,
    const std::vector<Fingerprint>& reference
) {
    MatchResult result;
    result.matchCount = 0;
    result.alignedMatches = 0;
    result.confidence = 0.0;

    if (query.empty() || reference.empty()) return result;

    // Create hash lookup for reference
    std::unordered_map<uint32_t, std::vector<int32_t>> refHashMap;
    for (const auto& fp : reference) {
        refHashMap[fp.hash].push_back(fp.timeOffset);
    }

    // Count matching hashes and calculate time offset histogram
    std::unordered_map<int, int> offsetHistogram;
    int matchCount = 0;

    for (const auto& qfp : query) {
        auto it = refHashMap.find(qfp.hash);
        if (it != refHashMap.end()) {
            matchCount++;
            for (int32_t refOffset : it->second) {
                int timeDiff = refOffset - qfp.timeOffset;
                // 5-frame buckets, same as TS: Math.round(timeDiff / 5) * 5
                int bucket = (int)round((double)timeDiff / 5.0) * 5;
                offsetHistogram[bucket]++;
            }
        }
    }

    result.matchCount = matchCount;

    if (matchCount == 0) return result;

    // Find peak in offset histogram
    int maxAlignedCount = 0;
    for (const auto& pair : offsetHistogram) {
        if (pair.second > maxAlignedCount) {
            maxAlignedCount = pair.second;
        }
    }
    result.alignedMatches = maxAlignedCount;

    // Calculate confidence — same formula as TS
    double alignmentRatio = (double)maxAlignedCount / (double)query.size();
    double matchRatio     = (double)matchCount / (double)query.size();

    double confidence = (alignmentRatio * 70.0 + matchRatio * 30.0) * 100.0;
    if (confidence > 100.0) confidence = 100.0;

    result.confidence = confidence;
    return result;
}

// ============================================================
// Simple JSON parsing (for our specific input format)
// ============================================================
class JSONParser {
public:
    static std::vector<double> parseDoubleArray(const std::string& json, const std::string& key) {
        std::vector<double> result;
        std::string searchKey = "\"" + key + "\"";
        size_t keyPos = json.find(searchKey);
        if (keyPos == std::string::npos) return result;

        size_t bracketPos = json.find('[', keyPos);
        if (bracketPos == std::string::npos) return result;

        // Find matching closing bracket (handle nested arrays)
        int depth = 1;
        size_t endPos = bracketPos + 1;
        while (endPos < json.size() && depth > 0) {
            if (json[endPos] == '[') depth++;
            else if (json[endPos] == ']') depth--;
            endPos++;
        }
        if (depth != 0) return result;
        endPos--; // point to ']'

        std::string arrayStr = json.substr(bracketPos + 1, endPos - bracketPos - 1);
        std::stringstream ss(arrayStr);
        std::string token;
        while (std::getline(ss, token, ',')) {
            try {
                // Trim whitespace
                size_t start = token.find_first_not_of(" \t\n\r");
                if (start == std::string::npos) continue;
                token = token.substr(start);
                double val = std::stod(token);
                result.push_back(val);
            } catch (...) {}
        }

        return result;
    }

    static int parseInt(const std::string& json, const std::string& key, int defaultVal = 0) {
        std::string searchKey = "\"" + key + "\"";
        size_t keyPos = json.find(searchKey);
        if (keyPos == std::string::npos) return defaultVal;

        size_t colonPos = json.find(':', keyPos);
        if (colonPos == std::string::npos) return defaultVal;

        size_t numStart = colonPos + 1;
        while (numStart < json.size() && (json[numStart] == ' ' || json[numStart] == '\t'))
            numStart++;

        size_t numEnd = numStart;
        if (numEnd < json.size() && json[numEnd] == '-') numEnd++;
        while (numEnd < json.size() && isdigit(json[numEnd])) numEnd++;

        try {
            return std::stoi(json.substr(numStart, numEnd - numStart));
        } catch (...) {
            return defaultVal;
        }
    }

    static std::vector<Fingerprint> parseFingerprints(const std::string& json, const std::string& key) {
        std::vector<Fingerprint> result;
        std::string searchKey = "\"" + key + "\"";
        size_t keyPos = json.find(searchKey);
        if (keyPos == std::string::npos) return result;

        size_t pos = json.find('[', keyPos);
        if (pos == std::string::npos) return result;

        while (true) {
            size_t objStart = json.find('{', pos);
            if (objStart == std::string::npos) break;

            size_t objEnd = json.find('}', objStart);
            if (objEnd == std::string::npos) break;

            std::string objStr = json.substr(objStart, objEnd - objStart + 1);

            // Parse hash (could be large, use unsigned)
            uint32_t hash = 0;
            size_t hashPos = objStr.find("\"hash\"");
            if (hashPos != std::string::npos) {
                size_t hColonPos = objStr.find(':', hashPos);
                if (hColonPos != std::string::npos) {
                    size_t hStart = hColonPos + 1;
                    while (hStart < objStr.size() && objStr[hStart] == ' ') hStart++;
                    try {
                        hash = (uint32_t)std::stoul(objStr.substr(hStart));
                    } catch (...) {}
                }
            }

            int32_t timeOffset = 0;
            size_t toPos = objStr.find("\"timeOffset\"");
            if (toPos != std::string::npos) {
                size_t toColonPos = objStr.find(':', toPos);
                if (toColonPos != std::string::npos) {
                    size_t toStart = toColonPos + 1;
                    while (toStart < objStr.size() && objStr[toStart] == ' ') toStart++;
                    try {
                        timeOffset = (int32_t)std::stoi(objStr.substr(toStart));
                    } catch (...) {}
                }
            }

            Fingerprint fp;
            fp.hash = hash;
            fp.timeOffset = timeOffset;
            result.push_back(fp);

            pos = objEnd + 1;

            // Check if we've reached the end of the array
            size_t nextObj = json.find('{', pos);
            size_t arrayEnd = json.find(']', pos);
            if (arrayEnd != std::string::npos && (nextObj == std::string::npos || arrayEnd < nextObj)) {
                break;
            }
        }

        return result;
    }
};

// ============================================================
// Read all stdin
// ============================================================
std::string readStdin() {
    std::stringstream buffer;
    buffer << std::cin.rdbuf();
    return buffer.str();
}

// ============================================================
// Command: generate
// ============================================================
void cmdGenerate(const std::string& input) {
    std::vector<double> samples = JSONParser::parseDoubleArray(input, "samples");

    if (samples.empty()) {
        std::cout << "{\"error\":\"No samples provided\",\"fingerprints\":[],\"peakCount\":0}" << std::endl;
        return;
    }

    // Check minimum duration
    if ((int)samples.size() < 5000) {
        std::cout << "{\"error\":\"Audio too short\",\"fingerprints\":[],\"peakCount\":0}" << std::endl;
        return;
    }

    // Check for silence
    double sumSq = 0;
    for (double s : samples) sumSq += s * s;
    double rms = sqrt(sumSq / samples.size());
    if (rms < 0.0005) {
        std::cout << "{\"error\":\"SILENCE_DETECTED\",\"fingerprints\":[],\"peakCount\":0}" << std::endl;
        return;
    }

    // Generate spectrogram
    std::vector<std::vector<double>> spectrogram = generateSpectrogram(samples);

    if (spectrogram.empty()) {
        std::cout << "{\"error\":\"Audio too short for spectrogram\",\"fingerprints\":[],\"peakCount\":0}" << std::endl;
        return;
    }

    // Extract peaks
    std::vector<Peak> peaks = extractPeaks(spectrogram);

    // Generate fingerprints
    std::vector<Fingerprint> fingerprints = generateHashes(peaks);

    // Output JSON
    std::cout << "{\"fingerprints\":[";
    for (size_t i = 0; i < fingerprints.size(); i++) {
        if (i > 0) std::cout << ",";
        std::cout << "{\"hash\":" << fingerprints[i].hash
                  << ",\"timeOffset\":" << fingerprints[i].timeOffset << "}";
    }
    std::cout << "],\"peakCount\":" << peaks.size()
              << ",\"spectrogramFrames\":" << spectrogram.size() << "}" << std::endl;
}

// ============================================================
// Command: match
// ============================================================
void cmdMatch(const std::string& input) {
    std::vector<Fingerprint> query = JSONParser::parseFingerprints(input, "query");
    std::vector<Fingerprint> reference = JSONParser::parseFingerprints(input, "reference");

    if (query.empty()) {
        std::cout << "{\"error\":\"No query fingerprints\",\"matchCount\":0,\"alignedMatches\":0,\"confidence\":0}" << std::endl;
        return;
    }
    if (reference.empty()) {
        std::cout << "{\"error\":\"No reference fingerprints\",\"matchCount\":0,\"alignedMatches\":0,\"confidence\":0}" << std::endl;
        return;
    }

    MatchResult result = matchFingerprintsImpl(query, reference);

    std::cout << "{\"matchCount\":" << result.matchCount
              << ",\"alignedMatches\":" << result.alignedMatches
              << ",\"confidence\":" << result.confidence << "}" << std::endl;
}

// ============================================================
// Main
// ============================================================
void printUsage() {
    std::cerr << "Shazam-CPP Audio Fingerprinting Engine (v2 - TS-compatible)\n\n"
              << "Usage:\n"
              << "  shazam_engine generate    Generate fingerprints from audio\n"
              << "  shazam_engine match       Match fingerprints\n"
              << "\nInput/output via stdin/stdout in JSON format.\n"
              << "\nConfig: FFT=" << FFT_SIZE << " HOP=" << HOP_SIZE
              << " RATE=" << SAMPLE_RATE << " PEAK_RANGE=" << PEAK_NEIGHBORHOOD_SIZE
              << " TARGETS=" << TARGET_ZONE_SIZE << "\n";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printUsage();
        return 1;
    }

    std::string command = argv[1];
    std::string input = readStdin();

    if (command == "generate") {
        cmdGenerate(input);
    } else if (command == "match") {
        cmdMatch(input);
    } else {
        printUsage();
        return 1;
    }

    return 0;
}
