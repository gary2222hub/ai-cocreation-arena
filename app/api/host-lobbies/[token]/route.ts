import { getD1Database } from "../../../../db";
import { D1LobbyStore } from "../../../../src/d1-lobby-store";
import {
  getHostLobby,
  lockRoster,
  LobbyError,
  removeSeat,
} from "../../../../src/lobby";

function hostError(error: unknown) {
  if (error instanceof LobbyError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.code === "invalid-entry" ? 400 : 409 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "请求内容无效。" }, { status: 400 });
  }
  return Response.json({ error: "主持服务暂时不可用。" }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return Response.json(
      await getHostLobby(
        (await params).token,
        new D1LobbyStore(getD1Database()),
        () => new Date(),
      ),
    );
  } catch (error) {
    return hostError(error);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return Response.json(
      await lockRoster(
        (await params).token,
        new D1LobbyStore(getD1Database()),
        () => new Date(),
      ),
    );
  } catch (error) {
    return hostError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LobbyError("invalid-entry", "请求内容无效。");
    }
    const input = parsed as { seatId?: string };
    await removeSeat(
      (await params).token,
      input.seatId ?? "",
      new D1LobbyStore(getD1Database()),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return hostError(error);
  }
}
