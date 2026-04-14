import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";

// These are the titles of the seeded sample songs that need to be removed
const seededSongTitles = [
  "Bohemian Rhapsody",
  "Billie Jean",
  "Smells Like Teen Spirit",
  "Shape of You",
  "Blinding Lights",
  "Hotel California",
  "Sweet Child O' Mine",
  "Rolling in the Deep",
  "Uptown Funk",
  "Lose Yourself",
  "Mr. Brightside",
  "Bad Guy",
  "Stairway to Heaven",
  "Thinking Out Loud",
  "Take On Me",
  "Wonderwall",
  "Don't Stop Believin'",
  "Despacito",
  "Someone Like You",
  "Thriller",
  "Levels",
  "Africa",
  "Poker Face",
  "Shallow",
  "Crazy in Love",
  "November Rain",
  "Hallelujah",
  "Starboy",
  "Halo",
  "Party Rock Anthem",
];

/**
 * POST /api/cleanup
 * Remove seeded sample songs from database
 *
 * Optional: ?action=duplicates to remove duplicate songs
 * Optional: ?action=no-fingerprints to remove songs without fingerprints
 * Optional: ?action=all to remove all songs
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();

    const { action } = req.query;

    // Delete all songs
    if (action === "all") {
      const result = await Song.deleteMany({});
      return res.json({
        success: true,
        message: `Deleted all ${result.deletedCount} songs`,
        deletedCount: result.deletedCount,
      });
    }

    // Remove songs without fingerprints
    if (action === "no-fingerprints") {
      const result = await Song.deleteMany({
        $or: [
          { fingerprints: { $exists: false } },
          { fingerprints: { $size: 0 } },
          { fingerprints: null },
        ],
      });

      const remainingCount = await Song.countDocuments();

      return res.json({
        success: true,
        message: `Removed ${result.deletedCount} songs without fingerprints`,
        deletedCount: result.deletedCount,
        remainingSongsCount: remainingCount,
      });
    }

    if (action === "duplicates") {
      // Find and remove duplicate songs (keep only one of each title+artist combo)
      const songs = await Song.find({}).lean();
      const seen = new Map<string, string>(); // key -> first _id
      const toDelete: string[] = [];

      for (const song of songs as any[]) {
        const key = `${song.title}|||${song.artist}`.toLowerCase();
        if (seen.has(key)) {
          toDelete.push(song._id.toString());
        } else {
          seen.set(key, song._id.toString());
        }
      }

      if (toDelete.length > 0) {
        await Song.deleteMany({ _id: { $in: toDelete } });
      }

      return res.json({
        success: true,
        message: `Removed ${toDelete.length} duplicate songs`,
        duplicatesRemoved: toDelete.length,
      });
    }

    // Default action: remove seeded songs
    const result = await Song.deleteMany({
      title: { $in: seededSongTitles },
    });

    // Get remaining songs count
    const remainingCount = await Song.countDocuments();

    return res.json({
      success: true,
      message: `Removed ${result.deletedCount} seeded sample songs`,
      seededSongsRemoved: result.deletedCount,
      remainingSongsCount: remainingCount,
    });
  } catch (error: any) {
    console.error("Cleanup error:", error);
    return res.status(500).json({ error: "Failed to cleanup database" });
  }
}
