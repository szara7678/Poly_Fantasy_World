import React from 'react';
import { getSanctums } from '../../systems/SanctumSystem';
import { getNodes } from '../../systems/NodeRegenSystem';
import { computeDailyQuotas } from '../../systems/NodeRegenSystem';
import { addBlueprint } from '../../systems/BlueprintSystem';
import { getBuildPreview, cycleRoadType } from '../../systems/BuildPreviewSystem';
import type { RoadType } from '../../systems/RoadNetwork';
import { setPreviewLine, clearPreview } from '../../systems/RoadPreviewRender';

type Suggestion = {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  distance: number;
  score: number; // 간단: (quota)/(distance)
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
    addBlueprint('Road', [snap2(x), 0, snap2(z)], type);
    placed += 1;
  }
  return placed;
}

export function RoadHelper(): React.JSX.Element {
  const [, force] = React.useState(0);
  const [sugs, setSugs] = React.useState<Suggestion[]>([]);
  const [preview, setPreview] = React.useState<Suggestion | null>(null);

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
        const score = q / Math.max(10, d);
        out.push({
          id: `sg_${i}_${n.nodeId}`,
          from: s.center as any,
          to: n.position as any,
          label: `S#${i + 1} ↔ ${n.type}(${n.nodeId})`,
          distance: Math.round(d),
          score,
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
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={recompute}>추천 계산</button>
        <button onClick={() => setSugs([])}>지우기</button>
      </div>
      <div style={{ marginTop: 6 }}>
        {sugs.length === 0 && <div style={{ fontSize: 12, opacity: 0.8 }}>추천 없음. 성역/노드 또는 쿼터를 확인하세요.</div>}
        {sugs.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: 4, background: '#0e0e0e', marginBottom: 4 }}>
            <span>{s.label} · 거리 {s.distance}m</span>
            <button onClick={() => { setPreview(s); setPreviewLine({ id: s.id, from: s.from, to: s.to }); }} style={{ marginLeft: 'auto' }}>미리보기</button>
            <button onClick={() => build(s)}>청사진 생성</button>
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


