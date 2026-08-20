"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  ActivityTemplate,
  CreateActivityInput,
  RoundConfiguration,
} from "../src/activity-creation";

const promptRound: RoundConfiguration = {
  title: "第一轮：把问题说清楚",
  prompt: "用 AI 重新定义这个问题，并给出可执行方案。",
  submitMinutes: 8,
  reviewMinutes: 5,
  scoring: "互评票数（可选外部评分加分）",
  award: "第一轮最佳",
};

const secondPromptRound: RoundConfiguration = {
  title: "第二轮：识别风险并改进",
  prompt: "识别方案最关键的风险，并给出具体应对措施。",
  submitMinutes: 8,
  reviewMinutes: 5,
  scoring: "互评票数（可选外部评分加分）",
  award: "两轮总冠军",
};

const blankRound: RoundConfiguration = {
  title: "第一轮",
  prompt: "",
  submitMinutes: 8,
  reviewMinutes: 5,
  scoring: "",
  award: "",
};

type CreatedLinks = Record<
  "organizer" | "host" | "participant" | "display" | "report",
  string
>;

interface CreatedActivity {
  links: CreatedLinks;
  activity: { roomCode: string };
}

export function CreateActivityForm() {
  const [template, setTemplate] = useState<ActivityTemplate>("prompt-challenge");
  const [activityName, setActivityName] = useState("AI Prompt 挑战赛");
  const [participantLimit, setParticipantLimit] = useState(8);
  const [rounds, setRounds] = useState<RoundConfiguration[]>([
    { ...promptRound },
    { ...secondPromptRound },
  ]);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedActivity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("copy");
    if (!token) return;
    void fetch(`/api/organizer-activities/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { name?: string; participantLimit?: number; template?: ActivityTemplate; rounds?: RoundConfiguration[]; error?: string };
        if (!response.ok || !payload.rounds) throw new Error(payload.error ?? "活动配置复制失败。");
        setRounds(payload.rounds.map((round) => ({ ...round })));
        setTemplate(payload.template ?? "blank");
        setActivityName(`${payload.name ?? "AI Prompt 挑战赛"}（副本）`);
        setParticipantLimit(payload.participantLimit ?? 8);
        setCopyNotice("已复制上一场的题面与轮次配置；参赛者、成绩和投票不会复制。");
        setTimeout(() => setCopyNotice(""), 6_000);
      })
      .catch((error) => setError(error instanceof Error ? error.message : "活动配置复制失败。"));
  }, []);

  function selectTemplate(next: ActivityTemplate) {
    setTemplate(next);
    setRounds(
      next === "prompt-challenge"
        ? [{ ...promptRound }, { ...secondPromptRound }]
        : [{ ...blankRound }],
    );
  }

  function updateRound(index: number, patch: Partial<RoundConfiguration>) {
    setRounds((current) =>
      current.map((round, roundIndex) =>
        roundIndex === index ? { ...round, ...patch } : round,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const input: CreateActivityInput = {
      template,
      name: activityName,
      startsAt: new Date(String(form.get("startsAt"))).toISOString(),
      endsAt: new Date(String(form.get("endsAt"))).toISOString(),
      participantLimit,
      rounds,
    };

    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as {
        links?: CreatedLinks;
        activity?: { roomCode: string };
        error?: string;
      };
      if (!response.ok || !payload.links || !payload.activity) {
        throw new Error(payload.error ?? "创建失败，请检查配置。 ");
      }
      setCreated({ links: payload.links, activity: payload.activity });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const labels: Record<keyof CreatedLinks, string> = {
      organizer: "组织者管理入口",
      host: "主持人入口",
      participant: "参赛者入口",
      display: "现场大屏入口",
      report: "活动报告入口",
    };
    return (
      <section className="panel success-panel" aria-live="polite">
        <span className="status-pill">已创建 · 候场中</span>
        <h2>活动已经准备好</h2>
        <p>请妥善保存组织者入口。每个链接只开放对应页面与数据。</p>
        <div className="created-room-code"><small>现场房间码</small><b>{created.activity.roomCode}</b><span>参赛者需要活动链接与此房间码才能加入。</span></div>
        <div className="link-list">
          {(Object.keys(labels) as Array<keyof CreatedLinks>).map((key) => (
            <a key={key} href={created.links[key]} className="capability-link">
              <span>{labels[key]}</span>
              <small>{created.links[key]}</small>
              <b aria-hidden="true">↗</b>
            </a>
          ))}
        </div>
      </section>
    );
  }

  return (
    <form className="panel creation-form" onSubmit={submit}>
      {copyNotice && <p className="form-success" role="status">{copyNotice}</p>}
      <section className="form-section">
        <div className="section-heading"><span>01</span><div><h2>选择起点</h2><p>模板只提供一个清晰起点，后续内容仍可调整。</p></div></div>
        <div className="template-grid">
          <button type="button" className={`template-card ${template === "prompt-challenge" ? "selected" : ""}`} onClick={() => selectTemplate("prompt-challenge")}>
            <span className="template-icon">⌘</span><b>AI Prompt 挑战赛</b><small>默认两轮简化流程，适合明天直接运行。</small>
          </button>
          <button type="button" className={`template-card ${template === "blank" ? "selected" : ""}`} onClick={() => selectTemplate("blank")}>
            <span className="template-icon">＋</span><b>空白共创</b><small>保留结构，从自己的题目开始。</small>
          </button>
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading"><span>02</span><div><h2>活动信息</h2><p>活动规模支持 3–12 人。</p></div></div>
        <div className="field-grid">
          <label className="full">活动名称<input name="name" value={activityName} onChange={(event) => setActivityName(event.target.value)} required /></label>
          <label>计划开始<input name="startsAt" type="datetime-local" required /></label>
          <label>计划结束<input name="endsAt" type="datetime-local" required /></label>
          <label>参赛人数<input name="participantLimit" type="number" min="3" max="12" value={participantLimit} onChange={(event) => setParticipantLimit(Number(event.target.value))} required /></label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading"><span>03</span><div><h2>轮次配置</h2><p>每轮都需要题目、阶段时长、计分方式与奖项。</p></div></div>
        <div className="round-list">
          {rounds.map((round, index) => (
            <div className="round-card" key={index}>
              <div className="round-title"><b>第 {index + 1} 轮</b>{rounds.length > 1 && <button type="button" onClick={() => setRounds((current) => current.filter((_, i) => i !== index))}>移除</button>}</div>
              <div className="field-grid">
                <label className="full">轮次标题<input value={round.title} onChange={(event) => updateRound(index, { title: event.target.value })} required /></label>
                <label className="full">题目<textarea value={round.prompt} onChange={(event) => updateRound(index, { prompt: event.target.value })} required /></label>
                <label>提交时间（分钟）<input type="number" min="1" value={round.submitMinutes} onChange={(event) => updateRound(index, { submitMinutes: Number(event.target.value) })} required /></label>
                <label>互评时间（分钟）<input type="number" min="1" value={round.reviewMinutes} onChange={(event) => updateRound(index, { reviewMinutes: Number(event.target.value) })} required /></label>
                <label className="full">计分方式<input value={round.scoring} onChange={(event) => updateRound(index, { scoring: event.target.value })} required /></label>
                <label className="full">奖项<input value={round.award} onChange={(event) => updateRound(index, { award: event.target.value })} required /></label>
              </div>
            </div>
          ))}
        </div>
        {rounds.length < 2 && <button className="secondary-button" type="button" onClick={() => setRounds((current) => [...current, { ...blankRound, title: `第${current.length + 1}轮` }])}>＋ 添加一轮</button>}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-footer"><p>创建后活动将进入候场状态，不会自动开始。</p><button className="primary-button" disabled={submitting}>{submitting ? "正在创建…" : "创建活动"}</button></div>
    </form>
  );
}
