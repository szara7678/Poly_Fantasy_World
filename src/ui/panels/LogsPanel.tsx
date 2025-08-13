import React from 'react';
import { getLogs, getCategories, clearCategory, initLogListener } from '../../systems/Log';

export function LogsPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<'All' | 'ByTab'>('All');
  const [limitPerCat, setLimitPerCat] = React.useState<number>(100);
  const [query, setQuery] = React.useState('');
  const [follow, setFollow] = React.useState(true);
  React.useEffect(() => {
    initLogListener();
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const cats = getCategories();
  const toggle = (c: string): void => {
    setSelected((prev) => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };
  const filtered = getLogs({ categories: selected as any, mode, limitPerCategory: limitPerCat })
    .filter(e => query.trim() ? (e.text.includes(query) || String(e.category).includes(query)) : true);

  return (
    <div>
      <h3>로그</h3>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <input placeholder="검색" value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> Follow
        </label>
        <select value={mode} onChange={e => setMode(e.target.value as any)} style={{ fontSize: 12 }}>
          <option value="All">전체</option>
          <option value="ByTab">탭 선택만</option>
        </select>
        <label style={{ fontSize: 12 }}>
          제한/탭: <input type="number" value={limitPerCat} onChange={e => setLimitPerCat(Math.max(10, Math.min(1000, Number(e.target.value) || 0)))} style={{ width: 64 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {cats.map((c) => (
          <label key={c} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />{c}
            <button onClick={() => { clearCategory(c as any); force(v => v + 1); }} style={{ marginLeft: 4 }}>비우기</button>
          </label>
        ))}
      </div>
      <div id="log-scroll" style={{ marginTop: 8, background: '#0d0d0d', border: '1px solid #222', padding: 6, maxHeight: 240, overflow: 'auto' }}>
        {filtered.map((e, i) => (
          <div key={i} style={{ fontSize: 12, opacity: 0.95 }}>[{new Date(e.time).toLocaleTimeString()}] [{e.category}] {e.text}</div>
        ))}
      </div>
      {follow && (
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            const el = document.getElementById('log-scroll');
            if (el) el.scrollTop = el.scrollHeight;
          })();
        ` }} />
      )}
    </div>
  );
}


