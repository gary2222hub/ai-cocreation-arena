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
    discussion: "请确认现场交流确实结束。推进后可选择补充外部评分，或直接按互评结果公布。",
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
  return `大家好，欢迎来到${activityName}。这是一场用 AI 共同思考、共同选择的两轮共创活动。\n\n请先确认你已经在候场页面填写昵称和正在使用的 AI 工具名称。主持人启动后，页面会显示本轮题目。请在自己的 AI 工具中完成思考，把第一版回答粘贴回页面，并点击保存。\n\n接下来，你会获得一次追加 Prompt 的机会。请用它改进原方案，再保存 V2。之后我们会匿名阅读作品：每人投出一票最喜欢的作品，不能投给自己。\n\n主持人会手动推进每个阶段。阶段一旦结束，未保存的内容就不能补交，也不能修改。身份揭晓后，我们会自由交流，并按互评票数公布结果。\n\n现在请检查网络、打开你的 AI 工具，准备开始。`;
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
