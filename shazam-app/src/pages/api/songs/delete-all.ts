import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";

/**
 * DELETE /api/songs/delete-all - Remove all songs (Admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();

    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?.isAdmin) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await Song.deleteMany({});

    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} songs`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting songs:", error);
    return res.status(500).json({ error: "Failed to delete songs" });
  }
}
