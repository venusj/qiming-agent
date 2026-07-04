/** 一条长期记忆（向量以 number[] 在内存中，DB 中以 JSON 字符串存 embedding 列）。 */
export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  /** 来源：'manual' 用户手动录入 / 'auto' LLM 自动提取 */
  source: 'manual' | 'auto';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 带相似度分数的记忆（检索结果）。score 为余弦相似度，范围约 0~1。 */
export interface ScoredMemory {
  memory: Memory;
  score: number;
}
