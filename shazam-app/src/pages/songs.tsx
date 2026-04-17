import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Layout from "@/components/Layout";
import StatusLabel from "@/components/StatusLabel";

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
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const isAdmin = session?.user?.isAdmin;

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

  const handleDeleteSong = async (songId: string, songTitle: string) => {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      `Delete "${songTitle}" from the library? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingSongId(songId);
    setError("");

    try {
      const response = await fetch(
        `/api/songs?id=${encodeURIComponent(songId)}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete song");
      }

      setSongs((prev) => prev.filter((song) => song.id !== songId));
    } catch (err: any) {
      setError(err.message || "Failed to delete song. Please try again.");
    } finally {
      setDeletingSongId(null);
    }
  };

  const handleDeleteAllSongs = async () => {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      "Delete ALL songs from the library? This action permanently clears the database catalog.",
    );
    if (!confirmed) return;

    setDeletingAll(true);
    setError("");

    try {
      const response = await fetch("/api/songs/delete-all", {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete songs");
      }

      setSongs([]);
    } catch (err: any) {
      setError(err.message || "Failed to delete songs. Please try again.");
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-56px)] py-10 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <StatusLabel>LIBRARY</StatusLabel>
              <h1 className="text-3xl font-semibold text-white mt-2 mb-1">
                Songs database
              </h1>
              <p className="text-sm text-resonate-dim">
                {songs.length} of {songs.length} tracks indexed
              </p>
            </div>

            <div className="w-72 space-y-2">
              {/* Search input */}
              <input
                type="text"
                placeholder="Search title, artist, album..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteAllSongs}
                  disabled={deletingAll || loading || songs.length === 0}
                  className="w-full px-4 py-2 text-sm text-red-300 border border-red-400/40 rounded-lg hover:bg-red-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingAll ? "Deleting all..." : "Delete all songs"}
                </button>
              )}
            </div>
          </div>

          {/* Genre tabs */}
          <div className="flex items-center gap-1 mb-6">
            <button
              onClick={() => setFilterGenre("")}
              className={`genre-pill ${filterGenre === "" ? "active" : ""}`}
            >
              All
            </button>
            {genres.map((genre) => (
              <button
                key={genre}
                onClick={() =>
                  setFilterGenre(filterGenre === genre ? "" : genre)
                }
                className={`genre-pill ${filterGenre === genre ? "active" : ""}`}
              >
                {genre}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="card-surface p-8 text-center">
              <p className="text-red-400 mb-3">{error}</p>
              <button
                onClick={fetchSongs}
                className="px-4 py-2 text-sm text-white border border-surface-border rounded-lg hover:bg-white/5 transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* Songs table */}
          {!loading && !error && (
            <div className="card-surface overflow-hidden">
              {filteredSongs.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-resonate-dim">
                    {songs.length === 0
                      ? "No songs in the database yet."
                      : "No results match your search."}
                  </p>
                </div>
              ) : (
                <table className="library-table">
                  <thead>
                    <tr>
                      <th className="w-16 text-center">#</th>
                      <th>TITLE</th>
                      <th>ALBUM</th>
                      <th>GENRE</th>
                      {isAdmin && <th className="text-right w-28">ACTIONS</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSongs.map((song, index) => (
                      <tr key={song.id}>
                        <td className="text-center text-resonate-dim text-sm font-mono">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <td>
                          <div>
                            <p className="text-white font-medium text-[15px]">
                              {song.title}
                            </p>
                            <p className="text-resonate-dim text-sm mt-0.5">
                              {song.artist}
                            </p>
                          </div>
                        </td>
                        <td className="text-resonate-dim text-sm">
                          {song.album}
                          {song.releaseYear && (
                            <span> · {song.releaseYear}</span>
                          )}
                        </td>
                        <td className="text-resonate-dim text-sm">
                          {song.genre || "—"}
                        </td>
                        {isAdmin && (
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteSong(song.id, song.title)
                              }
                              disabled={
                                deletingSongId === song.id || deletingAll
                              }
                              className="px-3 py-1.5 text-xs text-red-300 border border-red-400/40 rounded-md hover:bg-red-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingSongId === song.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
