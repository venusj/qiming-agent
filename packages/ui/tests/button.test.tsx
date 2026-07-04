import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../src/button/Button';

describe('Button', () => {
  it('渲染默认 variant', () => {
    render(<Button>测试</Button>);
    expect(screen.getByText('测试')).toBeDefined();
  });
  it('primary variant 应用 primary 类', () => {
    render(<Button variant="primary">主</Button>);
    const el = screen.getByText('主');
    expect(el.className).toMatch(/primary/);
  });
  it('disabled 时不可点击', () => {
    render(<Button disabled>禁</Button>);
    expect((screen.getByText('禁') as HTMLButtonElement).disabled).toBe(true);
  });
});
