export interface ScoringBriefAnswer {
  anonymousLabel: string;
  v1: string;
  improvementPrompt: string;
  v2: string;
}

export function buildAdvanceWarning(stage: string, actionLabel: string) {
  const consequences: Record<string, string> = {
    lobby: "开始后名单将锁定，常规新参赛者不能再加入。",
    v1: "结束后不能提交或修改 V1；未保存的 V1 不会进入后续展示、投票或评分。",
    v2: "结束后不能提交或修改追加 Prompt 与 V2；未保存的作品不会进入匿名互评。",
    voting: "结束后不能再投票或改票；未投票者将失去本轮互评机会。",
    reveal: "推进后进入自由交流；自由交流不会自动结束。",
    discussion: "请确认现场交流确实结束。推进后将进入 AI 评分。",
    scoring: "公布后本轮评分进入榜单，不能返回修改。",
    results: "推进后上一轮正式结束，不能返回修改本轮内容和成绩。",
  };
  return `${actionLabel}？\n\n${consequences[stage] ?? "推进后，上一阶段内容立即锁定，不能返回。"}`;
}

export function rankForScore(rows: Array<{ score: number }>, index: number) {
  const score = rows[index]?.score;
  const firstIndex = rows.findIndex((row) => row.score === score);
  return firstIndex >= 0 ? firstIndex + 1 : index + 1;
}

export function buildOpeningScript(activityName: string) {
  return `大家早上好，欢迎来到${activityName}。\n\n今天，我们会一起完成两轮挑战。每一轮先提交第一版回答，再用一次追加 Prompt，让方案继续进化。之后会匿名互评、揭晓交流，并由 AI 完成评分。\n\n请大家留意主持人的口令。一个阶段结束后，内容会立即锁定；没有保存的回答，不能补交，也不会进入后续展示和计分。\n\n现在，请确认网络和自己的 Agent 都已经准备好。放轻松，尽情去想，也期待大家带走一个真正值得尝试的新点子。`;
}

export function buildAiScoringBrief(input: {
  roundNumber: number;
  title: string;
  prompt: string;
  answers: ScoringBriefAnswer[];
}) {
  const works = input.answers
    .map(
      (answer) =>
        `## 作品 ${answer.anonymousLabel}\nV1：${answer.v1 || "未提交"}\n追加 Prompt：${answer.improvementPrompt || "未提交"}\nV2：${answer.v2 || "未提交"}`,
    )
    .join("\n\n");

  return `你是“AI 共创竞技场”第 ${input.roundNumber} 轮的独立评委。请匿名、横向比较全部作品，并为每份作品给出 0–10 的整数分。\n\n评分原则：\n- 任务完成度与切题性：0–3分\n- 对协作机制或根因的洞察：0–3分\n- 可执行性：0–2分\n- 原创性、事实边界与风险意识：0–2分\n\n保持同一尺度，不得根据姓名、身份或写作风格猜测作者。若未提交关键内容，应显著扣分。\n\n本轮题目：${input.title}\n\n本轮完整 Prompt：\n${input.prompt}\n\n${works}\n\n只输出 JSON 数组，不要输出其他文字，格式为：[{"作品":"A","分数":8,"理由":"不超过30字"}]。必须覆盖全部作品。`;
}
