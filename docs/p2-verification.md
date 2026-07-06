# P2 端到端验证记录

**日期**：2026-07-04
**验证人**：待人工验证（controller/用户）
**分支**：feat/p2-tools

> 本文档的"自动化 gate"部分由 P2.8 任务执行（subagent）填写并确认全绿；"手动 E2E"部分（spec §8.2 验收清单）需 controller/用户在本地 `corepack pnpm dev` 启动 Electron + 配置真实 LLM provider 后逐项勾选。

## 工具能力
- [ ] LLM 调 read_file 读文件，返回内容正确
- [ ] LLM 调 list_directory 列目录
- [ ] LLM 调 glob/grep 搜索
- [ ] read_file 大文件截断（>50000 字符）
- [ ] glob 上限 200、grep 上限 50

## tool-use 循环
- [ ] "读 X 个文件→总结→写入" 多轮链路成功
- [ ] maxSteps=25 到顶优雅终止（构造场景或观察日志）
- [ ] stop 按钮能中断整个循环

## 权限审批
- [ ] 只读工具不弹窗
- [ ] write_file 弹朱砂印审批窗
- [ ] 三选项（拒绝/允许本次/本会话总允许）都生效
- [ ] 本会话总允许后同会话同工具不再弹
- [ ] 拒绝时工具返回错误给 LLM，LLM 继续对话
- [ ] run_shell 命令明文显示（强制展开）

## UI 可视化
- [ ] ToolCallView 在消息流显示（状态/参数/结果）
- [ ] 危险工具朱砂边框、只读青玉边框
- [ ] 设置页工作目录区域可改
- [ ] 首次启动弹目录选择器

## 跨厂商（可选）
- [ ] OpenAI 兼容端点 tool calling 可用
- [ ] Anthropic tool calling 可用
- [ ] Gemini tool calling 可用

## 备注

### 自动化 gate（已由 P2.8 subagent 跑过，全绿）

- **测试**：`corepack pnpm test` → **78 passed / 1 skipped / 0 failed**，共 17 个测试文件 + 1 个 skipped（`keystore.test.ts` 需要 Keytar 真实环境，CI 跳过）。better-sqlite3 在 Node ABI 下加载正常。
  - 测试文件清单：`migration / store / tools.dangerous(7) / chat(3) / approval-queue(7) / extractor(4) / tools.readonly(7) / budget(4) / providers.factory(3) / vectorStore(5) / settings(5) / compressor(2) / providers.test-conn(3) / embedder(3) / tokenCounter(6) / cosine(5) / paths(4) / keystore(1 skipped)`。
- **类型检查**：
  - `tsc --noEmit -p tsconfig.node.json`（main + preload）→ **exit 0，无输出**。
  - `tsc --noEmit -p tsconfig.web.json`（renderer）→ **exit 0，无输出**。
- **构建**：`corepack pnpm build`（electron-vite）→ **exit 0**，3 段全部产出：
  - main：`out/main/index.js` 42.12 kB
  - preload：`out/preload/index.js` 4.04 kB
  - renderer：`out/renderer/index.html` 0.40 kB + `assets/index-CiNmT5Ee.css` 35.73 kB + `assets/index-BVxd2las.js` 1,578.77 kB
  - 仅有 Vite 关于 `postcss.config.js` 的 `MODULE_TYPELESS_PACKAGE_JSON` 提示（非 P2 引入，不影响产物）。

### 手动 E2E 待办（合并前 controller/用户完成）

1. **better-sqlite3 ABI 切换**：当前为 Node ABI（vitest 跑测试用）。启动 Electron 前需切到 Electron ABI，否则 main 进程 require better-sqlite3 会报 `NODE_MODULE_VERSION mismatch`。任选其一：
   ```bash
   # 方式 A：electron-rebuild（推荐，自动读 package.json 里的 electron 版本）
   cd apps/desktop && corepack pnpm exec electron-rebuild -f -w better-sqlite3

   # 方式 B：手动 node-gyp（target 需对齐 Electron 30.5.x 的 ABI）
   cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 \
     && npx node-gyp rebuild --target=30.5.1 --runtime=electron --disturl=https://electronjs.org/headers
   ```
   切回 Node ABI 跑测试：`cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install`。
2. 启动 dev：`cd apps/desktop && corepack pnpm dev`。
3. 配置一个真实 LLM provider（OpenAI 兼容 / Anthropic / Gemini 任一）。
4. 按上方清单逐项勾选；记录任何偏差/降级/已知问题到本节底部。
5. E2E 全绿后再 `git merge --no-ff feat/p2-tools` 合并到 main。

（记录任何偏差、降级、已知问题）
