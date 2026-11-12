import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Central da plataforma | Kode",
  description: "Administre barbearias, planos e acessos da plataforma Kode.",
};

export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
