import React from 'react';
import { addEdict, listEdicts, removeEdict, getMultiplierDetail, getMaxTotalMult } from '../../systems/EdictSystem';

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
      <div style={{ fontSize: 12, opacity: 0.9 }}>
        Build/Road 멀티: {
          (() => {
            const d = getMultiplierDetail('Build', 'Road');
            return `x${d.effective.toFixed(2)}${d.capped ? ` (캡 x${getMaxTotalMult().toFixed(1)})` : ''}`;
          })()
        }
      </div>
      <button onClick={onAdd}>전언 추가(Build/Road x1.5, 60s)</button>
      <div style={{ marginTop: 6 }}>
        {listEdicts().map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span>{e.domain}{e.tag ? '/' + e.tag : ''} ×{e.mult.toFixed(2)} ({e.ttl.toFixed(0)}s)</span>
            <button onClick={() => { removeEdict(e.id); force((v) => v + 1); }}>삭제</button>
          </div>
        ))}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer' }}>히트맵(샘플) 표시 안내</summary>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>정찰/채집 경로에 가중을 적용해 붉게 표시(렌더 시스템에서 샘플링).</div>
      </details>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Gather/Forest, Gather/IronMine 멀티:</div>
        <button onClick={() => { addEdict({ domain: 'Gather', tag: 'Forest', mult: 1.6, ttl: 45, decay: 0.996 }); force(v => v + 1); }}>채집 전언(숲 ×1.6, 45s)</button>
        <button onClick={() => { addEdict({ domain: 'Gather', tag: 'IronMine', mult: 1.4, ttl: 45, decay: 0.996 }); force(v => v + 1); }} style={{ marginLeft: 6 }}>채집 전언(철 ×1.4, 45s)</button>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.9 }}>커스텀 전언</span>
          <select id="edict-domain" defaultValue="Build" style={{ fontSize: 12 }}>
            <option>Build</option>
            <option>Gather</option>
          </select>
          <input id="edict-tag" placeholder="Tag (예: Road/IronMine)" style={{ fontSize: 12, width: 120 }} />
          <input id="edict-mult" type="number" step="0.1" min="1" max="3" defaultValue={1.5} style={{ width: 64 }} />
          <input id="edict-ttl" type="number" step="5" min="10" max="600" defaultValue={60} style={{ width: 64 }} />
          <button onClick={() => {
            const domain = (document.getElementById('edict-domain') as HTMLSelectElement).value;
            const tag = (document.getElementById('edict-tag') as HTMLInputElement).value || undefined;
            const mult = parseFloat((document.getElementById('edict-mult') as HTMLInputElement).value || '1.2');
            const ttl = parseFloat((document.getElementById('edict-ttl') as HTMLInputElement).value || '60');
            addEdict({ domain, tag, mult: Math.max(1, Math.min(3, mult)), ttl: Math.max(5, ttl), decay: 0.996 });
            force(v => v + 1);
          }}>추가</button>
        </div>
      </div>
    </div>
  );
}


