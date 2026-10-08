import { CapabilityView } from "../../_components/capability-view";

export default async function OrganizerPage({ params }: { params: Promise<{ token: string }> }) {
  return <CapabilityView token={(await params).token} purpose="organizer" />;
}
