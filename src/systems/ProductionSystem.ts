import type { GameWorld } from '../ecs';
import { getBuildingsByKind, type Building } from './Buildings';
import { getRoleCounts } from './CitizenSystem';
import { getThreat } from './MonsterSystem';
import { getSanctums } from './SanctumSystem';
import { speedFactorAt } from './RoadNetwork';
import { getQty, consume, addItem } from './Inventory';

// 간단 생산 체인 (MVP):
// Lumberyard: Wood -> Plank
// Smelter: Stone -> IronIngot (프로토: Stone을 광석 대용)
// Workshop: Plank + IronIngot -> Tool
// ResearchLab: Tool -> ResearchPoint

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

type ProdKind = 'Lumberyard' | 'Smelter' | 'Workshop' | 'ResearchLab';

const jobProgress: Record<string, number> = {};

function hasActiveWorkerAt(building: Building): boolean {
  const plist: Array<string> = (globalThis as any).__pfw_near_producers ?? [];
  return plist.includes(building.id);
}

function tryProduce(kind: ProdKind, dt: number): void {
  const buildings = getBuildingsByKind(kind);
  const baseRate = 0.2; // per building per second
  for (const b of buildings) {
    // require an active Worker right next to the building (<=0.8m)
    if (!hasActiveWorkerAt(b)) continue;
    // 인접 보너스: 도로(이동/물류), 성역(사기/가호)
    const road = speedFactorAt(b.position[0], b.position[2]);
    const sanct = nearSanctumBonus(b.position[0], b.position[2]);
    const storage = nearStorageBonus(b.position[0], b.position[2]);
    const rate = baseRate * Math.max(1.0, road) * sanct * storage;
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
        if (kind === 'ResearchLab') return getQty('Tool' as any) >= 1;
        return false;
      })();
      if (can) {
        if (kind === 'Lumberyard') { consume('Wood', 1); addItem('Plank' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '제재소 생산 +1 Plank (Wood -1)' } })); } catch {} }
        else if (kind === 'Smelter') { consume('Stone', 1); addItem('IronIngot' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '제련소 생산 +1 IronIngot (Stone -1)' } })); } catch {} }
        else if (kind === 'Workshop') { consume('Plank' as any, 1); consume('IronIngot' as any, 1); addItem('Tool' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: '워크샵 생산 +1 Tool (Plank -1, IronIngot -1)' } })); } catch {} }
        else if (kind === 'ResearchLab') { consume('Tool' as any, 1); addItem('ResearchPoint' as any, 1); try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Research', text: '연구 진행 +1 RP (Tool -1)' } })); } catch {} }
        jobProgress[key] = next - 1.0;
      }
    }
  }
}

export function ProductionSystem(_world: GameWorld, dt: number): void {
  const threat = getThreat();
  const scale = threat > 0.6 ? 0.9 : 1.0; // 전시 체제 생산 -10%
  // 연구자 비율이 높으면 연구 랩 보너스, 건설자 비율이 높으면 워크샵 보너스(간이)
  const rc = getRoleCounts();
  const total = Object.values(rc).reduce((a, b) => a + b, 0) || 1;
  const builderBonus = 1.0 + Math.min(0.3, ((rc['Builder'] ?? 0) / total) * 0.5);
  const researcherBonus = 1.0 + Math.min(0.3, ((rc['Researcher'] ?? 0) / total) * 0.5);
  tryProduce('Lumberyard', dt * scale);
  tryProduce('Smelter', dt * scale);
  tryProduce('Workshop', dt * scale * builderBonus);
  tryProduce('ResearchLab', dt * scale * researcherBonus);
  // clear producer presence list after this frame
  (globalThis as any).__pfw_near_producers = [];
}


