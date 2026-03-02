import type { Metadata } from "next";

import "@/app/globals.css";
import { Topbar } from "@/components/site/Topbar";

export const metadata: Metadata = {
  title: "Kunst Museum - Felix Ipfling",
  description: "Ein begehbares digitales Museum: Werke entdecken, anschauen, kaufen.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="page">
          <Topbar />
          {children}
        </div>
      </body>
    </html>
  );
}
