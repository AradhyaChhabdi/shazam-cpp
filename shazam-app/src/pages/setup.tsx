import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import Link from "next/link";

interface HealthStatus {
  status: string;
  database: string;
  songsInDatabase: number;
  timestamp: string;
}

export default function SetupPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      setHealth(data);
    } catch (err) {
      setHealth({
        status: "error",
        database: "unknown",
        songsInDatabase: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const seedDatabase = async () => {
    setSeeding(true);
    setSeedResult(null);

    try {
      const response = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "seed-shazam-db" }),
      });

      const data = await response.json();

      if (response.ok) {
        setSeedResult({ success: true, message: data.message });
        checkHealth(); // Refresh health status
      } else {
        setSeedResult({ success: false, message: data.error });
      }
    } catch (err) {
      setSeedResult({ success: false, message: "Failed to seed database" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen py-8 px-4 pb-20">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              System Setup
            </h1>
            <p className="text-gray-400">
              Initialize and configure your Shazam-CPP instance
            </p>
          </div>

          {/* Health Status Card */}
          <div className="glass-card rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
              <svg
                className="w-5 h-5 mr-2 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              System Status
            </h2>

            {loading ? (
              <div className="flex items-center space-x-3 text-gray-400">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                <span>Checking system status...</span>
              </div>
            ) : health ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Database Connection</span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${
                      health.database === "connected"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {health.database}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Songs in Database</span>
                  <span className="text-white font-semibold">
                    {health.songsInDatabase}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Last Check</span>
                  <span className="text-gray-300 text-sm">
                    {new Date(health.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-red-400">Failed to check system status</p>
            )}

            <button
              onClick={checkHealth}
              disabled={loading}
              className="mt-4 text-primary hover:text-primary/80 text-sm flex items-center"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Status
            </button>
          </div>

          {/* Seed Database Card */}
          <div className="glass-card rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
              <svg
                className="w-5 h-5 mr-2 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
              Seed Database
            </h2>

            <p className="text-gray-400 mb-4">
              Populate the database with 30 sample songs including fingerprints.
              This will create an admin user and add classic songs to test the
              recognition system.
            </p>

            {seedResult && (
              <div
                className={`mb-4 p-3 rounded-lg ${
                  seedResult.success
                    ? "bg-green-500/20 border border-green-500/30 text-green-400"
                    : "bg-red-500/20 border border-red-500/30 text-red-400"
                }`}
              >
                {seedResult.message}
              </div>
            )}

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-yellow-400 text-sm flex items-start">
                <svg
                  className="w-5 h-5 mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>
                  Warning: This will delete all existing songs and reset the
                  database!
                </span>
              </p>
            </div>

            <button
              onClick={seedDatabase}
              disabled={seeding || health?.database !== "connected"}
              className="w-full bg-gradient-to-r from-accent to-primary text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {seeding ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  Seeding Database...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Seed Database with Sample Songs
                </>
              )}
            </button>
          </div>

          {/* Quick Links */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Quick Links
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/"
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition"
              >
                <svg
                  className="w-8 h-8 mx-auto mb-2 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span className="text-gray-300">Identify Music</span>
              </Link>
              <Link
                href="/songs"
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition"
              >
                <svg
                  className="w-8 h-8 mx-auto mb-2 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                <span className="text-gray-300">Browse Songs</span>
              </Link>
              <Link
                href="/admin/login"
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition"
              >
                <svg
                  className="w-8 h-8 mx-auto mb-2 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="text-gray-300">Admin Login</span>
              </Link>
              <a
                href="/api/health"
                target="_blank"
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition"
              >
                <svg
                  className="w-8 h-8 mx-auto mb-2 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span className="text-gray-300">Health API</span>
              </a>
            </div>
          </div>

          {/* Credentials Info */}
          {seedResult?.success && (
            <div className="glass-card rounded-xl p-6 mt-6 bg-primary/10 border border-primary/30">
              <h3 className="text-lg font-semibold text-white mb-3">
                Admin Credentials
              </h3>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                <p className="text-gray-300">
                  Username: <span className="text-primary">admin</span>
                </p>
                <p className="text-gray-300">
                  Password: <span className="text-primary">admin123</span>
                </p>
              </div>
              <p className="text-gray-400 text-sm mt-3">
                Use these credentials to login to the admin dashboard and upload
                new songs.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
