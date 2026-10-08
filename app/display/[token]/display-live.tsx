"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveEventSnapshot } from "../../../src/live-event";
import { rankForScore } from "../../../src/live-guidance";
import { FormattedPrompt } from "../../_components/formatted-prompt";

export function DisplayLive({ token }: { token: string }) {
  const [data, setData] = useState<LiveEventSnapshot | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/display-live/${token}`, { cache: "no-store" });
    const payload = (await response.json()) as LiveEventSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "大屏状态暂时不可用。");
    setData(payload);
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "大屏状态暂时不可用。")),
      0,
    );
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (!data) {
    return <main className="display-live"><p>{error || "正在连接现场…"}</p></main>;
  }

  const { activity } = data;
  const completed = activity.stage === "complete";
  const showingResults = activity.stage === "results" || completed;
  const rows = completed
    ? data.totals.map((row) => ({ ...row, score: row.totalScore }))
    : data.results.map((row) => ({ ...row, score: row.roundScore }));

  return (
    <main className="display-live">
      <div className="display-topline"><span>{activity.name}</span><b>第 {activity.roundNumber} / {activity.roundCount} 轮</b></div>
      <section className="display-main">
        <p className="eyebrow">CURRENT STAGE</p>
        <h1>{activity.stageLabel}</h1>
        {!showingResults && <FormattedPrompt prompt={activity.round?.prompt ?? ""} className="display-prompt" />}
        <p>{activity.stage === "discussion" ? "自由交流由主持人手动结束" : "请跟随主持人口令，当前阶段结束后内容立即锁定"}</p>
      </section>
      {showingResults ? (
        <section className="display-results">
          {rows.map((row, index) => <div key={row.seatId}><strong>{rankForScore(rows, index)}</strong><span>{row.nickname}{completed && <small>{data.awards.find((award) => award.seatId === row.seatId)?.title}</small>}</span><b>{row.score} 分</b></div>)}
        </section>
      ) : (
        <section className="display-status">
          <div><small>现场人数</small><b>{data.answers.length}</b></div>
          <div><small>人工计时</small><b>以主持人口令为准</b></div>
        </section>
      )}
    </main>
  );
}
