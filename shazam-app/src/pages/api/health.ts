import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";
import { checkEngineAvailable, getEnginePath } from "@/lib/cpp-engine";

/**
 * GET /api/health - Health check endpoint
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await dbConnect();
    const songCount = await Song.countDocuments();

    // Check if C++ engine is available
    const engineAvailable = await checkEngineAvailable();

    return res.json({
      status: engineAvailable ? "healthy" : "degraded",
      database: "connected",
      songsInDatabase: songCount,
      cppEngine: engineAvailable ? "available" : "not found",
      cppEnginePath: getEnginePath(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
