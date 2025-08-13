import React from 'react';
import { canBuild, explainBuildRule } from '../../systems/BuildRules';
import { computeDailyQuotas, getNodes } from '../../systems/NodeRegenSystem';
import { addExploredStroke } from '../../systems/FogOfWarSystem';
import * as Inv from '../../systems/Inventory';
import * as Workers from '../../systems/Workers';
import { spawnScout, getScoutCount } from '../../systems/ScoutSystem';
import { doSave, hasSave, clearSave, doLoad } from '../../systems/SaveLoadSystem';
import { spawnProjectile, getLastDamage } from '../../systems/ProjectileSystem';
import { spawnMonster, getMonsterCount } from '../../systems/MonsterSystem';
import { spawnCitizen, getCitizenCount } from '../../systems/CitizenSystem';
import { listJobChunks, reserveJobChunk, releaseJobChunk } from '../../systems/JobChunkSystem';
import { getCitizenTop5 } from '../../systems/CitizenSystem';
import { getSanctums } from '../../systems/SanctumSystem';

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
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer' }}>개발 유틸(콘솔 출력)</summary>
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => {
              const pos: [number, number, number] = [10, 0, 10];
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
      </details>
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
      {/* Build 관련 중복 컨트롤 제거: BuildPanel에 일원화 */}
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>정찰</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>정찰 수: {getScoutCount()}</div>
        <button onClick={() => spawnScout()}>정찰 추가</button>
      </div>
      <div style={{ marginTop: 8 }} onClick={() => { /* noop to keep selection simple */ }}>
        <h4 style={{ margin: '8px 0 4px' }}>시민</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>시민 수: {getCitizenCount()}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => spawnCitizen(1)}>+1</button>
          <button onClick={() => spawnCitizen(3)}>+3</button>
          <button onClick={() => spawnCitizen(10)}>+10</button>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>작업 청크(채집)</h4>
        {listJobChunks().map((c) => (
          <div key={c.id} style={{ fontSize: 12 }}>
            {c.id} · avail {c.available} · slots {c.reserved}/{c.slots.soft}/{c.slots.hard}
            <button style={{ marginLeft: 6 }} onClick={() => { reserveJobChunk(c.id); force(v => v + 1); }}>예약</button>
            <button style={{ marginLeft: 6 }} onClick={() => { releaseJobChunk(c.id); force(v => v + 1); }}>반납</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>우선순위(샘플 Top-5)</h4>
        {(() => {
          const chunks = listJobChunks();
          // 거리=성역(0,0,0) 기준 간소 점수: avail/거리 × 한계효율
          const s = getSanctums()[0];
          const cx = s ? s.center[0] : 0;
          const cz = s ? s.center[2] : 0;
          function effMarginal(soft: number, hard: number, reserved: number): number {
            const next = Math.min(hard, reserved + 1);
            if (next <= soft) return 1;
            return 0.6; // 감가 40%
          }
          const scored = chunks.map((c) => {
            const d = Math.max(1, Math.hypot(c.position[0] - cx, c.position[2] - cz));
            const eff = effMarginal(c.slots.soft, c.slots.hard, c.reserved);
            const score = (c.available / d) * eff;
            return { id: c.id, score };
          }).sort((a, b) => b.score - a.score).slice(0, 5);
          return (
            <div style={{ fontSize: 12 }}>
              {scored.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.id}</span>
                  <div style={{ background: '#244', width: 100, height: 8, position: 'relative' }}>
                    <div style={{ background: '#4cf', width: `${Math.min(100, Math.round(s.score * 10))}%`, height: 8 }} />
                  </div>
                  <span>{s.score.toFixed(2)}</span>
                </div>
              ))}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer' }}>시민 Top-5(최근)</summary>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {Object.entries(getCitizenTop5()).map(([id, list]) => (
                    <div key={id} style={{ marginBottom: 4 }}>
                      <div>#{id.slice(-4)}:</div>
                      {list.map((e, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.id}</span>
                          <div style={{ background: '#242', width: 100, height: 6 }}>
                            <div style={{ background: '#6f6', width: `${Math.min(100, Math.round(e.score * 10))}%`, height: 6 }} />
                          </div>
                          <span>{e.score.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })()}
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>전투(투사체 테스트)</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>최근 피해: {getLastDamage().toFixed(1)}</div>
        <button onClick={() => spawnProjectile([30, 1, 30], [0, 0, 0], 20, true)}>원거리 투사체(경계 밖 시작)</button>
        <button onClick={() => spawnProjectile([0, 1, 0], [30, 0, 30], 20, true)} style={{ marginLeft: 6 }}>원거리 투사체(경계 안 시작)</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <h4 style={{ margin: '8px 0 4px' }}>몬스터</h4>
        <div style={{ fontSize: 12, opacity: 0.9 }}>몬스터 수: {getMonsterCount()}</div>
        <button onClick={() => spawnMonster('Wolf')}>늑대 소환</button>
        <button onClick={() => spawnMonster('Goblin')} style={{ marginLeft: 6 }}>고블린 소환</button>
      </div>
      {/* 도로 수동 추가/표시는 RoadHelper로 대체 */}
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


