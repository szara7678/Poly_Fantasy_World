import React from 'react';
import { computeSanctumStats } from '../systems/SanctumLedger';

// 토스트 제거됨

export function HUD(): React.JSX.Element {
  const [, force] = React.useState(0);
  const [activeS, setActiveS] = React.useState(0);

  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => { window.removeEventListener('pfw-ui-tick', onTick as EventListener); };
  }, []);

  // 토스트 제거됨

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 8, background: '#0d0d0d', border: '1px solid #222', padding: 6 }}>
        {(() => {
          const s = computeSanctumStats();
          // 새 성역 생길 때 active index 보정
          if (s.length > 0 && activeS >= s.length) setActiveS(s.length - 1);
          return (
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {s.length === 0 ? (
                  <button disabled>성역</button>
                ) : (
                  s.map(ss => (
                    <button key={ss.index} onClick={() => setActiveS(ss.index)} disabled={activeS === ss.index}>성역 #{ss.index + 1}</button>
                  ))
                )}
              </div>
              {s.length === 0 ? (
                <div style={{ opacity: 0.85 }}>성역이 없습니다.</div>
              ) : (
                s.filter(ss => ss.index === activeS).map(ss => (
                  <div key={ss.index} style={{ border: '1px solid #222', padding: 6, background: '#0f0f0f' }}>
                    <div style={{ fontWeight: 600 }}>성역 #{ss.index + 1}</div>
                    <div style={{ opacity: 0.9 }}>중심: ({ss.center[0].toFixed(1)}, {ss.center[2].toFixed(1)}), 반경: {ss.radius}m</div>
                    <div style={{ opacity: 0.9 }}>시민 근접: {ss.citizensNearby} · 건물: {ss.buildings} · 인접 도로: {ss.roadsNearby}</div>
                    <div style={{ marginTop: 4 }}>자원: {Object.entries(ss.stocks).length === 0 ? '—' : Object.entries(ss.stocks).map(([k,v]) => `${k}:${Math.floor(v as number)}`).join(' · ')}</div>
                  </div>
                ))
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}


