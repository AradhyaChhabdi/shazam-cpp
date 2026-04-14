import Link from "next/link";
import { useSession } from "next-auth/react";

export default function Navigation() {
  const { data: session } = useSession();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <svg
              className="w-8 h-8 text-primary"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            <span className="text-xl font-bold gradient-text">Shazam-CPP</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center space-x-6">
            <Link
              href="/"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Identify
            </Link>
            <Link
              href="/songs"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Database
            </Link>
            {session?.user?.isAdmin ? (
              <Link
                href="/admin/upload"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Upload
              </Link>
            ) : (
              <Link
                href="/admin/login"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
