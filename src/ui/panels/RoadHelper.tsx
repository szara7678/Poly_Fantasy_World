import React from 'react';
import { getSanctums } from '../../systems/SanctumSystem';
import { getNodes } from '../../systems/NodeRegenSystem';
import { computeDailyQuotas } from '../../systems/NodeRegenSystem';
import { addBlueprint } from '../../systems/BlueprintSystem';
import { getBuildPreview, cycleRoadType } from '../../systems/BuildPreviewSystem';
import type { RoadType } from '../../systems/RoadNetwork';
import { hasRoadNear } from '../../systems/RoadNetwork';
import { setPreviewLine, clearPreview } from '../../systems/RoadPreviewRender';
import costs from '../../data/costs.json' with { type: 'json' };
import { getMonsters } from '../../systems/MonsterSystem';
import { getRoadSlopeAllowance } from '../../systems/ResearchSystem';
import { getHeightAt } from '../../systems/BiomeSystem';

type Suggestion = {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  distance: number;
  score: number; // 종합 점수
  recommended?: { type: RoadType; reason: string };
};

function distanceXZ(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function snap2(v: number): number { return Math.round(v / 2) * 2; }

function placeRoadLine(from: [number, number, number], to: [number, number, number], type: RoadType): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return 0;
  const ux = dx / len;
  const uz = dz / len;
  const step = 2.0; // 타일 간격
  let placed = 0;
  for (let t = 0; t <= len; t += step) {
    const x = from[0] + ux * t;
    const z = from[2] + uz * t;
    // Skip if a blueprint or road already exists very near this snapped position
    const sx = snap2(x), sz = snap2(z);
    const closeRoad = hasRoadNear(sx, sz, 0.9);
    const bpList: any[] = (window as any).__pfw_blueprints ?? [];
    const closeBp = bpList.some(b => b.type === 'Road' && Math.abs(b.position[0] - sx) < 0.6 && Math.abs(b.position[2] - sz) < 0.6);
    if (!closeRoad && !closeBp) addBlueprint('Road', [sx, 0, sz], type);
    placed += 1;
  }
  return placed;
}

export function RoadHelper(): React.JSX.Element {
  const [, force] = React.useState(0);
  const [sugs, setSugs] = React.useState<Suggestion[]>([]);
  const [preview, setPreview] = React.useState<Suggestion | null>(null);
  // 가중치 조정: 수요/거리/경사/위험
  const [wQuota, setWQuota] = React.useState(1.0);
  const [wDist, setWDist] = React.useState(1.0);
  const [wSlope, setWSlope] = React.useState(1.0);
  const [wRisk, setWRisk] = React.useState(1.0);

  const recompute = (): void => {
    const sanctums = getSanctums();
    const nodes = getNodes();
    const quotas = new Map(computeDailyQuotas().map((q) => [q.nodeId, q.available]));
    const out: Suggestion[] = [];
    for (let i = 0; i < sanctums.length; i++) {
      const s = sanctums[i];
      for (const n of nodes) {
        const d = distanceXZ(s.center as any, n.position as any);
        const q = quotas.get(n.nodeId) ?? 0;
        if (q <= 0) continue;
        // 경사 제약/패널티
        function slopePenalty(from: [number, number, number], to: [number, number, number]): number {
          const allow = getRoadSlopeAllowance();
          const steps = 8;
          let penalty = 0;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from[0] + (to[0] - from[0]) * t;
            const z = from[2] + (to[2] - from[2]) * t;
            const x2 = from[0] + (to[0] - from[0]) * Math.min(1, t + 1 / steps);
            const z2 = from[2] + (to[2] - from[2]) * Math.min(1, t + 1 / steps);
            const h1 = getHeightAt(x, z);
            const h2 = getHeightAt(x2, z2);
            const dh = (h2 - h1) * 1.2;
            const dx = Math.hypot(x2 - x, z2 - z);
            const angle = Math.atan2(Math.abs(dh), Math.max(1e-3, dx));
            const deg = angle * 180 / Math.PI;
            if (deg > allow) return 0;
            if (deg > allow - 10) penalty += 0.1;
          }
          return Math.max(0.5, 1 - penalty);
        }
        const slope = slopePenalty(s.center as any, n.position as any);
        if (slope <= 0) continue;
        // 위험 패널티: 경로를 8구간 샘플링, 각 지점에서 가장 가까운 몬스터와의 거리 기반
        function riskPenalty(from: [number, number, number], to: [number, number, number]): number {
          const mons = getMonsters();
          if (mons.length === 0) return 1.0;
          const steps = 8;
          let mult = 1.0;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from[0] + (to[0] - from[0]) * t;
            const z = from[2] + (to[2] - from[2]) * t;
            let best = Infinity;
            for (const m of mons) {
              const d2 = Math.hypot(m.pos.x - x, m.pos.z - z);
              if (d2 < best) best = d2;
            }
            const local = best <= 10 ? 0.6 : best <= 20 ? 0.8 : 1.0;
            mult *= local;
          }
          return Math.max(0.5, mult);
        }
        const risk = riskPenalty(s.center as any, n.position as any);
        // 종합 점수: (q^wQuota) / (d^wDist) * slope^wSlope * risk^wRisk
        const score = Math.pow(Math.max(1, q), wQuota) / Math.pow(Math.max(10, d), wDist) * Math.pow(slope, wSlope) * Math.pow(risk, wRisk);
        // 추천 타입: 습지 다수 → Wood, 경사 높은 구간 → Stone, 기본 → Gravel
        function recommendType(from: [number, number, number], to: [number, number, number]): { type: RoadType; reason: string } {
          const steps = 8;
          let steep = 0;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from[0] + (to[0] - from[0]) * t;
            const z = from[2] + (to[2] - from[2]) * t;
            const x2 = from[0] + (to[0] - from[0]) * Math.min(1, t + 1 / steps);
            const z2 = from[2] + (to[2] - from[2]) * Math.min(1, t + 1 / steps);
            const h1 = getHeightAt(x, z);
            const h2 = getHeightAt(x2, z2);
            const dh = (h2 - h1) * 1.2;
            const dx = Math.hypot(x2 - x, z2 - z);
            const deg = Math.atan2(Math.abs(dh), Math.max(1e-3, dx)) * 180 / Math.PI;
            if (deg > 20) steep++;
          }
          // 간이 습지 판단: 바이옴 샘플링 일부가 Wetland 색(비용 높은 판잣길 추천)
          let wetCount = 0;
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const x = from[0] + (to[0] - from[0]) * t;
            const z = from[2] + (to[2] - from[2]) * t;
            // 높이/습도 기반 간접: 낮은 고도+높은 수분일 때 Wetland로 가정
            const h = getHeightAt(x, z);
            if (h > 0.37 && h < 0.55) wetCount++; // 평지/저지대 근처만 카운트(근사)
          }
          const wetFrac = wetCount / 7;
          if (wetFrac > 0.4) return { type: 'Wood', reason: '습지 구간 다수' } as any;
          if (steep > 2) return { type: 'Stone', reason: '경사 구간 다수' } as any;
          return { type: 'Gravel', reason: '일반 구간' } as any;
        }
        const rec = recommendType(s.center as any, n.position as any);
        out.push({
          id: `sg_${i}_${n.nodeId}`,
          from: s.center as any,
          to: n.position as any,
          label: `S#${i + 1} ↔ ${n.type}(${n.nodeId})`,
          distance: Math.round(d),
          score,
          recommended: rec,
        });
      }
    }
    out.sort((a, b) => b.score - a.score);
    setSugs(out.slice(0, 5));
  };

  const build = (sg: Suggestion): void => {
    const roadType = getBuildPreview().roadType;
    const placed = placeRoadLine(sg.from, sg.to, roadType);
    console.log(`Placed ${placed} road blueprints (${roadType}) from`, sg.from, 'to', sg.to);
    force((v) => v + 1);
  };

  const cycleType = (): void => { cycleRoadType(); force((v) => v + 1); };

  const roadType = getBuildPreview().roadType;

  return (
    <div>
      <h3>도로 도우미</h3>
      <div style={{ fontSize: 12, opacity: 0.9 }}>도로 유형: <b>{roadType}</b> <button style={{ marginLeft: 6 }} onClick={cycleType}>순환</button></div>
      <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
        {(() => {
          const cfg: any = (costs as any).roadTypes?.[roadType] ?? { cost: {} };
          const parts = Object.entries(cfg.cost ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || '무료';
          return `타일당 비용: ${parts}, 시간: ${cfg.timeSec ?? 1.0}s`;
        })()}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={recompute}>추천 계산</button>
        <button onClick={() => setSugs([])}>지우기</button>
      </div>
      <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 4, alignItems: 'center' }}>
        <div style={{ fontSize: 11 }}>가중치 수요</div>
        <input type="range" min={0.5} max={2} step={0.1} value={wQuota} onChange={(e) => setWQuota(parseFloat(e.target.value))} />
        <div style={{ fontSize: 11 }}>가중치 거리</div>
        <input type="range" min={0.5} max={2} step={0.1} value={wDist} onChange={(e) => setWDist(parseFloat(e.target.value))} />
        <div style={{ fontSize: 11 }}>가중치 경사</div>
        <input type="range" min={0.5} max={2} step={0.1} value={wSlope} onChange={(e) => setWSlope(parseFloat(e.target.value))} />
        <div style={{ fontSize: 11 }}>가중치 위험</div>
        <input type="range" min={0.5} max={2} step={0.1} value={wRisk} onChange={(e) => setWRisk(parseFloat(e.target.value))} />
      </div>
      <div style={{ marginTop: 6 }}>
        {sugs.length === 0 && <div style={{ fontSize: 12, opacity: 0.8 }}>추천 없음. 성역/노드 또는 쿼터를 확인하세요.</div>}
        {sugs.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: 4, background: '#0e0e0e', marginBottom: 4 }}>
            <span>{s.label} · 거리 {s.distance}m</span>
            {(() => {
              const cfg: any = (costs as any).roadTypes?.[roadType] ?? { cost: {} };
              const step = 2.0;
              const tiles = Math.max(1, Math.round(s.distance / step));
              const costParts = Object.entries(cfg.cost ?? {}).map(([k, v]) => `${k}:${(v as number) * tiles}`).join(', ') || '0';
              const time = (cfg.timeSec ?? 1.0) * tiles;
              return <span style={{ fontSize: 11, opacity: 0.85 }}> · 예산(추정): {costParts} · 시간 ~{Math.round(time)}s</span>;
            })()}
            {s.recommended && (
              <span style={{ fontSize: 11, opacity: 0.9 }}> · 추천: {s.recommended.type} ({s.recommended.reason})</span>
            )}
            <button onClick={() => { setPreview(s); setPreviewLine({ id: s.id, from: s.from, to: s.to }); }} style={{ marginLeft: 'auto' }}>미리보기</button>
            <button onClick={() => build(s)}>청사진 생성</button>
            {s.recommended && (
              <button onClick={() => {
                const placed = placeRoadLine(s.from, s.to, s.recommended!.type);
                console.log(`Placed ${placed} road blueprints (${s.recommended!.type}) from`, s.from, 'to', s.to);
                force(v => v + 1);
              }}>추천타입</button>
            )}
          </div>
        ))}
      </div>
      {preview && (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          미리보기 표시 중: {preview.label} <button onClick={() => { setPreview(null); clearPreview(); }}>해제</button>
        </div>
      )}
    </div>
  );
}


