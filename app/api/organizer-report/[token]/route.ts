import { getD1Database } from "../../../../db";
import { D1LiveEventStore } from "../../../../src/d1-live-event-store";
import { getFullReport, LiveEventError } from "../../../../src/live-event";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const report = await getFullReport(
      (await params).token,
      new D1LiveEventStore(getD1Database()),
      "organizer",
    );
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "content-type": "application/json;charset=utf-8",
        "content-disposition": "attachment; filename=ai-cocreation-arena-full-report.json",
      },
    });
  } catch (error) {
    if (error instanceof LiveEventError) return Response.json({ error: "组织者导出链接无效。" }, { status: 400 });
    return Response.json({ error: "组织者导出暂时不可用。" }, { status: 500 });
  }
}
