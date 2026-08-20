import { ReportLive } from "./report-live";

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  return <ReportLive token={(await params).token} />;
}
