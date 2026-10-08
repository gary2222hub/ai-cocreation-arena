import { getD1Database } from "../../../../db";
import { D1LiveEventStore } from "../../../../src/d1-live-event-store";
import {
  advanceLiveEvent,
  getHostLiveEvent,
  LiveEventError,
  saveAiScore,
  saveHistoricalAiScore,
} from "../../../../src/live-event";

function liveError(error: unknown) {
  if (error instanceof LiveEventError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.code === "invalid-entry" || error.code === "invalid-seat" ? 400 : 409 },
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
    const token = (await params).token;
    return Response.json(
      await getHostLiveEvent(token, new D1LiveEventStore(getD1Database())),
    );
  } catch (error) {
    return liveError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LiveEventError("invalid-entry", "请求内容无效。");
    }
    const input = parsed as Record<string, unknown>;
    const token = (await params).token;
    const store = new D1LiveEventStore(getD1Database());
    if (input.action === "advance") {
      await advanceLiveEvent(token, store);
    } else if (input.action === "score") {
      await saveAiScore(
        token,
        typeof input.seatId === "string" ? input.seatId : "",
        Number(input.score),
        store,
      );
    } else if (input.action === "rescore") {
      await saveHistoricalAiScore(
        token,
        Number(input.roundIndex),
        typeof input.seatId === "string" ? input.seatId : "",
        Number(input.score),
        store,
      );
    } else {
      throw new LiveEventError("invalid-entry", "未知的主持操作。");
    }
    return Response.json(await getHostLiveEvent(token, store));
  } catch (error) {
    return liveError(error);
  }
}
