# Shazam-CPP: Audio Fingerprint Music Recognition System

<div align="center">

![Version](https://img.shields.io/badge/version-2.1-blue)
![Group](https://img.shields.io/badge/Group-32-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

A high-performance audio fingerprinting system designed to identify musical tracks from short user-recorded audio samples.

</div>

## 🎵 Features

- **Audio Recording**: Browser-based recording via Web Audio API (max 20 seconds)
- **Audio Fingerprinting**: FFT-based spectrogram analysis and constellation hashing
- **Song Matching**: Top-5 results with confidence scores (75% threshold)
- **Admin Dashboard**: Secure song upload and database management
- **Real-time Visualization**: Recording progress and waveform display
- **Responsive Design**: Works on desktop and mobile browsers

## 🛠️ Tech Stack

| Component        | Technology                               |
| ---------------- | ---------------------------------------- |
| Frontend         | Next.js 14 (React), TailwindCSS          |
| Backend          | Next.js API Routes, TypeScript           |
| Database         | MongoDB                                  |
| Audio Processing | Web Audio API, Custom FFT Implementation |
| Authentication   | NextAuth.js                              |

## 📋 Requirements

- **Node.js** v18.0 or higher
- **MongoDB** v6.0 or higher (local or MongoDB Atlas)
- **Modern Browser** (Chrome, Firefox, Edge)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

Edit `.env.local` in the frontend directory:

```env
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/shazam-cpp

# NextAuth Configuration
NEXTAUTH_SECRET=your-super-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3000

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### 3. Start MongoDB

**Option A: Local MongoDB**

```bash
mongod --dbpath /path/to/data/db
```

**Option B: MongoDB Atlas**

- Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
- Get your connection string and update `MONGODB_URI` in `.env.local`

### 4. Seed the Database

The database needs to be seeded with sample songs for the app to work.

**Option A: Using the API (Recommended)**

```bash
# Start the development server first
npm run dev

# Then in another terminal or browser, call the seed API:
curl -X POST http://localhost:3000/api/seed -H "Content-Type: application/json" -d '{"secret":"seed-shazam-db"}'
```

**Option B: Using the script**

```bash
npm run seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 Usage

### Identifying Songs

1. Navigate to the home page
2. Click the microphone button to start recording
3. Hold your device near the music source (speakers, etc.)
4. Recording will auto-stop after 20 seconds, or click to stop early
5. View matching results with confidence scores

### Admin Functions

1. Navigate to `/admin/login`
2. Login with credentials:
   - **Username:** admin
   - **Password:** admin123
3. Upload new songs with MP3/WAV files
4. View and manage the song database

## 🔌 API Endpoints

| Endpoint        | Method | Description                     |
| --------------- | ------ | ------------------------------- |
| `/api/identify` | POST   | Submit audio for identification |
| `/api/songs`    | GET    | List all songs in database      |
| `/api/songs`    | POST   | Add new song (admin only)       |
| `/api/health`   | GET    | Health check endpoint           |
| `/api/seed`     | POST   | Seed database with sample data  |

### Example: Identify Song

```javascript
const response = await fetch("/api/identify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ audioData: [...float32Array] }),
});

const result = await response.json();
// { status: 'match', results: [{ title, artist, confidence }] }
```

## 📊 Project Structure

```
frontend/
├── src/
│   ├── components/      # React components
│   │   ├── Layout.tsx
│   │   └── Navigation.tsx
│   ├── lib/
│   │   ├── mongodb.ts   # Database connection
│   │   └── fingerprint.ts # Audio fingerprinting engine
│   ├── models/          # MongoDB schemas
│   │   ├── Song.ts
│   │   └── User.ts
│   ├── pages/
│   │   ├── api/         # API routes
│   │   │   ├── identify.ts
│   │   │   ├── songs.ts
│   │   │   ├── health.ts
│   │   │   ├── seed.ts
│   │   │   └── auth/[...nextauth].ts
│   │   ├── admin/
│   │   │   ├── login.tsx
│   │   │   └── upload.tsx
│   │   ├── songs.tsx    # Database listing
│   │   └── index.tsx    # Home/Recording page
│   └── styles/
│       └── globals.css
├── scripts/
│   └── seed-database.mjs
├── .env.local           # Environment variables
├── package.json
└── README.md
```

## 🔧 Fingerprinting Algorithm

The system implements the Avery Wang-style audio fingerprinting algorithm:

1. **Preprocessing**: Convert audio to mono PCM at 44.1kHz
2. **Spectrogram**: Apply STFT with 4096-sample Hann window
3. **Peak Detection**: Extract local maxima (constellation points)
4. **Hashing**: Generate hash pairs from peak combinations
5. **Matching**: Compare hashes with time-offset alignment

### Performance

| Duration | Processing Time | Fingerprints |
| -------- | --------------- | ------------ |
| 1s       | ~25ms           | ~100         |
| 5s       | ~75ms           | ~400         |
| 10s      | ~125ms          | ~800         |
| 20s      | ~250ms          | ~1600        |

## 🔐 Security Features

- **Input Validation**: All API endpoints sanitize inputs (XSS prevention)
- **Authentication**: JWT-based admin authentication
- **Access Control**: Only admins can upload songs
- **Rate Limiting**: 4MB payload limit on identify endpoint
- **Error Handling**: User-friendly error messages

## 🐛 Troubleshooting

### "Access Denied: Please enable microphone permissions"

- Check browser settings to allow microphone access
- Ensure using HTTPS in production

### "No match found"

- Ensure database is seeded with songs
- Record closer to the audio source
- Try recording a longer sample

### MongoDB Connection Error

- Verify MongoDB is running
- Check `MONGODB_URI` in `.env.local`
- Ensure network access if using Atlas

### Build Errors

```bash
# Clear cache and reinstall
rm -rf .next node_modules
npm install
npm run dev
```

## 📄 License

MIT License - See LICENSE file for details.

## 👥 Group 32

| Role                    | Responsibility              |
| ----------------------- | --------------------------- |
| Alpha Manager           | Project Lead & Architecture |
| Core Developers         | Full-Stack Implementation   |
| Database Administrators | Data Management             |

---

<div align="center">
  <strong>Shazam-CPP v2.1</strong> | Built with ❤️ by Group 32
</div>
