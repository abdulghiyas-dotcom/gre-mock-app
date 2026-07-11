import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRE Mock Test Platform",
  description: "Full-length GRE mock tests and targeted practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-testbg text-testink antialiased">{children}</body>
    </html>
  );
}
