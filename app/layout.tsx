import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import Navbar from "@/components/Navbar";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Bookified",
  description:
    "Transform your books into interactive AI conversations. Upload PDFs, and chat with your books using voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en">
        <body
          className="relative font-sans antialiased"
        >
          <ClerkProvider>
            <Navbar />
            {children}
            <Toaster />
          </ClerkProvider>
        </body>
      </html>
  );
}
