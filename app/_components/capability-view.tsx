import { getD1Database } from "../../db";
import {
  ActivityCreationError,
  resolveCapability,
  type LinkPurpose,
} from "../../src/activity-creation";
import { D1ActivityStore } from "../../src/d1-activity-store";

const labels: Record<LinkPurpose, string> = {
  organizer: "组织者管理",
  host: "主持控制台",
  participant: "参赛入口",
  display: "现场大屏",
  report: "活动报告",
};

export async function CapabilityView({
  token,
  purpose,
}: {
  token: string;
  purpose: LinkPurpose;
}) {
  let result;
  try {
    result = await resolveCapability(
      token,
      purpose,
      new D1ActivityStore(getD1Database()),
    );
  } catch (error) {
    if (
      !(error instanceof ActivityCreationError) ||
      error.code !== "invalid-capability"
    ) {
      throw error;
    }
  }

  if (!result) {
    return (
      <main className="surface">
        <div className="surface-card">
          <div className="surface-meta"><span>{labels[purpose]}</span></div>
          <h1>这个链接不可用</h1>
          <p className="hero-copy">链接可能无效，或不属于当前页面。请向活动组织者获取正确入口。</p>
        </div>
      </main>
    );
  }

  const { activity } = result;
  const start = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(activity.startsAt));

  return (
    <main className="surface">
      <div className="surface-card">
        <div className="surface-meta">
          <span>{labels[purpose]}</span>
          <span>候场中</span>
        </div>
        <h1>{activity.name}</h1>
        <p className="hero-copy">
          活动已创建并进入候场。正式开始前，可以安全检查现场入口与配置。
        </p>
        <div className="surface-info">
          <div><small>计划开始</small><b>{start}</b></div>
          <div><small>参赛规模</small><b>{activity.participantLimit} 人</b></div>
          <div><small>轮次</small><b>{activity.roundCount} 轮</b></div>
        </div>
      </div>
    </main>
  );
}
