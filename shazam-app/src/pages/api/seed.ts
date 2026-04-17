import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";
import User from "@/models/User";
import bcrypt from "bcryptjs";

// Generate pseudo-random fingerprints based on song characteristics
function generateFingerprints(seed: number, count: number = 500) {
  const fingerprints = [];
  let state = seed;

  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state;
  };

  for (let i = 0; i < count; i++) {
    const f1 = (random() % 400) + 30;
    const f2 = (random() % 400) + 30;
    const dt = (random() % 180) + 10;

    const hash = ((f1 & 0x3ff) << 20) | ((f2 & 0x3ff) << 10) | (dt & 0x3ff);

    fingerprints.push({
      hash,
      timeOffset: i * 2 + (random() % 3),
    });
  }

  return fingerprints;
}

const sampleSongs = [
  {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    releaseYear: 1975,
    genre: "Rock",
    seed: 12345,
  },
  {
    title: "Billie Jean",
    artist: "Michael Jackson",
    album: "Thriller",
    releaseYear: 1983,
    genre: "Pop",
    seed: 23456,
  },
  {
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    album: "Nevermind",
    releaseYear: 1991,
    genre: "Rock",
    seed: 34567,
  },
  {
    title: "Shape of You",
    artist: "Ed Sheeran",
    album: "÷ (Divide)",
    releaseYear: 2017,
    genre: "Pop",
    seed: 45678,
  },
  {
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    releaseYear: 2020,
    genre: "Pop",
    seed: 56789,
  },
  {
    title: "Hotel California",
    artist: "Eagles",
    album: "Hotel California",
    releaseYear: 1977,
    genre: "Rock",
    seed: 67890,
  },
  {
    title: "Sweet Child O' Mine",
    artist: "Guns N' Roses",
    album: "Appetite for Destruction",
    releaseYear: 1987,
    genre: "Rock",
    seed: 78901,
  },
  {
    title: "Rolling in the Deep",
    artist: "Adele",
    album: "21",
    releaseYear: 2011,
    genre: "Pop",
    seed: 89012,
  },
  {
    title: "Uptown Funk",
    artist: "Mark Ronson ft. Bruno Mars",
    album: "Uptown Special",
    releaseYear: 2015,
    genre: "Pop",
    seed: 90123,
  },
  {
    title: "Lose Yourself",
    artist: "Eminem",
    album: "8 Mile Soundtrack",
    releaseYear: 2002,
    genre: "Hip-Hop",
    seed: 11111,
  },
  {
    title: "Mr. Brightside",
    artist: "The Killers",
    album: "Hot Fuss",
    releaseYear: 2004,
    genre: "Rock",
    seed: 22222,
  },
  {
    title: "Bad Guy",
    artist: "Billie Eilish",
    album: "When We All Fall Asleep, Where Do We Go?",
    releaseYear: 2019,
    genre: "Pop",
    seed: 33333,
  },
  {
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    album: "Led Zeppelin IV",
    releaseYear: 1971,
    genre: "Rock",
    seed: 44444,
  },
  {
    title: "Thinking Out Loud",
    artist: "Ed Sheeran",
    album: "x (Multiply)",
    releaseYear: 2014,
    genre: "Pop",
    seed: 55555,
  },
  {
    title: "Take On Me",
    artist: "a-ha",
    album: "Hunting High and Low",
    releaseYear: 1985,
    genre: "Pop",
    seed: 66666,
  },
  {
    title: "Wonderwall",
    artist: "Oasis",
    album: "(What's the Story) Morning Glory?",
    releaseYear: 1995,
    genre: "Rock",
    seed: 77777,
  },
  {
    title: "Don't Stop Believin'",
    artist: "Journey",
    album: "Escape",
    releaseYear: 1981,
    genre: "Rock",
    seed: 88888,
  },
  {
    title: "Despacito",
    artist: "Luis Fonsi ft. Daddy Yankee",
    album: "Vida",
    releaseYear: 2017,
    genre: "Latin",
    seed: 99999,
  },
  {
    title: "Someone Like You",
    artist: "Adele",
    album: "21",
    releaseYear: 2011,
    genre: "Pop",
    seed: 10101,
  },
  {
    title: "Thriller",
    artist: "Michael Jackson",
    album: "Thriller",
    releaseYear: 1982,
    genre: "Pop",
    seed: 20202,
  },
  {
    title: "Levels",
    artist: "Avicii",
    album: "True",
    releaseYear: 2011,
    genre: "Electronic",
    seed: 21212,
  },
  {
    title: "Africa",
    artist: "Toto",
    album: "Toto IV",
    releaseYear: 1982,
    genre: "Rock",
    seed: 40404,
  },
  {
    title: "Poker Face",
    artist: "Lady Gaga",
    album: "The Fame",
    releaseYear: 2008,
    genre: "Pop",
    seed: 50505,
  },
  {
    title: "Shallow",
    artist: "Lady Gaga & Bradley Cooper",
    album: "A Star Is Born Soundtrack",
    releaseYear: 2018,
    genre: "Pop",
    seed: 60606,
  },
  {
    title: "Crazy in Love",
    artist: "Beyoncé ft. Jay-Z",
    album: "Dangerously in Love",
    releaseYear: 2003,
    genre: "R&B",
    seed: 70707,
  },
  {
    title: "November Rain",
    artist: "Guns N' Roses",
    album: "Use Your Illusion I",
    releaseYear: 1991,
    genre: "Rock",
    seed: 80808,
  },
  {
    title: "Hallelujah",
    artist: "Jeff Buckley",
    album: "Grace",
    releaseYear: 1994,
    genre: "Rock",
    seed: 91919,
  },
  {
    title: "Starboy",
    artist: "The Weeknd ft. Daft Punk",
    album: "Starboy",
    releaseYear: 2016,
    genre: "R&B",
    seed: 12321,
  },
  {
    title: "Halo",
    artist: "Beyoncé",
    album: "I Am... Sasha Fierce",
    releaseYear: 2008,
    genre: "Pop",
    seed: 23432,
  },
  {
    title: "Party Rock Anthem",
    artist: "LMFAO",
    album: "Sorry for Party Rocking",
    releaseYear: 2011,
    genre: "Electronic",
    seed: 34543,
  },
];

/**
 * POST /api/seed - Seed the database with sample songs
 * WARNING: This will delete all existing data!
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require a secret key for safety
  const { secret } = req.body;
  if (secret !== "seed-shazam-db") {
    return res.status(401).json({ error: "Invalid secret key" });
  }

  try {
    await dbConnect();

    // Clear existing data
    await Song.deleteMany({});
    await User.deleteMany({});

    // Create admin user
    const hashedPassword = await bcrypt.hash("admin123", 12);
    await User.create({
      username: "admin",
      passwordHash: hashedPassword,
      role: "admin",
      isAdmin: true,
    });

    // Seed songs
    const songsToInsert = sampleSongs.map((songData) => ({
      title: songData.title,
      artist: songData.artist,
      album: songData.album,
      releaseYear: songData.releaseYear,
      genre: songData.genre,
      fingerprints: generateFingerprints(songData.seed),
      uploadedAt: new Date(),
    }));

    await Song.insertMany(songsToInsert);

    return res.json({
      success: true,
      message: `Database seeded with ${sampleSongs.length} songs`,
      adminCredentials: {
        username: "admin",
        password: "admin123",
      },
    });
  } catch (error: any) {
    console.error("Seed error:", error);
    return res.status(500).json({ error: "Failed to seed database" });
  }
}
