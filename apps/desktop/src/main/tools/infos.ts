// apps/desktop/src/main/tools/infos.ts
import type { ToolInfo } from '@qiming/shared';

/** 供 IPC tools:list 返回。description 与各工具的 Tool.description 保持口径一致。 */
export const TOOL_INFOS: ToolInfo[] = [
  { name: 'read_file', description: '读取文本文件（>50000 字符截断）', risk: 'readonly' },
  { name: 'list_directory', description: '列出目录文件与子目录', risk: 'readonly' },
  { name: 'glob', description: '按 glob 模式搜索文件路径（上限 200）', risk: 'readonly' },
  { name: 'grep', description: '文件内容正则搜索（默认上限 50）', risk: 'readonly' },
  { name: 'write_file', description: '写入文件（覆盖）', risk: 'dangerous' },
  { name: 'edit_file', description: '精确替换文件内容', risk: 'dangerous' },
  { name: 'run_shell', description: '执行 shell 命令（30s 超时）', risk: 'dangerous' },
];
