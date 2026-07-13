import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { appUrl } from "@/lib/payments";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "Rezio — rezerwacje online bez prowizji",
    template: "%s | Rezio",
  },
  description:
    "System rezerwacji dla obiektów noclegowych: silnik rezerwacji, channel manager, płatności online i panel recepcji. Abonament zamiast prowizji.",
  openGraph: {
    siteName: "Rezio",
    locale: "pl_PL",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
