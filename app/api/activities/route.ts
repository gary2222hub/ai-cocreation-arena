import { getD1Database } from "../../../db";
import {
  ActivityCreationError,
  createActivity,
} from "../../../src/activity-creation";
import { D1ActivityStore } from "../../../src/d1-activity-store";

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new ActivityCreationError(
        "invalid-configuration",
        "请求内容无效，请检查活动配置。",
      );
    }
    const result = await createActivity(input, {
      store: new D1ActivityStore(getD1Database()),
      now: () => new Date(),
      token: () => crypto.randomUUID(),
      baseUrl: new URL(request.url).origin,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ActivityCreationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    return Response.json({ error: "创建失败，请稍后重试。" }, { status: 500 });
  }
}
