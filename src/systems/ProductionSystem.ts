import type { GameWorld } from '../ecs';
import { getBuildingsByKind, type Building, isBuildingActive } from './Buildings';
import { upgradeBuilding, downgradeBuilding } from './Buildings';
// role-less mode: remove role counts influence
import { getThreat } from './MonsterSystem';
import { getSanctums } from './SanctumSystem';
import { speedFactorAt } from './RoadNetwork';
import { getQty, consume, addItem } from './Inventory';

// 간단 생산 체인 (MVP):
// Lumberyard: Wood -> Plank
// Smelter: Stone -> IronIngot (프로토: Stone을 광석 대용)
// Workshop: Plank + IronIngot -> Tool
// ResearchLab: Tool -> ResearchPoint
// Herbalist (미구현 렌더): Herb -> Tool(간이 회복제) 또는 RP 보조(이 예시는 추후 확장)

export type Product = 'Plank' | 'IronIngot' | 'Tool' | 'ResearchPoint';

declare module './Inventory' {
  interface ItemIdMapExtension { Plank: number; IronIngot: number; Tool: number; ResearchPoint: number; }
}

function nearSanctumBonus(x: number, z: number): number {
  const sanctums = getSanctums();
  for (const s of sanctums) {
    const dx = x - s.center[0];
    const dz = z - s.center[2];
    if (Math.hypot(dx, dz) <= s.radius * 0.5) return 1.1; // 성역 중심부 가산
    if (Math.hypot(dx, dz) <= s.radius) return 1.05;
  }
  return 1.0;
}

function nearStorageBonus(x: number, z: number): number {
  // Storage 인접 보너스: 8m 내에 Storage가 있으면 1.1 배
  const storages = getBuildingsByKind('Storage');
  for (const s of storages) {
    const dx = x - s.position[0];
    const dz = z - s.position[2];
    if (Math.hypot(dx, dz) <= 8) return 1.1;
  }
  return 1.0;
}

type ProdKind = 'Lumberyard' | 'Smelter' | 'Workshop' | 'ResearchLab' | 'Herbalist';

const jobProgress: Record<string, number> = {};

function hasActiveWorkerAt(building: Building): boolean {
  const plist: Array<string> = (globalThis as any).__pfw_near_producers ?? [];
  const counts: Record<string, number> = (globalThis as any).__pfw_near_producers_counts ?? {};
  if (!plist.includes(building.id)) return false;
  return (counts[building.id] ?? 0) > 0;
}

function tryProduce(kind: ProdKind, dt: number): void {
  const buildings = getBuildingsByKind(kind);
  const baseRate = 0.2; // per building per second
  // workstations: base soft/hard slots per building kind (plan v0.1)
  function getWorkstationsFor(kind: ProdKind, level = 1): { soft: number; hard: number } {
    const base = ((): { soft: number; hard: number } => {
      switch (kind) {
        case 'Lumberyard': return { soft: 2, hard: 3 };
        case 'Smelter': return { soft: 2, hard: 2 };
        case 'Workshop': return { soft: 2, hard: 3 };
        case 'ResearchLab': return { soft: 1, hard: 2 };
        case 'Herbalist': return { soft: 1, hard: 2 };
        default: return { soft: 1, hard: 2 };
      }
    })();
    // simple level scaling: +1 to both soft/hard per level above 1
    const bonus = Math.max(0, (level ?? 1) - 1);
    return { soft: base.soft + bonus, hard: base.hard + bonus };
  }
  for (const b of buildings) {
    // 수동 중지 시 생산하지 않음
    if (!isBuildingActive(b.id)) continue;
    // require an active Worker right next to the building (<=0.8m)
    if (!hasActiveWorkerAt(b)) continue;
    // 인접 보너스: 도로(이동/물류), 성역(사기/가호)
    const road = speedFactorAt(b.position[0], b.position[2]);
    const sanct = nearSanctumBonus(b.position[0], b.position[2]);
    const storage = nearStorageBonus(b.position[0], b.position[2]);
    // 동시 작업대: workstations.soft/hard(플랜) — 현재 인접한 작업자 수를 슬롯으로 간주
    const counts: Record<string, number> = (globalThis as any).__pfw_near_producers_counts ?? {};
    const weights: Record<string, number> = (globalThis as any).__pfw_near_producers_weights ?? {};
    const nWorkers = Math.max(1, Math.floor(counts[b.id] ?? 1));
    const wWorkers = Math.max(1, Math.floor((weights[b.id] ?? nWorkers)));
    const ws = getWorkstationsFor(kind, (b as any).level ?? 1);
    const soft = ws.soft; const hard = ws.hard;
    const eff = wWorkers <= soft ? wWorkers : (soft + 0.6 * (Math.min(hard, wWorkers) - soft));
    const levelMult = Math.max(1, (b as any).level ?? 1);
    const rate = baseRate * levelMult * Math.max(1.0, road) * sanct * storage * Math.max(1, eff);
    // progress model: accumulate to 1.0 then consume recipe and yield 1 output unit
    const key = `${kind}_${b.id}`;
    const prev = jobProgress[key] ?? 0;
    const next = prev + rate * dt;
    jobProgress[key] = next;
    if (next >= 1.0) {
      const can = ((): boolean => {
        if (kind === 'Lumberyard') return getQty('Wood') >= 1;
        if (kind === 'Smelter') return getQty('Stone') >= 1;
        if (kind === 'Workshop') return (getQty('Plank' as any) >= 1 && getQty('IronIngot' as any) >= 1);
        if (kind === 'ResearchLab') return (getQty('ManaRaw' as any) >= 1) || (getQty('Tool' as any) >= 1);
        if (kind === 'Herbalist') return getQty('Herb' as any) >= 1;
        return false;
      })();
      // 산출 용량이 가득 찼으면 생산 일시 정지(낭비 방지)
      const outFull = ((): boolean => {
        try {
          const inv: any = (globalThis as any).__pfw_inventory_api;
          const outItem = kind === 'Lumberyard' ? 'Plank' : kind === 'Smelter' ? 'IronIngot' : kind === 'Workshop' ? 'Tool' : 'ResearchPoint';
          const free = inv?.getFreeCapacity?.(outItem) ?? Infinity;
          return free <= 0;
        } catch { return false; }
      })();
      if (can && !outFull) {
        // marginal efficiency 툴팁: 현재 생산 효율 표시
        try {
          window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'System', text: `생산 ${kind} eff≈${eff.toFixed(2)} (workers ${nWorkers}/${soft}/${hard} lvl ${(b as any).level ?? 1})` } }));
        } catch {}
        if (kind === 'Lumberyard') { consume('Wood', 1); addItem('Plank' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '제재소 생산 +1 Plank (Wood -1)' } })); } catch {} }
        else if (kind === 'Smelter') { consume('Stone', 1); addItem('IronIngot' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '제련소 생산 +1 IronIngot (Stone -1)' } })); } catch {} }
        else if (kind === 'Workshop') { consume('Plank' as any, 1); consume('IronIngot' as any, 1); addItem('Tool' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '워크샵 생산 +1 Tool (Plank -1, IronIngot -1)' } })); } catch {} }
        else if (kind === 'ResearchLab') {
          if (getQty('ManaRaw' as any) >= 1) { consume('ManaRaw' as any, 1); addItem('ResearchPoint' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Research', text: '연구 진행 +1 RP (ManaRaw -1)' } })); } catch {} }
          else { consume('Tool' as any, 1); addItem('ResearchPoint' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Research', text: '연구 진행 +1 RP (Tool -1)' } })); } catch {} }
        }
        else if (kind === 'Herbalist') { consume('Herb' as any, 1); addItem('Tool' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '허브 작업소 생산 +1 Tool (Herb -1)' } })); } catch {} }
        jobProgress[key] = next - 1.0;
      }
    }
  }
}

export function ProductionSystem(_world: GameWorld, dt: number): void {
  const threat = getThreat();
  const scale = threat > 0.6 ? 0.9 : 1.0; // 전시 체제 생산 -10%
  // 역할 비율 보너스 제거 → 고정 보정치만 사용
  const builderBonus = 1.0;
  const researcherBonus = 1.0;
  const explorerBonus = 1.0;
  tryProduce('Lumberyard', dt * scale * explorerBonus);
  tryProduce('Smelter', dt * scale * explorerBonus);
  tryProduce('Workshop', dt * scale * builderBonus * explorerBonus);
  tryProduce('Herbalist', dt * scale * explorerBonus);
  tryProduce('ResearchLab', dt * scale * researcherBonus * explorerBonus);
  // clear producer presence list after this frame
  (globalThis as any).__pfw_near_producers = [];
  (globalThis as any).__pfw_near_producers_counts = {};

  // handle building actions from inspector (upgrade/downgrade)
  try {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; action: 'upgrade' | 'downgrade' | 'setLevel'; value?: number }>;
      if (!ce?.detail?.id) return;
      if (ce.detail.action === 'upgrade') upgradeBuilding(ce.detail.id);
      else if (ce.detail.action === 'downgrade') downgradeBuilding(ce.detail.id);
      else if (ce.detail.action === 'setLevel') {
        const v = Math.max(1, Math.min(5, Math.floor(ce.detail.value ?? 1)));
        try { (require('./Buildings') as any).setBuildingLevel?.(ce.detail.id, v); } catch {}
      }
    };
    if (!(globalThis as any).__pfw_bld_actions_bound) {
      window.addEventListener('pfw-building-action', handler as EventListener);
      (globalThis as any).__pfw_bld_actions_bound = true;
    }
  } catch {}
}


