import React from 'react';
import { getQty } from '../systems/Inventory';
import { getCoin } from '../systems/Economy';
import { getWorkers } from '../systems/Workers';
import { getRoleCounts } from '../systems/CitizenSystem';
import { getThreat } from '../systems/MonsterSystem';

// 토스트 제거됨

export function HUD(): React.JSX.Element {
  const [, force] = React.useState(0);

  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => { window.removeEventListener('pfw-ui-tick', onTick as EventListener); };
  }, []);

  // 토스트 제거됨

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 8, background: '#0d0d0d', border: '1px solid #222', padding: 6 }}>
        자원: Wood {getQty('Wood')} · Stone {getQty('Stone')} · Plank {getQty('Plank' as any)} · IronIngot {getQty('IronIngot' as any)} · Tool {getQty('Tool' as any)} · RP {getQty('ResearchPoint' as any)} · Coin {getCoin().toFixed(1)} · Workers {getWorkers()} · Threat {Math.round(getThreat()*100)}%
        <div style={{ marginTop: 4, opacity: 0.9 }}>Roles: {Object.entries(getRoleCounts()).map(([k,v]) => `${k}:${v}`).join(' · ')}</div>
      </div>
      {/* 토스트 표시 제거 */}
    </div>
  );
}


