import React from 'react';
import { computeSanctumStats } from '../../systems/SanctumLedger';
import { getQty } from '../../systems/Inventory';

export function SanctumStatsPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  const [active, setActive] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force(v => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const stats = computeSanctumStats();
  return (
    <div>
      <h3>성역별 집계</h3>
      {stats.length === 0 && <div style={{ fontSize: 12, opacity: 0.85 }}>성역이 없습니다.</div>}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {stats.map(s => (
            <button key={s.index} onClick={() => setActive(s.index)} disabled={active === s.index}>성역 #{s.index + 1}</button>
          ))}
        </div>
      )}
      {stats.filter(s => s.index === active).map(s => (
        <div key={s.index} style={{ border: '1px solid #222', padding: 8, marginBottom: 6, background: '#0f0f0f' }}>
          <div style={{ fontWeight: 600 }}>성역 #{s.index + 1}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>중심: ({s.center[0].toFixed(1)}, {s.center[2].toFixed(1)}), 반경: {s.radius}m</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>시민 근접: {s.citizensNearby} · 건물: {s.buildings} · 인접 도로: {s.roadsNearby}</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>자원:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {Object.entries(s.stocks).length === 0 && <span style={{ opacity: 0.75 }}>—</span>}
            {Object.entries(s.stocks).map(([k, v]) => (
              <span key={k}>{k}: {Math.floor(v as number)}</span>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        전체 재고(예시): Wood {getQty('Wood' as any)} · Stone {getQty('Stone' as any)}
      </div>
    </div>
  );
}


