import { HostLobby } from "./host-lobby";

export default async function HostPage({ params }: { params: Promise<{ token: string }> }) {
  return <HostLobby token={(await params).token} />;
}
