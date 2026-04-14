import { ReactNode } from "react";
import Navigation from "./Navigation";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="pt-16">{children}</main>
      <footer className="fixed bottom-0 left-0 right-0 py-4 text-center text-gray-500 text-sm">
        <p>Shazam-CPP v2.1 | Group 32</p>
      </footer>
    </div>
  );
}
