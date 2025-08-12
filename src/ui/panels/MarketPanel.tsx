import React from 'react';
import { openContract, listContracts, listLogs } from '../../systems/MarketSystem';
import { getQty } from '../../systems/Inventory';
import { getCoin } from '../../systems/Economy';

export function MarketPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const openBuy = (item: 'Wood' | 'Stone'): void => {
    openContract('Buy', item, 20, 1.2, 90);
    force((v) => v + 1);
  };
  const openSell = (item: 'Wood' | 'Stone'): void => {
    openContract('Sell', item, 20, 0.8, 90);
    force((v) => v + 1);
  };

  return (
    <div>
      <h3>시장/무역</h3>
      <div style={{ fontSize: 12, opacity: 0.9 }}>Coin: {getCoin().toFixed(1)} / 재고: Wood {getQty('Wood')} / Stone {getQty('Stone')}</div>
      <div style={{ marginTop: 6 }}>
        <button onClick={() => openBuy('Wood')}>Wood 매수(20 @≤1.2)</button>
        <button onClick={() => openSell('Wood')} style={{ marginLeft: 6 }}>Wood 매도(20 @≥0.8)</button>
      </div>
      <div style={{ marginTop: 6 }}>
        <button onClick={() => openBuy('Stone')}>Stone 매수(20 @≤1.2)</button>
        <button onClick={() => openSell('Stone')} style={{ marginLeft: 6 }}>Stone 매도(20 @≥0.8)</button>
      </div>
      <h4 style={{ margin: '8px 0 4px' }}>계약</h4>
      {listContracts().map((c) => (
        <div key={c.id} style={{ fontSize: 12 }}>
          {c.status} {c.kind} {c.qty} {c.item} (limit {c.limitPrice}) ttl {c.expiresSec.toFixed(0)}s
        </div>
      ))}
      <h4 style={{ margin: '8px 0 4px' }}>로그</h4>
      <div style={{ maxHeight: 120, overflow: 'auto', background: '#0d0d0d', padding: 6 }}>
        {listLogs().map((l, i) => (
          <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}


