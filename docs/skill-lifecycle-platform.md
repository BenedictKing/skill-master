# skill-master Skill Lifecycle Platform

## 背景

`skill-master` 当前已经是一个可靠的跨平台 skill 安装器，具备安装、更新、移除、恢复、锁文件、环境变量保护、平台检测等核心能力。但用户真正的工作流并不从“安装”开始，而是从“我想完成一件事”开始：

1. 描述想做什么
2. 搜索相关 skills
3. 评估哪些 skill 更符合需求
4. 做初步安全评估与使用成本判断
5. 选择并安装 skill
6. 安装后验证是否可用
7. 如果不够贴合，再改造 / 融合 / 生成新的 skill

本设计将 `skill-master` 从安装器扩展为**面向任务的 skill 生命周期平台**，但不改变其现有安装内核与跨平台定位。

---

## 当前实现状态（已落地）

当前版本已经完成以下能力：

- 多源发现：`find`, `discoverCandidates()`
- 静态审查：`inspect`
- 推荐排序：`recommend`
- 偏好控制：`--safe`, `--local-first`, `--no-remote`, `--prefer-installed`
- 安装复用：`recommend --install`
- 安装后验证：`verify`
- skill 输出组合：`compose`
- 高层编排：`solve`
- 结构化接口：`find/inspect/recommend/verify/compose/solve --json`

也就是说，该平台已经从“设计方案”进入“可用原型”阶段。

---

## 产品目标

### 目标
- 帮用户从“任务需求”出发找到合适的 skill，而不是只提供安装命令
- 统一多源发现、评估、推荐、安装、验证、组合流程
- 保持现有安装能力稳定，将新能力分层叠加
- 继续保持 CLI-first、Node 18+、本地优先、轻量无服务端依赖
- 让 CLI 同时具备“人类可读界面”和“机器可编排接口”两种模式

### 非目标
- 不做远程代码执行级安全扫描
- 不做长期运行的搜索索引服务
- 不做纯黑盒的 LLM 自由推理系统
- 不做全自动生成“完美 skill”的不可解释流程

---

## 核心用户场景

### 1. 任务导向发现
用户输入：
- “我想自动调研某个库的最新文档”
- “我想每隔 10 分钟看一次 deploy 状态”
- “我想把内部规范变成一个 skill”

系统行为：
- 提炼任务画像
- 搜索候选 skill
- 给出推荐与理由

### 2. 候选评估
当找到多个相似 skills 时，系统应回答：
- 哪个更适合当前任务
- 哪个安装成本更低
- 哪个更保守 / 更安全
- 哪个需要额外配置

### 3. 安装与恢复
- 用户确认后安装 skill
- 保留现有 `add/update/remove/restore/sync` 语义
- 支持项目级和全局安装

### 4. 安装后验证
安装成功不等于可用，需要验证：
- `.env` 是否齐全
- 依赖是否满足
- 结构是否完整
- 是否与现有 skills 冲突
- 是否能通过基本 smoke 检查

### 5. Skill 改造与融合
当现有 skill 不完全适配时：
- 轻改造：改触发条件、描述、工具约束
- 融合：从多个 skill 组合能力
- 生成：基于需求输出新 skill 目录

### 6. 编排式调用
上层产品或脚本不一定想自己串命令，因此需要：
- `solve` 统一发现 + 推荐 + 可选安装 + 可选验证
- 所有核心阶段都支持 `--json`

---

## 用户旅程

```text
任务需求
  ↓
需求画像（task requirement）
  ↓
多源发现（discovery）
  ↓
候选标准化（candidate normalization）
  ↓
评估（匹配度 / 质量 / 安全初筛 / 维护度）
  ↓
推荐（best / conservative / aggressive）
  ↓
安装（复用 installSkill）
  ↓
验证（env / runtime / conflicts / smoke）
  ↓
改造 / 融合 / 生成（compose）
```

另外还支持：

```text
任务需求
  ↓
solve orchestrator
  ↓
discover + recommend + (install) + (verify)
  ↓
text output or JSON payload
```

---

## 命令边界

### 保留现有命令语义
- `find`：候选发现与候选列表
- `add`：安装执行
- `info`：已安装 skill 的 registry 信息
- `doctor`：系统与安装环境诊断
- `check`：已安装 skill 的更新检查
- `sync` / `restore`：与锁文件和 node_modules 发现相关

### 新增/扩展命令
- `inspect <source|skill>`
  - 对任意 skill 源做静态剖析
  - 支持 `--json`
- `recommend <task>`
  - 从任务出发进行需求画像、发现、评估、排序、推荐
  - 支持 `--install`
  - 支持偏好参数
  - 支持 `--json`
- `verify <skill>`
  - 安装后验证与冲突检查
  - 支持 `--json`
- `compose ...`
  - skill 轻改造、融合、生成新输出目录
  - 支持名称解析与 `--json`
- `solve <task>`
  - 高层 orchestrator
  - 支持 `--install`, `--verify`, 偏好参数, `--json`

### 命令设计原则
- 单一职责
- 不把推荐混进 `add`
- 不把验证混进 `doctor`
- 不把 discovery 的结果强行持久化到 registry
- 所有对外核心能力都要能输出稳定 JSON

---

## 架构分层

### 1. 现有底座层（保留）
- `src/core/installer.ts`
- `src/core/registry.ts`
- `src/core/git-source.ts`
- `src/core/skill-parser.ts`
- `src/core/env-manager.ts`
- `src/core/local-lock.ts`
- `src/core/plugin-manifest.ts`
- `src/platform/agents.ts`
- `src/platform/capability-map.ts`

### 2. discovery 层
- 统一多源搜索与候选标准化
- `src/discovery/normalize.ts`
- `src/discovery/providers/*`
- 当前 provider：skills.sh、GitHub、本地路径、node_modules、plugin manifest、registry、可选 gh/vercel provider

### 3. evaluate 层
- 任务匹配度
- 结构与质量评分
- 初步安全评估
- 维护度评分
- 可解释得分

### 4. recommend 层
- 排序
- 去重
- 输出最佳/保守/激进建议
- 偏好参数调制排序

### 5. verify 层
- env 检查
- 运行条件检查
- 冲突检测
- smoke 验证

### 6. compose 层
- skill 轻改造
- 多 skill 融合
- 从需求生成 skill 输出目录
- 名称 / source / 路径统一解析

### 7. solve 编排层
- 发现 + 推荐 + 可选安装 + 可选验证
- 输出 text / JSON 两种模式

---

## 数据模型

### 关键类型
- `TaskRequirement`
- `SkillCandidate`
- `CandidateProvider`
- `EvaluationReport`
- `Recommendation`
- `RecommendationPreferences`
- `VerificationReport`
- `CompositionRequest`
- `CompositionResult`

### registry.json
继续只表达**已安装事实**：
- source
- version
- agents
- env_keys
- capabilities
- canonical_path

### skills-lock.json
扩展为项目上下文：
- 原始来源
- hash
- pluginName
- 可选验证快照
- 可选组合来源

### 非持久化数据
默认不持久化：
- discovery 搜索结果
- 推荐排序结果
- 中间评估缓存

---

## 评分与排序

### 1. 匹配度
参考因素：
- 描述与任务关键词匹配
- capabilities 是否覆盖任务所需能力
- 平台是否兼容
- 是否需要用户未接受的高风险能力

### 2. 质量评分
参考因素：
- frontmatter 是否完整
- `SKILL.md` 是否可解析
- 是否有描述、版本、作者、工具声明
- 是否有示例、辅助文件、tests、docs

### 3. 初步安全评估
这是“初筛”，不是正式安全审计。

关注：
- `allowed-tools` 是否过宽
- shell/network 权限是否激进
- 是否含脚本/可执行内容
- 是否依赖外部服务与 API key
- 是否需要写文件/编辑文件/子任务

输出：
- `low`
- `medium`
- `high`

### 4. 维护度评分
参考因素：
- 来源可信度
- 版本信息是否存在
- 更新时间（如果来源能提供）
- 已安装记录是否健康

### 5. 偏好参数
当前支持：
- `--safe`
- `--local-first`
- `--no-remote`
- `--prefer-installed`

这些偏好会真实影响排序，而不仅是展示。

---

## JSON 接口

当前支持：
- `find --json`
- `inspect --json`
- `recommend --json`
- `verify --json`
- `compose --json`
- `solve --json`

这意味着 `skill-master` 已经不只是 CLI，也是一套**本地可编排的结构化能力接口**。

---

## 当前已完成的实现阶段

### 已完成
- 文档与命令矩阵
- 类型与 discovery 基础设施
- 评估与推荐
- 安装与验证闭环
- 改造 / 融合 / 生成
- 高层 solve orchestrator
- JSON 输出接口

### 当前验证状态
- `npm run lint` 通过
- `npm run test:run` 通过
- `npm run build` 通过
- 当前测试总数：114 通过

---

## 下一阶段建议

下一步更适合做“产品收口和真实连接”，而不是继续无边界扩功能：

1. 让 `vercel` provider 变成真实可查询实现
2. 让 `solve` 支持更明确的 action policy（如策略化安装/验证）
3. 补更强的 machine-facing schema 文档
4. 为上层产品定义稳定接口契约

---

## 成功标准

当前版本已经基本达到以下标准：
- 从任务描述出发发现并推荐合适的 skill
- 对 skill 做结构化 inspection
- 复用现有安装能力完成安装
- 对安装结果做验证
- 在不满足时产出可落地的 compose 结果
- 提供完整的 JSON 接口供上层系统编排
- 保持现有安装器能力不退化
