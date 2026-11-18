import StockChart from "@/components/StockChart";

export default function StockPage({ params }: { params: { ticker: string } }) {
  return <StockChart ticker={decodeURIComponent(params.ticker)} />;
}
