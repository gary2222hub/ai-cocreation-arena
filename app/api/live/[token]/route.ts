import { getD1Database } from "../../../../db";
import { D1LiveEventStore } from "../../../../src/d1-live-event-store";
import {
  getParticipantLiveEvent,
  LiveEventError,
  saveRoundEntry,
  saveVote,
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
  return Response.json({ error: "现场服务暂时不可用。" }, { status: 500 });
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
    const recoveryToken = typeof input.recoveryToken === "string" ? input.recoveryToken : "";
    const store = new D1LiveEventStore(getD1Database());
    if (input.action === "save-entry") {
      await saveRoundEntry(
        token,
        recoveryToken,
        {
          ...(input.v1 !== undefined ? { v1: input.v1 } : {}),
          ...(input.improvementPrompt !== undefined
            ? { improvementPrompt: input.improvementPrompt }
            : {}),
          ...(input.v2 !== undefined ? { v2: input.v2 } : {}),
        },
        store,
      );
    } else if (input.action === "vote") {
      await saveVote(
        token,
        recoveryToken,
        typeof input.candidateSeatId === "string" ? input.candidateSeatId : "",
        store,
      );
    } else if (input.action !== "snapshot") {
      throw new LiveEventError("invalid-entry", "未知的现场操作。");
    }
    return Response.json(await getParticipantLiveEvent(token, recoveryToken, store));
  } catch (error) {
    return liveError(error);
  }
}
