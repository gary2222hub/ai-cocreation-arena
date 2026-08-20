import { getD1Database } from "../../../../db";
import { D1LiveEventStore } from "../../../../src/d1-live-event-store";
import { getAnonymousReport, LiveEventError } from "../../../../src/live-event";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return Response.json(
      await getAnonymousReport((await params).token, new D1LiveEventStore(getD1Database())),
    );
  } catch (error) {
    if (error instanceof LiveEventError) {
      return Response.json({ error: "活动报告链接无效。" }, { status: 400 });
    }
    return Response.json({ error: "活动报告暂时不可用。" }, { status: 500 });
  }
}
