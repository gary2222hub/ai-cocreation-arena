import { getD1Database } from "../../../../db";
import { resolveOrganizerActivity, ActivityCreationError } from "../../../../src/activity-creation";
import { D1ActivityStore } from "../../../../src/d1-activity-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const activity = await resolveOrganizerActivity(
      (await params).token,
      new D1ActivityStore(getD1Database()),
    );
    return Response.json({
      name: activity.name,
      template: activity.template,
      participantLimit: activity.participantLimit,
      rounds: activity.rounds,
    });
  } catch (error) {
    if (error instanceof ActivityCreationError) return Response.json({ error: "复制链接无效。" }, { status: 400 });
    return Response.json({ error: "活动配置暂时不可用。" }, { status: 500 });
  }
}
