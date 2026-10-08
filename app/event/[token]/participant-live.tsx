"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LiveEventSnapshot } from "../../../src/live-event";
import { rankForScore } from "../../../src/live-guidance";
import { FormattedPrompt } from "../../_components/formatted-prompt";

export function ParticipantLive({
  token,
  recoveryToken,
}: {
  token: string;
  recoveryToken: string;
}) {
  const [data, setData] = useState<LiveEventSnapshot | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/live/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, recoveryToken }),
    });
    const payload = (await response.json()) as LiveEventSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "现场状态暂时不可用。");
    setData(payload);
    return payload;
  }, [recoveryToken, token]);

  useEffect(() => {
    let active = true;
    const refresh = () => request({ action: "snapshot" }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "现场状态暂时不可用。");
    });
    void refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [request]);

  async function copyPrompt() {
    if (!data?.activity.round) return;
    await navigator.clipboard.writeText(data.activity.round.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const stage = data?.activity.stage;
      await request(
        stage === "v1"
          ? { action: "save-entry", v1: form.get("v1") }
          : {
              action: "save-entry",
              improvementPrompt: form.get("improvementPrompt"),
              v2: form.get("v2"),
            },
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试。");
    } finally {
      setWorking(false);
    }
  }

  async function vote(candidateSeatId: string) {
    setWorking(true);
    setError("");
    try {
      await request({ action: "vote", candidateSeatId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "投票失败，请重试。");
    } finally {
      setWorking(false);
    }
  }

  if (!data) {
    return <main className="surface"><div className="surface-card"><p>{error || "正在同步现场状态…"}</p></div></main>;
  }

  const { activity } = data;
  const answerContent = (answer: LiveEventSnapshot["answers"][number]) => (
    <div className="answer-content">
      <div><small>V1</small><p>{answer.v1 || "未提交"}</p></div>
      <div><small>追加 Prompt</small><p>{answer.improvementPrompt || "未提交"}</p></div>
      <div><small>V2</small><p>{answer.v2 || "未提交"}</p></div>
    </div>
  );

  return (
    <main className="live-shell participant-live">
      <header className="live-header">
        <div>
          <p className="eyebrow">ROUND {activity.roundNumber} / {activity.roundCount}</p>
          <h1>{activity.stageLabel}</h1>
          <p>{activity.round?.title}</p>
        </div>
        <span className="live-stage-pill">主持人手动计时</span>
      </header>

      {(activity.stage === "v1" || activity.stage === "v2") && (
        <section className="live-workspace">
          <aside className="prompt-panel">
            <small>本轮原始 Prompt</small>
            <FormattedPrompt prompt={activity.round?.prompt ?? ""} />
            <button type="button" className="secondary-button" onClick={() => void copyPrompt()}>
              {copied ? "已复制" : "复制 Prompt"}
            </button>
            <p>主持人点击结束后，本阶段内容立即锁定。请在现场口头倒计时结束前保存。</p>
          </aside>
          <form className="entry-panel" key={`${activity.roundIndex}:${activity.stage}`} onSubmit={saveEntry}>
            {activity.stage === "v1" ? (
              <label>第一版回答 V1<textarea name="v1" maxLength={700} defaultValue={data.ownEntry?.v1} required /></label>
            ) : (
              <>
                <div className="readonly-entry"><small>已锁定 V1</small><p>{data.ownEntry?.v1 || "本轮未提交 V1"}</p></div>
                <label>唯一追加 Prompt<textarea name="improvementPrompt" maxLength={500} defaultValue={data.ownEntry?.improvementPrompt} required /></label>
                <label>改进回答 V2<textarea name="v2" maxLength={700} defaultValue={data.ownEntry?.v2} required /></label>
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={working}>{working ? "正在保存…" : "保存当前内容"}</button>
            {data.ownEntry && <small className="saved-note">✓ 已保存，可在主持人结束前继续修改</small>}
          </form>
        </section>
      )}

      {activity.stage === "voting" && (
        <section className="live-section">
          <div className="section-intro"><h2>选择一个最喜欢的作品</h2><p>匿名单选，不能投给自己。主持人结束投票后立即锁定。</p></div>
          <div className="answer-grid">
            {data.answers.map((answer) => (
              <article className={`answer-card ${answer.isOwn ? "own" : ""}`} key={answer.seatId}>
                <div className="answer-title"><b>作品 {answer.anonymousLabel}</b>{answer.isOwn && <span>你的作品</span>}</div>
                {answerContent(answer)}
                {!answer.isOwn && (
                  <button
                    className={data.ownVote?.candidateSeatId === answer.seatId ? "vote-button selected" : "vote-button"}
                    disabled={working}
                    onClick={() => void vote(answer.seatId)}
                  >
                    {data.ownVote?.candidateSeatId === answer.seatId ? "已选择" : "投给这个作品"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}

      {["reveal", "discussion", "scoring"].includes(activity.stage) && (
        <section className="live-section">
          <div className="section-intro">
            <h2>{activity.stage === "reveal" ? "作品身份已经揭晓" : activity.stage === "discussion" ? "自由交流进行中" : "结果整理中"}</h2>
            <p>{activity.stage === "discussion" ? "交流不会自动结束，只有主持人可以推进。" : activity.stage === "scoring" ? "默认按匿名互评票数公布；主持人也可以选择补充外部评分。" : "可以回看每个人的改进过程。"}</p>
          </div>
          <div className="answer-grid">
            {data.answers.map((answer) => (
              <article className="answer-card" key={answer.seatId}>
                <div className="answer-title"><b>{answer.nickname} · {answer.agentName}</b><span>作品 {answer.anonymousLabel}</span></div>
                {answerContent(answer)}
              </article>
            ))}
          </div>
        </section>
      )}

      {activity.stage === "results" && (
        <ResultTable title={`第 ${activity.roundNumber} 轮结果`} rows={data.results.map((result) => ({ ...result, score: result.roundScore }))} />
      )}

      {activity.stage === "complete" && (
        <>
          <ResultTable title="两轮总成绩" rows={data.totals.map((result) => ({ ...result, score: result.totalScore }))} />
          <AwardList awards={data.awards} />
        </>
      )}
    </main>
  );
}

function AwardList({ awards }: { awards: LiveEventSnapshot["awards"] }) {
  return <section className="live-section result-section award-section"><div className="section-intro"><p className="eyebrow">AWARDS</p><h2>每个人都有一份共创荣誉</h2></div><div className="award-grid">{awards.map((award) => <div key={award.seatId}><span>{award.title}</span><b>{award.nickname}</b><small>{award.agentName}</small></div>)}</div></section>;
}

function ResultTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ seatId: string; nickname: string; agentName: string; score: number; aiScore?: number; votes?: number }>;
}) {
  return (
    <section className="live-section result-section">
      <div className="section-intro"><p className="eyebrow">RESULT</p><h2>{title}</h2></div>
      <div className="result-list">
        {rows.map((row, index) => (
          <div className="result-row" key={row.seatId}>
            <strong>{rankForScore(rows, index)}</strong><div><b>{row.nickname}</b><small>{row.agentName}</small></div>
            {row.aiScore !== undefined && <small>AI {row.aiScore} + 互评 {row.votes}</small>}
            <span>{row.score} 分</span>
          </div>
        ))}
      </div>
      <p className="recovery-note">等待主持人推进下一轮或结束活动。</p>
    </section>
  );
}
