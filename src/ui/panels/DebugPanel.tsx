import React from 'react';
import { canBuild, explainBuildRule } from '../../systems/BuildRules';
import { computeDailyQuotas, getNodes } from '../../systems/NodeRegenSystem';
import { addExploredStroke } from '../../systems/FogOfWarSystem';
import * as Inv from '../../systems/Inventory';
import * as Workers from '../../systems/Workers';
import { spawnScout, getScoutCount } from '../../systems/ScoutSystem';
import { doSave, hasSave, clearSave, doLoad } from '../../systems/SaveLoadSystem';
import { addRoad, getRoads } from '../../systems/RoadNetwork';
import { spawnProjectile, getLastDamage } from '../../systems/ProjectileSystem';
import { cycleRoadType, getBuildPreview } from '../../systems/BuildPreviewSystem';

export function DebugPanel(): React.JSX.Element {
  const [fps, setFps] = React.useState(0);
  const [, force] = React.useState(0);
  React.useEffect(() => {
    let last = performance.now();
    let frame = 0;
    let raf = 0;
    const loop = (): void => {
      const now = performance.now();
      frame += 1;
      if (now - last >= 1000) {
        setFps(frame);
        frame = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pfw-ui-tick', onTick as EventListener); };
  }, []);
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h3>디버그</h3>
      <div>FPS: {fps}</div>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => {
            const pos: [number, number, number] = [10, 0, 10];
            // 샘플 판정 로그
            console.log('Build(Building)@', pos, canBuild({ position: pos, type: 'Building' }), explainBuildRule({ position: pos, type: 'Building' }));
            console.log('Build(Road)@', pos, canBuild({ position: pos, type: 'Road' }), explainBuildRule({ position: pos, type: 'Road' }));
          }}
        >
          건설 규칙 테스트(콘솔)
        </button>
        <button
          style={{ marginLeft: 8 }}
          onClick={() => {
            console.log('Nodes=', getNodes());
            console.log('DailyQuotas=', computeDailyQuotas());
          }}
        >
          노드 쿼터 테스트(콘솔)
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>자원/작업자</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Wood: {Inv.getQty('Wood')} / Stone: {Inv.getQty('Stone')} / Workers: {Workers.getWorkers()}</div>
        <button onClick={() => { Inv.addItem('Wood', 5); }}>Wood +5</button>
        <button onClick={() => { Inv.addItem('Stone', 3); }} style={{ marginLeft: 6 }}>Stone +3</button>
        <button onClick={() => { Workers.setWorkers(Workers.getWorkers() + 1); }} style={{ marginLeft: 6 }}>Worker +1</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => {
            // 정찰 경로 예시: 대각선으로 3개 점 찍어 explored 스트로크 추가
            addExploredStroke(
              [
                [0, 0],
                [50, 50],
                [100, 60],
              ],
              12
            );
          }}
        >
          정찰 경로 페인트(예시)
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.9 }}>건설 미리보기 모드: </span>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: 'Building' }))}>Building</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: 'Road' }))} style={{ marginLeft: 6 }}>Road</button>
        <button onClick={() => { cycleRoadType(); }} style={{ marginLeft: 6 }}>도로 유형 순환</button>
        <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.9 }}>(도로 유형: Dirt/Gravel/Wood/Stone - 비용/시간은 costs.json)</span>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: 'None' }))} style={{ marginLeft: 6 }}>None</button>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>미리보기: {(() => { const s = getBuildPreview(); return s.mode === 'Road' ? `RoadType=${s.roadType}` : s.mode; })()}</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>힌트: {(window as any).__pfw_hint ?? ''}</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        청사진을 배치하면 1.5초 후 완성 메쉬로 바뀝니다(프로토타입).
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>정찰</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>정찰 수: {getScoutCount()}</div>
        <button onClick={() => spawnScout()}>정찰 추가</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>전투(투사체 테스트)</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>최근 피해: {getLastDamage().toFixed(1)}</div>
        <button onClick={() => spawnProjectile([30, 1, 30], [0, 0, 0], 20, true)}>원거리 투사체(경계 밖 시작)</button>
        <button onClick={() => spawnProjectile([0, 1, 0], [30, 0, 30], 20, true)} style={{ marginLeft: 6 }}>원거리 투사체(경계 안 시작)</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>도로</h4>
        <button onClick={() => { addRoad([0, 0, 0]); }}>원점 도로 타일 추가</button>
        <div style={{ fontSize: 12, opacity: 0.9 }}>도로 타일 수: {getRoads().length}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>저장/불러오기</h4>
        <button onClick={() => doSave()}>저장</button>
        <button onClick={() => clearSave()} style={{ marginLeft: 6 }}>저장 삭제</button>
        <button onClick={() => doLoad()} style={{ marginLeft: 6 }}>불러오기</button>
        <div style={{ fontSize: 12, opacity: 0.8 }}>저장 존재: {hasSave() ? 'O' : 'X'}</div>
      </div>
    </div>
  );
}


