import { env } from "cloudflare:workers";

import { getD1Database } from "../../../../db";
import { D1LobbyStore } from "../../../../src/d1-lobby-store";
import { getHostLobby, LobbyError } from "../../../../src/lobby";
import { buildOpeningSpeechRequest, decodeOpeningSpeechAudio, openingSpeechEndpoint } from "../../../../src/opening-speech";

function speechError(error: unknown) {
  if (error instanceof LobbyError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return Response.json({ error: "语音开场暂时不可用，请复制开场词由主持人介绍。" }, { status: 503 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const lobby = await getHostLobby(
      (await params).token,
      new D1LobbyStore(getD1Database()),
      () => new Date(),
    );
    if (!env.MINIMAX_TOKEN_PLAN_KEY) {
      return Response.json(
        { error: "AI 语音尚未配置，请复制开场词由主持人介绍。" },
        { status: 503 },
      );
    }
    const response = await fetch(openingSpeechEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.MINIMAX_TOKEN_PLAN_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildOpeningSpeechRequest(lobby.activity.name)),
    });
    const payload = (await response.json()) as {
      data?: { audio?: string; status?: number };
      base_resp?: { status_code?: number };
    };
    if (!response.ok || payload.base_resp?.status_code !== 0 || !payload.data?.audio) {
      return Response.json(
        { error: "语音生成失败，请复制开场词由主持人介绍。" },
        { status: 502 },
      );
    }
    return new Response(decodeOpeningSpeechAudio(payload.data.audio), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return speechError(error);
  }
}
