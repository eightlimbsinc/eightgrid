import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EightGrid",
  description: "Eight Limbs' collaborative database",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
