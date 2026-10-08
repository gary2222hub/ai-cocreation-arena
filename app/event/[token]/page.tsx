import { ParticipantLobby } from "./participant-lobby";

export default async function ParticipantPage({ params }: { params: Promise<{ token: string }> }) {
  return <ParticipantLobby token={(await params).token} />;
}
