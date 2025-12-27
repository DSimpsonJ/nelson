import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider, ToastRenderer } from "./context/ToastContext";

export const metadata: Metadata = {
  title: "Nelson",
  description: "Your AI strength coach who trains with you",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans">
      <body className="antialiased font-sans">
        <ToastProvider>
          {children}
          <ToastRenderer />
        </ToastProvider>
      </body>
    </html>
  );
}