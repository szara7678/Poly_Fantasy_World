import React from 'react';
import { consecrate, getSanctums, getCooldownRemaining, getCastingRemaining, canStartExpand, expandSanctum } from '../../systems/SanctumSystem';
import { getActiveWorld } from '../../ecs';
import { isVisible, setDebugVisible } from '../../systems/FogOfWarSystem';

export function SanctumPanel(): React.JSX.Element {
  const [, setCount] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => setCount((c) => c + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);
  const onConsecrate = (): void => {
    consecrate([0, 0, 0], 36);
    setCount((c) => c + 1);
  };
  const onToggleFow = (): void => {
    setDebugVisible(!isVisible());
    setCount((c) => c + 1);
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h3>성역</h3>
      <div style={{ marginBottom: 6 }}>
        <div>마나: {Math.round(getActiveWorld().player.mana)} / {getActiveWorld().player.manaMax}</div>
        <button onClick={onConsecrate}>
          성역화 시전
        </button>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          {getCastingRemaining() > 0 ? `시전 중: ${getCastingRemaining().toFixed(1)}s` : getCooldownRemaining() > 0 ? `쿨타임: ${getCooldownRemaining().toFixed(1)}s` : '준비 완료'}
        </div>
      </div>
      <div>성역 수: {getSanctums().length}</div>
      <div style={{ marginTop: 8 }}>
        {getSanctums().map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>#{i + 1} 반경: {s.radius}m, 레벨: {s.level}</span>
            <button disabled={!canStartExpand(i)} onClick={() => { expandSanctum(i); setCount(c => c + 1); }}>
              반경 확장
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={onToggleFow}>FoW 토글</button>
        <span style={{ marginLeft: 8 }}>FoW: {isVisible() ? 'OFF(전체 보임)' : 'ON'}</span>
      </div>
    </div>
  );
}


