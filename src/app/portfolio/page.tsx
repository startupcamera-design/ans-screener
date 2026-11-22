import PortfolioManager from "@/components/PortfolioManager";

export const metadata = {
  title: "Portofolio & Aksi Besok · ANS Screener",
};

export default function PortfolioPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PortfolioManager />
    </main>
  );
}