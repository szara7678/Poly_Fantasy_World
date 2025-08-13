import React from 'react';
import { addTarget, listTargets, removeTarget } from '../../systems/TargetSystem';

export function TargetPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  return (
    <div>
      <h3>타겟 지시</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-target-place-request'))}>지도에 타겟 찍기</button>
        <button onClick={() => { addTarget([0,0,0]); force(v => v + 1); }}>원점 테스트 타겟</button>
      </div>
      <div style={{ marginTop: 6 }}>
        {listTargets().map(t => (
          <div key={t.id} style={{ fontSize: 12 }}>
            {t.id} @ ({t.position.map(v => v.toFixed(1)).join(', ')})
            <button style={{ marginLeft: 6 }} onClick={() => { removeTarget(t.id); force(v => v + 1); }}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}


