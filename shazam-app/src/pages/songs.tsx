import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  releaseYear: number | null;
  genre: string;
  uploadedAt: string;
  fingerprintCount: number;
}

export default function SongsPage() {
  const { data: session } = useSession();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const isAdmin = session?.user?.isAdmin;

  const handleDelete = async (songId: string) => {
    if (!confirm("Are you sure you want to delete this song?")) return;
    setDeleting(songId);
    try {
      const response = await fetch(`/api/songs?id=${songId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSongs(songs.filter((s) => s.id !== songId));
      } else {
        alert("Failed to delete song");
      }
    } catch (err) {
      alert("Failed to delete song");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      const response = await fetch("/api/songs");
      const data = await response.json();

      if (data.success) {
        setSongs(data.songs);
      } else {
        setError("Failed to load songs");
      }
    } catch (err) {
      setError("Failed to load songs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Get unique genres for filter
  const genres = [...new Set(songs.map((s) => s.genre).filter(Boolean))];

  // Filter songs
  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.album.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGenre = !filterGenre || song.genre === filterGenre;

    return matchesSearch && matchesGenre;
  });

  return (
    <Layout>
      <div className="min-h-screen py-8 px-4 pb-20">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              Song Database
            </h1>
            <p className="text-gray-400">
              Browse all songs in our fingerprint database
            </p>
          </div>

          {/* Search and Filter */}
          <div className="glass-card rounded-xl p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search Input */}
              <div className="flex-1">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search songs, artists, albums..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Genre Filter */}
              <div className="md:w-48">
                <select
                  value={filterGenre}
                  onChange={(e) => setFilterGenre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All Genres</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {songs.length}
              </div>
              <div className="text-gray-400 text-sm">Total Songs</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">
                {[...new Set(songs.map((s) => s.artist))].length}
              </div>
              <div className="text-gray-400 text-sm">Artists</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {[...new Set(songs.map((s) => s.album).filter(Boolean))].length}
              </div>
              <div className="text-gray-400 text-sm">Albums</div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {genres.length}
              </div>
              <div className="text-gray-400 text-sm">Genres</div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-400">Loading songs...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="glass-card rounded-xl p-6 text-center">
              <svg
                className="w-12 h-12 text-red-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-red-400">{error}</p>
              <button
                onClick={fetchSongs}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* Songs Grid */}
          {!loading && !error && (
            <>
              {filteredSongs.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <svg
                    className="w-16 h-16 text-gray-500 mx-auto mb-4"
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
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {songs.length === 0 ? "No Songs Yet" : "No Results Found"}
                  </h3>
                  <p className="text-gray-400">
                    {songs.length === 0
                      ? "The database is empty. Add some songs to get started!"
                      : "Try adjusting your search or filter criteria."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredSongs.map((song) => (
                    <div
                      key={song.id}
                      className="glass-card rounded-xl p-4 hover:ring-2 hover:ring-primary/50 transition"
                    >
                      <div className="flex items-start space-x-4">
                        {/* Album Art Placeholder */}
                        <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-8 h-8 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-semibold truncate">
                            {song.title}
                          </h3>
                          <p className="text-gray-300 text-sm truncate">
                            {song.artist}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {song.album && (
                              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                                {song.album}
                              </span>
                            )}
                            {song.releaseYear && (
                              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                                {song.releaseYear}
                              </span>
                            )}
                            {song.genre && (
                              <span className="text-xs text-primary bg-primary/20 px-2 py-0.5 rounded">
                                {song.genre}
                              </span>
                            )}
                            <span className="text-xs text-green-400 bg-green-400/20 px-2 py-0.5 rounded">
                              {song.fingerprintCount.toLocaleString()}{" "}
                              fingerprints
                            </span>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(song.id)}
                              disabled={deleting === song.id}
                              className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {deleting === song.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Results count */}
              {filteredSongs.length > 0 && (
                <p className="text-center text-gray-400 text-sm mt-6">
                  Showing {filteredSongs.length} of {songs.length} songs
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
