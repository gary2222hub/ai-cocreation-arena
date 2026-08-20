"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { LiveEventSnapshot, LiveStage } from "../../../src/live-event";
import { buildAdvanceWarning, buildAiScoringBrief, rankForScore } from "../../../src/live-guidance";
import { FormattedPrompt } from "../../_components/formatted-prompt";

const nextLabels: Record<LiveStage, string> = {
  lobby: "启动第一版",
  v1: "结束 V1，进入 V2",
  v2: "结束 V2，进入匿名互评",
  voting: "结束投票并揭晓身份",
  reveal: "开始自由交流",
  discussion: "结束自由交流，进入评分",
  scoring: "公布本轮结果",
  results: "启动下一轮",
  complete: "活动已经完成",
};

export function HostLive({ token }: { token: string }) {
  const [data, setData] = useState<LiveEventSnapshot | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [scoringBriefCopied, setScoringBriefCopied] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/host-live/${token}`, { cache: "no-store" });
    const payload = (await response.json()) as LiveEventSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "主持状态暂时不可用。");
    setData(payload);
    return payload;
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "主持状态暂时不可用。")),
      0,
    );
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const progress = useMemo(() => {
    if (!data) return "";
    if (data.activity.stage === "v1") return `${data.answers.filter((answer) => answer.v1).length} / ${data.seats.length} 已保存 V1`;
    if (data.activity.stage === "v2") return `${data.answers.filter((answer) => answer.improvementPrompt && answer.v2).length} / ${data.seats.length} 已保存 V2`;
    if (data.activity.stage === "voting") return `${data.votes.length} / ${data.seats.length} 已投票`;
    if (data.activity.stage === "scoring") return `${data.scores.length} / ${data.seats.length} 已评分`;
    return `${data.seats.length} 名参赛者`;
  }, [data]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/host-live/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as LiveEventSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "主持操作失败。");
    setData(payload);
  }

  async function advance() {
    if (!data || data.activity.stage === "complete") return;
    const confirmed = window.confirm(buildAdvanceWarning(data.activity.stage, nextLabels[data.activity.stage]));
    if (!confirmed) return;
    setWorking(true);
    setError("");
    try {
      await post({ action: "advance" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "阶段推进失败。");
    } finally {
      setWorking(false);
    }
  }

  async function saveScores(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const missing = data.seats.some((seat) => !/^\d+$/.test(String(form.get(seat.id) ?? "")));
    if (missing) {
      setError("请为每个作品填写 0–10 的整数评分。");
      return;
    }
    setWorking(true);
    setError("");
    try {
      for (const seat of data.seats) {
        await post({ action: "score", seatId: seat.id, score: Number(form.get(seat.id)) });
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "评分保存失败。");
    } finally {
      setWorking(false);
    }
  }

  async function copyScoringBrief() {
    if (!data?.activity.round) return;
    await navigator.clipboard.writeText(buildAiScoringBrief({
      roundNumber: data.activity.roundNumber,
      title: data.activity.round.title,
      prompt: data.activity.round.prompt,
      answers: data.answers,
    }));
    setScoringBriefCopied(true);
    window.setTimeout(() => setScoringBriefCopied(false), 1_500);
  }

  if (!data) {
    return <main className="surface"><div className="surface-card"><p>{error || "正在同步主持状态…"}</p></div></main>;
  }

  const { activity } = data;
  const resultsDone = activity.stage === "results" && activity.roundNumber === activity.roundCount;
  const buttonLabel = resultsDone ? "完成活动并公布总成绩" : nextLabels[activity.stage];

  return (
    <main className="live-shell host-live">
      <header className="live-header host-live-header">
        <div><p className="eyebrow">HOST · ROUND {activity.roundNumber} / {activity.roundCount}</p><h1>{activity.stageLabel}</h1><p>{activity.round?.title}</p></div>
        <div className="host-progress"><small>现场进度</small><b>{progress}</b></div>
      </header>

      <section className="host-live-grid">
        <div className="live-section">
          <div className="section-intro"><small>本轮 Prompt</small><FormattedPrompt prompt={activity.round?.prompt ?? ""} /></div>

          {(activity.stage === "v1" || activity.stage === "v2" || activity.stage === "voting") && (
            <div className="compact-progress-list">
              {data.seats.map((seat) => {
                const answer = data.answers.find((candidate) => candidate.seatId === seat.id);
                const ready = activity.stage === "v1"
                  ? Boolean(answer?.v1)
                  : activity.stage === "v2"
                    ? Boolean(answer?.improvementPrompt && answer?.v2)
                    : data.votes.some((vote) => vote.voterSeatId === seat.id);
                return <div key={seat.id}><span>{seat.nickname}<small>{seat.agentName}</small></span><b className={ready ? "ready" : "waiting"}>{ready ? "已完成" : "等待中"}</b></div>;
              })}
            </div>
          )}

          {["reveal", "discussion"].includes(activity.stage) && (
            <div className="answer-grid host-answer-grid">
              {data.answers.map((answer) => (
                <article className="answer-card" key={answer.seatId}>
                  <div className="answer-title"><b>{answer.nickname} · {answer.agentName}</b><span>作品 {answer.anonymousLabel}</span></div>
                  <div className="answer-content"><div><small>V1</small><p>{answer.v1 || "未提交"}</p></div><div><small>追加 Prompt</small><p>{answer.improvementPrompt || "未提交"}</p></div><div><small>V2</small><p>{answer.v2 || "未提交"}</p></div></div>
                </article>
              ))}
            </div>
          )}

          {activity.stage === "scoring" && (
            <form className="score-list" onSubmit={saveScores} key={activity.roundIndex}>
              <div className="ai-scoring-guide">
                <b>使用你自己的 AI 工具评分</b>
                <p>复制匿名评分材料，发送给你选择的 AI 服务或已接入的自有 API；再把返回的分数填入下方。公共版本不会调用任何默认模型账户。</p>
                <button type="button" className="secondary-button" onClick={() => void copyScoringBrief()}>{scoringBriefCopied ? "评分材料已复制" : "复制匿名评分材料"}</button>
              </div>
              {data.seats.map((seat) => (
                <label key={seat.id}><span>作品 {data.answers.find((answer) => answer.seatId === seat.id)?.anonymousLabel} · {seat.nickname}<small>{seat.agentName}</small></span><input aria-label={`${seat.nickname} 的 AI 评分`} name={seat.id} type="number" min={0} max={10} step={1} defaultValue={data.scores.find((score) => score.seatId === seat.id)?.score} required /></label>
              ))}
              <button className="secondary-button" disabled={working}>{working ? "正在保存…" : "保存评分结果"}</button>
              <p>简单规则：单轮成绩 = AI 评分（0–10）+ 获得的互评票数。</p>
            </form>
          )}

          {activity.stage === "results" && <HostResults title={`第 ${activity.roundNumber} 轮结果`} rows={data.results.map((row) => ({ ...row, score: row.roundScore }))} />}
          {activity.stage === "complete" && <><HostResults title="两轮总成绩" rows={data.totals.map((row) => ({ ...row, score: row.totalScore }))} /><HostAwards awards={data.awards} /></>}
        </div>

        <aside className="host-control-card">
          <p className="eyebrow">MANUAL CONTROL</p>
          <h2>人工掌握时间</h2>
          <p>请使用现场计时器口头提醒。点击下方按钮后，当前阶段立即结束并锁定，不能返回。</p>
          {activity.stage === "discussion" && <div className="manual-note">自由交流不会自动结束。确认现场交流完成后再点击结束。</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {activity.stage !== "complete" && (
            <button className="primary-button" disabled={working || (activity.stage === "scoring" && data.scores.length < data.seats.length)} onClick={() => void advance()}>
              {working ? "正在处理…" : buttonLabel}
            </button>
          )}
          {activity.stage === "scoring" && data.scores.length < data.seats.length && <small>保存全部评分后才能公布结果。</small>}
        </aside>
      </section>
    </main>
  );
}

function HostAwards({ awards }: { awards: LiveEventSnapshot["awards"] }) {
  return <div className="host-result-block award-section"><h2>全员奖项</h2><div className="award-grid">{awards.map((award) => <div key={award.seatId}><span>{award.title}</span><b>{award.nickname}</b><small>{award.agentName}</small></div>)}</div></div>;
}

function HostResults({ title, rows }: { title: string; rows: Array<{ seatId: string; nickname: string; agentName: string; score: number; aiScore?: number; votes?: number }> }) {
  return <div className="host-result-block"><h2>{title}</h2><div className="result-list">{rows.map((row, index) => <div className="result-row" key={row.seatId}><strong>{rankForScore(rows, index)}</strong><div><b>{row.nickname}</b><small>{row.agentName}</small></div>{row.aiScore !== undefined && <small>AI {row.aiScore} + 互评 {row.votes}</small>}<span>{row.score} 分</span></div>)}</div></div>;
}
