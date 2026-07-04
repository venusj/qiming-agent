import { useEffect } from 'react';
import { detectPlatform } from './lib/platform';

export function App() {
  useEffect(() => {
    document.documentElement.dataset.platform = detectPlatform();
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink font-cn p-8">
      <h1 className="text-2xl">启明</h1>
      <p className="text-sm text-ink-light">古风 AI Agent · P0 脚手架</p>
    </div>
  );
}
