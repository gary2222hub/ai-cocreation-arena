# AI 共创场

## Agent skills

### Issue tracker

需求规格与任务使用本地 Markdown 跟踪，存放在 `.scratch/`。具体约定见 `docs/agents/issue-tracker.md`。

### Triage labels

任务使用五种统一状态：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。具体映射见 `docs/agents/triage-labels.md`。

### Domain docs

本工程采用单一上下文结构：根目录 `CONTEXT.md` 与 `docs/adr/`。读取规则见 `docs/agents/domain.md`。
