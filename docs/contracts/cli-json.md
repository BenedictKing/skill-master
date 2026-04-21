# CLI JSON contract

`skill-master` 的机器接口以 `--json` 输出为准。普通终端文本输出面向人类阅读，不属于稳定契约。

## Stable v1 schemas

当前首批提供正式 schema 的命令：

- `recommend --json` → `../../schemas/recommend.v1.schema.json`
- `solve --json` → `../../schemas/solve.v1.schema.json`
- `verify --json` → `../../schemas/verify.v1.schema.json`

## Versioning rules

- `--json` 输出属于机器接口。
- 文本输出不保证字段或文案稳定。
- `v1` schema 默认关闭未声明字段，调用方应按 schema 消费。
- 后续若需要扩字段或破坏兼容，使用新的 schema 版本文件，而不是隐式改写现有 `v1`。

## recommend --json

TypeScript contract: `RecommendJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `task`: 任务画像，来自 `TaskRequirement`
- `preferences`: 本次启用的推荐偏好
- `recommendations`: 推荐结果数组，元素来自 `Recommendation`

Notes:

- `recommendations` 可能为空数组。
- 偏好字段只在显式传入时出现，未传入时可能省略。
- 推荐顺序有语义：第一个元素是当前排序后的最佳结果。

Example:

```json
{
  "task": {
    "raw": "search web docs",
    "normalized": "search web docs",
    "keywords": ["search", "web", "docs"],
    "capabilities": ["search_content", "web_search", "read_file"],
    "riskTolerance": "medium",
    "installPreference": "existing-only"
  },
  "preferences": {
    "safe": true
  },
  "recommendations": []
}
```

## solve --json

TypeScript contract: `SolveJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `task`: 任务画像
- `preferences`: 推荐偏好
- `candidateCount`: 本次 discovery 的候选数
- `recommendations`: 推荐结果数组
- `steps`: 编排阶段状态
- `summary`: 汇总信息
- `installation`: 可选，仅在 `--install` 成功后出现
- `verification`: 可选，仅在 `--verify` 且存在目标时出现

Notes:

- `steps.installed` 与 `installation` 是否存在应保持一致。
- `steps.verified` 与 `verification` 是否存在应保持一致。
- `summary.bestMatch` 在没有推荐结果时为 `null`。

Example:

```json
{
  "task": {
    "raw": "search web docs",
    "normalized": "search web docs",
    "keywords": ["search", "web", "docs"],
    "capabilities": ["search_content", "web_search", "read_file"],
    "riskTolerance": "medium",
    "installPreference": "existing-only"
  },
  "preferences": {},
  "candidateCount": 1,
  "recommendations": [],
  "steps": {
    "discovered": true,
    "recommended": false,
    "installed": false,
    "verified": false
  },
  "summary": {
    "bestMatch": null,
    "preferenceLabels": []
  }
}
```

## verify --json

TypeScript contract: `VerifyJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `skillName`: 被验证的 skill 名称
- `envStatus`: `configured | missing | partial`
- `envMissingKeys`: 缺少的环境变量键
- `dependencyWarnings`: 运行条件或依赖提醒
- `conflicts`: 检测到的冲突
- `messages`: 结构与配置消息列表
- `structureHealthy`: 结构是否健康
- `smokePassed`: smoke 检查是否通过

Notes:

- `messages` 中的每个元素都包含 `severity` 和 `message`。
- `dependencyWarnings` 与 `conflicts` 可以为空数组。

Example:

```json
{
  "skillName": "my-skill",
  "envStatus": "configured",
  "envMissingKeys": [],
  "dependencyWarnings": [],
  "conflicts": [],
  "messages": [
    {
      "severity": "info",
      "message": "SKILL.md exists in canonical path"
    }
  ],
  "structureHealthy": true,
  "smokePassed": true
}
```

## Documented contracts without schema in this round

以下命令本轮已补源码层 contract 类型与文档说明，但暂未提供独立 schema：

- `find --json` → `FindJsonV1`
- `inspect --json` → `InspectJsonV1`
- `compose --json` → `ComposeJsonV1`

原因：这三者已具备基础结构化输出，但当前优先级低于 `recommend / solve / verify`。
