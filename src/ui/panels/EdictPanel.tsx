import React from 'react';
import { addEdict, listEdicts, removeEdict, getMultiplier } from '../../systems/EdictSystem';

export function EdictPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const onAdd = (): void => {
    addEdict({ domain: 'Build', tag: 'Road', mult: 1.5, ttl: 60, decay: 0.996 });
    force((v) => v + 1);
  };

  return (
    <div>
      <h3>전언(Edict)</h3>
      <div style={{ fontSize: 12, opacity: 0.9 }}>Build/Road 멀티: x{getMultiplier('Build', 'Road').toFixed(2)} (총합 캡 x3.0)</div>
      <button onClick={onAdd}>전언 추가(Build/Road x1.5, 60s)</button>
      <div style={{ marginTop: 6 }}>
        {listEdicts().map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span>{e.domain}{e.tag ? '/' + e.tag : ''} ×{e.mult.toFixed(2)} ({e.ttl.toFixed(0)}s)</span>
            <button onClick={() => { removeEdict(e.id); force((v) => v + 1); }}>삭제</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Gather/Forest, Gather/IronMine 멀티:</div>
        <button onClick={() => { addEdict({ domain: 'Gather', tag: 'Forest', mult: 1.6, ttl: 45, decay: 0.996 }); force(v => v + 1); }}>채집 전언(숲 ×1.6, 45s)</button>
        <button onClick={() => { addEdict({ domain: 'Gather', tag: 'IronMine', mult: 1.4, ttl: 45, decay: 0.996 }); force(v => v + 1); }} style={{ marginLeft: 6 }}>채집 전언(철 ×1.4, 45s)</button>
      </div>
    </div>
  );
}


