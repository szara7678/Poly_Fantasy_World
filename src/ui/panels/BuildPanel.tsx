import React from 'react';
import { getBuildPreview } from '../../systems/BuildPreviewSystem';
import { setBuildMode as _setBuildMode, cycleRoadType } from '../../systems/BuildPreviewSystem';
// 건물 직접 생성 버튼 제거: 청사진 흐름으로 일원화
import type { BuildingKind } from '../../systems/Buildings';
import type { BuildType } from '../../systems/BuildRules';
import costs from '../../data/costs.json' with { type: 'json' };

function summarizeCost(cfg: any): string {
  const cost = cfg?.cost ?? {};
  const time = cfg?.timeSec ?? 1.0;
  const parts = Object.entries(cost).map(([k, v]) => `${k}:${v}`).join(', ');
  return `t=${time}s${parts ? `, cost: ${parts}` : ''}`;
}

export function BuildPanel(): React.JSX.Element {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onTick = () => force((v) => v + 1);
    window.addEventListener('pfw-ui-tick', onTick as EventListener);
    return () => window.removeEventListener('pfw-ui-tick', onTick as EventListener);
  }, []);

  const s = getBuildPreview();
  const roadCfg = (costs as any).roadTypes?.[s.roadType] ?? { timeSec: 1.0, cost: {} };
  const buildingCfg = (costs as any).build?.Building ?? { timeSec: 1.5, cost: {} };

  const setMode = (m: BuildType | 'None'): void => {
    window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: m }));
    force((v) => v + 1);
  };

  return (
    <div>
      <h3>건설</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setMode('Building')} disabled={s.mode === 'Building'}>Building</button>
        <button onClick={() => setMode('Road')} disabled={s.mode === 'Road'}>Road</button>
        <button onClick={() => setMode('None')} disabled={s.mode === 'None'}>None</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-demolish-on'))}>철거 모드</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('pfw-demolish-off'))}>철거 해제</button>
      </div>
      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>건물 청사진(지도 클릭으로 배치):</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['House','Storage','Lumberyard','Smelter','Workshop','ResearchLab'] as BuildingKind[]).map((k) => (
            <button key={k} onClick={() => {
              // Build 모드로 전환하면 지도 클릭 시 해당 kind의 청사진 생성
              (window as any).__pfw_building_kind = k;
              setMode('Building');
            }}>{k}</button>
          ))}
        </div>
      </div>
      {s.mode === 'Road' && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>도로 유형: <b>{s.roadType}</b> <button style={{ marginLeft: 6 }} onClick={() => { cycleRoadType(); force(v => v + 1); }}>순환</button></div>
          <div style={{ opacity: 0.85 }}>스펙: {summarizeCost(roadCfg)}</div>
        </div>
      )}
      {s.mode === 'Building' && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>Building 스펙: {summarizeCost(buildingCfg)}</div>
          <div style={{ opacity: 0.85 }}>규칙: 성역 내부에서만 배치 가능</div>
          <div style={{ opacity: 0.85, marginTop: 2 }}>선택: {(window as any).__pfw_building_kind ?? 'House'}</div>
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.95 }}>
        현재: 모드 <b>{s.mode}</b> / 포인터 {s.hoverPos ? `(${s.hoverPos.map((v) => v.toFixed(1)).join(', ')})` : '—'} / {s.mode !== 'None' ? (s.isValid ? '배치 가능' : '배치 불가') : '미리보기 끔'}
      </div>
      {s.lastExplain && (
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{s.lastExplain}</div>
      )}
    </div>
  );
}


