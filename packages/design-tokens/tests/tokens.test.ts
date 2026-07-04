import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(__dirname, '../src/tokens.css'), 'utf-8');

describe('tokens.css 令牌纯净度', () => {
  // 提取所有 :root 内定义的变量赋值行（排除纹理 gradient 中的 rgba）
  const lines = tokensCss.split('\n');

  it('每个颜色变量定义都形如 --name: #RRGGBB; 形式（十六进制）', () => {
    // 抓取 --bg-*/--text-*/--accent-*/--border-* 的赋值行
    // 排除 --border-width-* （宽度令牌，非颜色），其值是 1px/2px/3px 不是十六进制色
    const colorVarPattern = /--(bg|text|accent|border)-[^:]+:\s*(#[0-9A-Fa-f]{6})\s*;/;
    const colorVarLines = lines.filter((l) =>
      /--(bg|text|accent|border)-/.test(l)
      && !l.includes('border-width')
      && !l.includes('gradient')
      && !l.includes('var(--'),
    );
    expect(colorVarLines.length).toBeGreaterThan(10);
    colorVarLines.forEach((l) => {
      expect(colorVarPattern.test(l), `违反令牌格式: ${l.trim()}`).toBe(true);
    });
  });

  it('纹理令牌允许使用 rgba', () => {
    expect(tokensCss).toContain('--texture-paper');
    expect(tokensCss).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  it('动效缓动与时长齐全', () => {
    ['--ease-brush-out', '--ease-brush-in', '--ease-scroll', '--ease-ink',
     '--duration-instant', '--duration-fast', '--duration-medium', '--duration-slow', '--duration-ink']
      .forEach((name) => expect(tokensCss).toContain(name));
  });
});
