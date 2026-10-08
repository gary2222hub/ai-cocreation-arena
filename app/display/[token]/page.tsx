import { DisplayLive } from "./display-live";

export default async function DisplayPage({ params }: { params: Promise<{ token: string }> }) {
  return <DisplayLive token={(await params).token} />;
}
