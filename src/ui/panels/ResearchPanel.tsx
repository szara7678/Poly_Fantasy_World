import React from 'react';
import { listUpgrades, canPurchase, purchase } from '../../systems/ResearchSystem';
import { getQty } from '../../systems/Inventory';
import { setWorkers, getWorkers } from '../../systems/Workers';

export function ResearchPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const buy = (id: string): void => {
    const up = listUpgrades().find((u) => u.id === id);
    if (!up) return;
    if (id === 'Workers+1') {
      // 특별 처리: 연구 포인트를 소비하고 작업자 +1
      if (getQty('ResearchPoint' as any) >= up.costRP) {
        purchase(up);
        setWorkers(getWorkers() + 1);
        force((v) => v + 1);
      }
      return;
    }
    if (purchase(up)) force((v) => v + 1);
  };

  return (
    <div>
      <h3>연구</h3>
      <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>RP: {getQty('ResearchPoint' as any)}</div>
      {listUpgrades().map((u) => (
        <div key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span>{u.id} (RP {u.costRP})</span>
          <button disabled={!canPurchase(u)} onClick={() => buy(u.id)}>연구</button>
        </div>
      ))}
    </div>
  );
}


