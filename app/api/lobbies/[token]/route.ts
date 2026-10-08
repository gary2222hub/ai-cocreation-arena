import { getD1Database } from "../../../../db";
import { D1LobbyStore } from "../../../../src/d1-lobby-store";
import {
  getParticipantLobby,
  heartbeat,
  joinLobby,
  LobbyError,
} from "../../../../src/lobby";

function lobbyError(error: unknown) {
  if (error instanceof LobbyError) {
    const conflict = [
      "duplicate-seat",
      "lobby-full",
      "roster-locked",
      "review-started",
    ].includes(error.code);
    return Response.json(
      { error: error.message, code: error.code },
      { status: conflict ? 409 : 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "请求内容无效。" }, { status: 400 });
  }
  return Response.json({ error: "候场服务暂时不可用。" }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return Response.json(
      await getParticipantLobby(
        (await params).token,
        new D1LobbyStore(getD1Database()),
      ),
    );
  } catch (error) {
    return lobbyError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LobbyError("invalid-entry", "请求内容无效。");
    }
    const input = parsed as Record<string, unknown>;
    const result = await joinLobby(
      {
        participantLinkToken: (await params).token,
        roomCode: String(input.roomCode ?? ""),
        nickname: String(input.nickname ?? ""),
        agentName: String(input.agentName ?? ""),
        recoveryToken:
          typeof input.recoveryToken === "string"
            ? input.recoveryToken
            : undefined,
      },
      {
        store: new D1LobbyStore(getD1Database()),
        now: () => new Date(),
        token: () => crypto.randomUUID(),
      },
    );
    return Response.json(result, { status: result.recovered ? 200 : 201 });
  } catch (error) {
    return lobbyError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LobbyError("invalid-entry", "请求内容无效。");
    }
    const input = parsed as { recoveryToken?: string };
    await heartbeat(
      (await params).token,
      input.recoveryToken ?? "",
      new D1LobbyStore(getD1Database()),
      () => new Date(),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return lobbyError(error);
  }
}
