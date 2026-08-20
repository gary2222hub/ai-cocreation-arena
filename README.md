# AI 共创场

面向 3–12 人现场 AI 共创活动的轻量平台。当前正式实现覆盖工单 02：组织者使用邀请码配置活动，创建后获得组织、主持、参赛、大屏和报告五类用途受限入口，活动初始处于候场状态。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

本地 D1 首次运行前，将 `drizzle/` 中的迁移应用到模拟数据库，再按管理流程写入一次性邀请码。正式页面不会公开或预填有效邀请码。

## 校验

```bash
npm test
npm run lint
```

核心活动操作位于 `src/activity-creation.ts`，通过公开的 `ActivityStore` 边界连接内存测试实现与 D1 实现。数据库结构位于 `db/schema.ts`，迁移位于 `drizzle/`。

产品决策、领域语义和工单分别记录在 `CONTEXT.md`、`docs/adr/` 与 `.scratch/ai-cocreation-arena/issues/`。
