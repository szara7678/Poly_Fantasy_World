import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';
import { speedFactorAt } from './RoadNetwork';
import { addExploredStroke, addVisibleSector } from './FogOfWarSystem';
function isWorldVisibleLazy(x: number, z: number): boolean {
  try {
    const mod: any = (window as any).require?.('../systems/FogOfWarSystem');
    const fn = mod?.isWorldVisible as ((x:number,z:number)=>boolean) | undefined;
    return fn ? fn(x, z) : true;
  } catch { return true; }
}
import { listTargets } from './TargetSystem';
import { tryConsumeFromNodeAt, getNodes, releaseNodeSlot, pruneNodeReservations } from './NodeRegenSystem';
import { listJobChunks, reserveJobChunk, releaseJobChunk, effectiveWorkersFor, getJobChunk } from './JobChunkSystem';
import { getRoads } from './RoadNetwork';
import { addItem, getQty } from './Inventory';
import { getMultiplier } from './EdictSystem';
import { getThreat, damageNearestMonster, getMonsters } from './MonsterSystem';
import * as BP from './BlueprintSystem';
import { getBuildingsByKind, getBuildings } from './Buildings';
import type { BuildingKind } from './Buildings';

type TraitId = 'Diligent' | 'Coward' | 'Pious' | 'NightOwl' | 'Dexterous' | 'Indomitable';

interface Stats {
  STR: number; DEX: number; INT: number; VIT: number; WIS: number; CHA: number;
}

interface DerivedStats {
  HP: number; Stamina: number; Mana: number; Carry: number; Move: number;
}

type RoleId = 'Worker' | 'Guard' | 'Lumberjack' | 'Miner' | 'Builder' | 'Researcher' | 'Explorer';

interface Citizen {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  lastStroke: THREE.Vector3;
  state: 'Idle' | 'ToNode' | 'ToSanctum';
  carry: { item: 'Wood' | 'Stone' | null; qty: number; capacity: number };
  nodeTargetId: string | null;
  role: RoleId;
  roleCandidate?: RoleId;
  roleCandidateTimer?: number;
  fatigue: number; // 0.0 ~ 1.0
  aptitude: { Forest: number; IronMine: number; Hunt: number; Farm: number; Herd: number; Craft: number; Smith: number; Build: number; Alchemy: number; Heal: number; Research: number; Combat: number; Trade: number };
  traits: TraitId[];
  stats: Stats;
  derived: DerivedStats;
  thinkTimer: number;
  hp: number;
  atk?: number;
  range?: number;
  atkCd?: number;
  combatXp?: number;
  guardMode?: 'Patrol' | 'Chase' | 'Escort' | 'Heal';
  guardTimer?: number;
  guardPatrolPhase?: number;
  escortTargetId?: string;
  spawnSec?: number;
  hasInitialRole?: boolean;
  exploreTarget?: THREE.Vector3;
  exploreTimer?: number;
}

const citizens: Citizen[] = [];
export function getCitizens(): ReadonlyArray<Citizen> { return citizens; }
// 우선순위 디버거용: 시민별 Top-5 작업 스냅샷
type TopEntry = { id: string; score: number };
const citizenTop5: Map<string, TopEntry[]> = new Map();
export function getCitizenTop5(): Record<string, TopEntry[]> {
  const o: Record<string, TopEntry[]> = {};
  for (const [k, v] of citizenTop5.entries()) o[k] = v;
  return o;
}

export function spawnCitizen(count = 3): void {
  const s = getSanctums()[0];
  const center = s ? new THREE.Vector3(s.center[0], 0, s.center[2]) : new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 4;
    const pos = center.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    const tgt = center.clone().add(new THREE.Vector3(Math.cos(angle + Math.PI) * (r + 10), 0, Math.sin(angle + Math.PI) * (r + 10)));
    const stats: Stats = {
      STR: 8 + Math.floor(Math.random() * 5),
      DEX: 8 + Math.floor(Math.random() * 5),
      INT: 8 + Math.floor(Math.random() * 5),
      VIT: 8 + Math.floor(Math.random() * 5),
      WIS: 8 + Math.floor(Math.random() * 5),
      CHA: 8 + Math.floor(Math.random() * 5),
    };
    const derived: DerivedStats = {
      HP: 50 + stats.VIT * 10,
      Stamina: 50 + (stats.STR + stats.DEX) * 5,
      Mana: 30 + (stats.INT + stats.WIS) * 8,
      Carry: 20 + stats.STR * 2,
      Move: 3.5 * (1 + stats.DEX / 50),
    };
    const traitPool: TraitId[] = ['Diligent', 'Coward', 'Pious', 'NightOwl', 'Dexterous', 'Indomitable'];
    const traits: TraitId[] = [];
    if (Math.random() < 0.9) traits.push(traitPool[Math.floor(Math.random() * traitPool.length)]);
    if (Math.random() < 0.4) traits.push(traitPool[Math.floor(Math.random() * traitPool.length)]);
    const carryCap = Math.max(1, Math.floor(derived.Carry / 10));
    citizens.push({ id: `cz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, pos, vel: new THREE.Vector3(), target: tgt, lastStroke: pos.clone(), state: 'Idle', carry: { item: null, qty: 0, capacity: carryCap }, nodeTargetId: null, role: 'Worker', roleCandidate: undefined, roleCandidateTimer: 0, fatigue: 0, aptitude: {
      Forest: 0.9 + Math.random() * 0.4,
      IronMine: 0.9 + Math.random() * 0.4,
      Hunt: 0.8 + Math.random() * 0.6,
      Farm: 0.8 + Math.random() * 0.6,
      Herd: 0.8 + Math.random() * 0.6,
      Craft: 0.8 + Math.random() * 0.6,
      Smith: 0.8 + Math.random() * 0.6,
      Build: 0.8 + Math.random() * 0.6,
      Alchemy: 0.7 + Math.random() * 0.6,
      Heal: 0.7 + Math.random() * 0.6,
      Research: 0.7 + Math.random() * 0.6,
      Combat: 0.8 + Math.random() * 0.6,
      Trade: 0.7 + Math.random() * 0.6,
    }, traits, stats, derived, thinkTimer: 0, hp: derived.HP, atk: 6 + Math.floor(stats.STR / 4), range: 1.5, atkCd: 0, combatXp: 0, spawnSec: performance.now() / 1000, hasInitialRole: false });
  }
}

export function getCitizenCount(): number { return citizens.length; }
export function getRoleCounts(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of citizens) m[c.role] = (m[c.role] ?? 0) + 1;
  return m;
}

export function countCitizensNear(x: number, z: number, radius: number, role?: string): number {
  const r2 = radius * radius;
  let n = 0;
  for (const c of citizens) {
    if (role && c.role !== (role as any)) continue;
    const dx = c.pos.x - x; const dz = c.pos.z - z;
    if (dx * dx + dz * dz <= r2) n += 1;
  }
  return n;
}

export function damageNearestCitizen(x: number, z: number, amount: number, radius = 1.5): boolean {
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d <= radius && d < bestD) { bestD = d; bestIdx = i; }
  }
  if (bestIdx >= 0) {
    const c = citizens[bestIdx];
    c.hp = Math.max(0, (c.hp ?? c.derived.HP) - amount);
    try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Combat', text: `시민 피격 -${amount.toFixed(0)} HP` } })); } catch {}
    if (c.hp <= 0) {
      try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Combat', text: `시민 사망` } })); } catch {}
      citizens.splice(bestIdx, 1);
    }
    return true;
  }
  return false;
}
// expose for monsters without circular import
(globalThis as any).__pfw_damageCitizen = damageNearestCitizen;

export function CitizenSystem(_world: GameWorld, dt: number): void {
  // 예약 타임아웃 정리
  pruneNodeReservations();
  const threat = getThreat();
  // 중앙 계획 기반 역할 배분 (초기/주기적 강제 배치 포함)
  type StaffingPlan = { Guard: number; Lumberjack: number; Miner: number; Builder: number; Researcher: number; Explorer: number; Worker: number };
  function clamp(n: number, a: number, b: number): number { return Math.min(b, Math.max(a, n)); }
  const pop = citizens.length;
  const bpCount = ((globalThis as any).__pfw_blueprints as any[])?.length ?? 0;
  const desired = { Wood: 50, Stone: 50, RP: 50 };
  const stock = { Wood: (getQty as any)('Wood') ?? 0, Stone: (getQty as any)('Stone') ?? 0, RP: (getQty as any)('ResearchPoint') ?? 0 };
  const scarcity = {
    Wood: clamp((desired.Wood - stock.Wood) / Math.max(1, desired.Wood), 0, 1),
    Stone: clamp((desired.Stone - stock.Stone) / Math.max(1, desired.Stone), 0, 1),
    RP: clamp((desired.RP - stock.RP) / Math.max(1, desired.RP), 0, 1),
  };
  const labs = getBuildingsByKind('ResearchLab' as any).length;
  // 초깃값(비율 기반)
  let target: StaffingPlan = {
    Guard: Math.round(pop * clamp(threat * 0.6, 0.0, 0.35)),
    Lumberjack: Math.round(pop * clamp(0.12 + 0.25 * scarcity.Wood, 0.05, 0.4)),
    Miner: Math.round(pop * clamp(0.10 + 0.25 * scarcity.Stone, 0.05, 0.4)),
    Builder: Math.round(Math.min(pop * 0.25, bpCount * 0.7)),
    Researcher: labs > 0 ? Math.round(pop * clamp(0.04 + 0.15 * scarcity.RP, 0, 0.25)) : 0,
    Explorer: Math.round(pop * 0.1),
    Worker: 0,
  };
  // 위협이 낮으면 가드 최소 0, 위협이 있으면 최소 1
  if (threat > 0.2) target.Guard = Math.max(1, target.Guard);
  // 합계 보정
  const sum = target.Guard + target.Lumberjack + target.Miner + target.Builder + target.Researcher + target.Explorer;
  if (sum > pop) {
    const scale = pop / Math.max(1, sum);
    target.Guard = Math.floor(target.Guard * scale);
    target.Lumberjack = Math.floor(target.Lumberjack * scale);
    target.Miner = Math.floor(target.Miner * scale);
    target.Builder = Math.floor(target.Builder * scale);
    target.Researcher = Math.floor(target.Researcher * scale);
    target.Explorer = Math.floor(target.Explorer * scale);
  }
  target.Worker = Math.max(0, pop - (target.Guard + target.Lumberjack + target.Miner + target.Builder + target.Researcher + target.Explorer));
  // 시민 적합도 매트릭스
  function fitScore(c: Citizen, role: RoleId): number {
    const fatigue = 1 - c.fatigue;
    let s = 1.0;
    if (role === 'Guard') {
      s = ((c.stats?.STR ?? 10) / 10) * (1 + (c.aptitude?.Combat ?? 1) * 0.3) * (c.traits?.includes('Indomitable') ? 1.1 : 1.0) * (c.traits?.includes('Coward') ? 0.85 : 1.0);
    } else if (role === 'Lumberjack') {
      s = (c.aptitude?.Forest ?? 1) * (((c.stats?.STR ?? 10) + (c.stats?.DEX ?? 10)) / 20) * (c.traits?.includes('Diligent') ? 1.05 : 1.0);
    } else if (role === 'Miner') {
      s = (c.aptitude?.IronMine ?? 1) * (((c.stats?.STR ?? 10) + (c.stats?.VIT ?? 10)) / 20) * (c.traits?.includes('Diligent') ? 1.05 : 1.0);
    } else if (role === 'Builder') {
      s = (c.aptitude?.Build ?? 1) * (((c.stats?.STR ?? 10) + (c.stats?.DEX ?? 10)) / 20) * (c.traits?.includes('Dexterous') ? 1.05 : 1.0);
    } else if (role === 'Researcher') {
      s = (c.aptitude?.Research ?? 1) * (((c.stats?.INT ?? 10) + (c.stats?.WIS ?? 10)) / 20) * (c.traits?.includes('Pious') ? 1.05 : 1.0);
    } else if (role === 'Explorer') {
      s = (((c.stats?.DEX ?? 10) + (c.stats?.WIS ?? 10)) / 20) * (c.traits?.includes('NightOwl') ? 1.05 : 1.0);
    } else {
      s = 1.0;
    }
    // 현재 동일 역할 유지시 작은 보너스(안정성)
    if (c.role === role) s *= 1.08;
    return s * fatigue;
  }
  function nodeAptKey(nodeType: string): keyof Citizen['aptitude'] | undefined {
    if (nodeType === 'Forest') return 'Forest';
    if (nodeType === 'IronMine') return 'IronMine';
    if (nodeType === 'HerbPatch') return 'Alchemy';
    if (nodeType === 'ManaSpring') return 'Research';
    return undefined as any;
  }
  // 역할별 할당
  const roles: RoleId[] = ['Guard', 'Lumberjack', 'Miner', 'Builder', 'Researcher', 'Explorer', 'Worker'];
  const desiredList: Array<{ role: RoleId; count: number }> = [
    { role: 'Guard', count: target.Guard },
    { role: 'Lumberjack', count: target.Lumberjack },
    { role: 'Miner', count: target.Miner },
    { role: 'Builder', count: target.Builder },
    { role: 'Researcher', count: target.Researcher },
    { role: 'Explorer', count: target.Explorer },
    { role: 'Worker', count: target.Worker },
  ];
  const unpicked = new Set(citizens.map(c => c.id));
  const planAssignment = new Map<string, RoleId>();
  for (const { role, count } of desiredList) {
    if (count <= 0) continue;
    // 남은 시민 중 해당 역할 적합도 순으로 선발
    const sorted = citizens
      .filter(c => unpicked.has(c.id))
      .map(c => ({ c, s: fitScore(c, role) }))
      .sort((a, b) => b.s - a.s);
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const id = sorted[i].c.id;
      planAssignment.set(id, role);
      unpicked.delete(id);
    }
  }
  // 히스테리시스 적용 + 초기 배치: 스폰 5초 이내에는 더 짧은 히스테리시스로 빠르게 배치
  for (const c of citizens) {
    const want = planAssignment.get(c.id) ?? 'Worker';
    if (c.role !== want) {
      if (c.roleCandidate !== want) { c.roleCandidate = want; c.roleCandidateTimer = 0; }
      else {
        c.roleCandidateTimer = (c.roleCandidateTimer ?? 0) + dt;
        const age = (performance.now() / 1000) - (c.spawnSec ?? 0);
        const hysteresis = age < 5 ? 5 : 60; // 스폰 직후 5초, 이후엔 60초
        if ((c.roleCandidateTimer ?? 0) >= hysteresis) {
          const prev = c.role;
          c.role = want;
          c.roleCandidate = undefined;
          c.roleCandidateTimer = 0;
          try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Citizen', text: `역할 배치: ${prev} → ${want}` } })); } catch {}
        }
      }
    } else {
      c.roleCandidate = undefined; c.roleCandidateTimer = 0;
    }
  }
  // 스폰 직후 모두 Worker로 보이는 현상 완화: 초기 한 번 즉시 반영 플래그
  for (const c of citizens) {
    if (!c.hasInitialRole) {
      const want = planAssignment.get(c.id) ?? c.role;
      c.role = want;
      c.hasInitialRole = true;
    }
  }
  try { (globalThis as any).__pfw_staffing_plan = { target, current: roles.reduce((m, r) => (m[r] = citizens.filter(c => c.role === r).length, m), {} as any) }; } catch {}
  try { (globalThis as any).__pfw_roles = roles.reduce((m, r) => (m[r] = citizens.filter(c => c.role === r).length, m), {} as any); } catch {}
  for (const c of citizens) {
    // 상태 전이: Idle -> ToNode (가까운 노드 선택), ToNode에서 도착 시 채집, ToSanctum에서 도착 시 납품
    const sanctum = getSanctums()[0];
    const sanctumCenter = sanctum ? new THREE.Vector3(sanctum.center[0], 0, sanctum.center[2]) : new THREE.Vector3(0, 0, 0);
    function getDepositTargets(): Array<{ pos: THREE.Vector3; type: 'Storage' | 'Sanctum'; id?: string }> {
      const arr: Array<{ pos: THREE.Vector3; type: 'Storage' | 'Sanctum'; id?: string }> = [];
      try {
        const stores = getBuildingsByKind('Storage' as any);
        for (const s of stores) arr.push({ pos: new THREE.Vector3(s.position[0], 0, s.position[2]), type: 'Storage', id: s.id });
      } catch {}
      if (sanctum) arr.push({ pos: sanctumCenter.clone(), type: 'Sanctum' });
      return arr;
    }
    function getNearestDeposit(from: THREE.Vector3): { pos: THREE.Vector3; type: 'Storage' | 'Sanctum'; id?: string } | null {
      const tgs = getDepositTargets();
      let best: any = null; let bestD = Infinity;
      for (const t of tgs) {
        const d = from.distanceTo(t.pos);
        if (d < bestD) { bestD = d; best = t; }
      }
      return best;
    }

    if (c.role === 'Guard') {
      // 경비 고도화: 상태 기반(Patrol/Chase/Escort/Heal)
      c.guardTimer = Math.max(0, (c.guardTimer ?? 0) - dt);
      const sanctum = getSanctums()[0];
      const center = sanctum ? new THREE.Vector3(sanctum.center[0], 0, sanctum.center[2]) : new THREE.Vector3(0, 0, 0);
      const mons = getMonsters();
      // 주변 위협 스캔(25m)
      let tgtM: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const m0 of mons) {
        const d = Math.hypot(m0.pos.x - c.pos.x, m0.pos.z - c.pos.z);
        if (d < 25 && d < bestD) { bestD = d; tgtM = { x: m0.pos.x, z: m0.pos.z }; }
      }
      // 부상 시민 호위/치유 우선(가까운 시민 HP 낮음)
      let lowCitizen: any = null; let lowD = Infinity;
      for (const cc of citizens) {
        const hp = cc.hp ?? cc.derived.HP;
        if (hp <= 0) continue;
        if (hp < (cc.derived.HP * 0.5)) {
          const d = Math.hypot(cc.pos.x - c.pos.x, cc.pos.z - c.pos.z);
          if (d < 18 && d < lowD) { lowD = d; lowCitizen = cc; }
        }
      }
      // 모드 전환 우선순위: Chase(위협) > Escort(부상 시민) > Patrol
      if (tgtM) c.guardMode = 'Chase';
      else if (lowCitizen) c.guardMode = 'Escort';
      else if (!c.guardMode || c.guardTimer <= 0) { c.guardMode = 'Patrol'; c.guardTimer = 6 + Math.random() * 6; }

      if (c.guardMode === 'Chase' && tgtM) {
        // 약간의 예측 사격: 목표 방향으로 소폭 리드
        const lead = 0.6;
        const to = new THREE.Vector3(tgtM.x, 0, tgtM.z);
        c.target.copy(to.multiplyScalar(1 + 0.0).add(new THREE.Vector3((Math.random()-0.5)*lead, 0, (Math.random()-0.5)*lead)));
      } else if (c.guardMode === 'Escort' && lowCitizen) {
        // 부상 시민 근처를 원형으로 호위(거리 2.5m)
        const ang = performance.now() / 1000 + parseInt(c.id.slice(-2), 36);
        const r = 2.5;
        c.target.set(lowCitizen.pos.x + Math.cos(ang) * r, 0, lowCitizen.pos.z + Math.sin(ang) * r);
      } else {
        // 성역 경계 순찰: 3~5개 웨이포인트를 천천히 순환
        const phase = (c.guardPatrolPhase ?? 0) + dt * 0.2;
        c.guardPatrolPhase = phase % (Math.PI * 2);
        const r = sanctum ? sanctum.radius + 4 : 20;
        const ang = c.guardPatrolPhase + (parseInt(c.id.slice(-2), 36) % 10) * 0.4;
        c.target.set(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
      }
      // 공격 처리 및 경험치
      c.atkCd = Math.max(0, (c.atkCd ?? 0) - dt);
      if ((c.atkCd ?? 0) <= 0) {
        const ok = damageNearestMonster(c.pos.x, c.pos.z, c.atk ?? 6, c.range ?? 1.5);
        if (ok) {
          c.atkCd = 0.85;
          c.combatXp = (c.combatXp ?? 0) + 1;
          if ((c.combatXp ?? 0) % 7 === 0) { c.atk = (c.atk ?? 6) + 1; }
        }
      }
    } else if (c.role === 'Builder') {
      // 건설 보조: 가까운 청사진 주변을 왕복하며 빌드 보너스 제공
      const bps = BP.getBlueprints();
      // 필수 체인 건물 자가 청사진 생성(부족 시)
      const need = {
        Plank: (getQty as any)('Plank') ?? 0,
        IronIngot: (getQty as any)('IronIngot') ?? 0,
        Tool: (getQty as any)('Tool') ?? 0,
        ResearchPoint: (getQty as any)('ResearchPoint') ?? 0,
      };
      const hasBpKind = (k: BuildingKind) => bps.some((b: any) => b.type === 'Building' && b.buildingKind === k);
      const hasKind = (k: BuildingKind) => getBuildingsByKind(k).length > 0;
      const sanc = getSanctums()[0];
      const placeNear = (k: BuildingKind) => {
        if (!sanc) return;
        const existing = getBuildingsByKind(k).length + bps.filter((b: any) => b.buildingKind === k).length;
        // 시도 횟수 제한 내에서 겹침/자원부족 시 조용히 포기
        for (let attempt = 0; attempt < 6; attempt++) {
          const angle = (existing * 0.8 + Math.random()) * Math.PI * 2;
          const radius = Math.max(4, Math.min(sanc.radius * 0.7, 6 + existing * 3));
          const pos: [number, number, number] = [
            sanc.center[0] + Math.cos(angle) * radius,
            0,
            sanc.center[2] + Math.sin(angle) * radius,
          ];
           const ok = BP.addBlueprint?.('Building' as any, pos, undefined, k, { silent: true, priority: 'High' });
          if (ok) break;
        }
      };
      // 자원 충분 시에만 자동 청사진 생성: 초반 자원 부족으로 대기하는 문제 방지
      const woodEnough = (getQty as any)('Wood') >= 10;
      const stoneEnough = (getQty as any)('Stone') >= 10;
      const plankEnough = (getQty as any)('Plank') >= 6;
      const ironEnough = (getQty as any)('IronIngot') >= 6;
      const toolEnough = (getQty as any)('Tool') >= 2;
      const canSpawnBasic = woodEnough || stoneEnough || plankEnough || ironEnough || toolEnough;
       if (canSpawnBasic) {
        // 우선순위: Lumberyard -> Smelter -> Workshop -> ResearchLab
         // 용량 포화 시, 생산 건물 먼저
         const invApi: any = (globalThis as any).__pfw_inventory_api;
         const woodCapFree = invApi?.getFreeCapacity?.('Wood') ?? Infinity;
         const stoneCapFree = invApi?.getFreeCapacity?.('Stone') ?? Infinity;
         const plankCapFree = invApi?.getFreeCapacity?.('Plank') ?? Infinity;
         const ironCapFree = invApi?.getFreeCapacity?.('IronIngot') ?? Infinity;
         const fullWood = woodCapFree <= 0; const fullStone = stoneCapFree <= 0;
         const wantLumberyard = fullWood && plankCapFree > 0;
         const wantSmelter = fullStone && ironCapFree > 0;
         if ((need.Plank < 20 || wantLumberyard) && !hasKind('Lumberyard') && !hasBpKind('Lumberyard')) {
          placeNear('Lumberyard');
         } else if ((need.IronIngot < 15 || wantSmelter) && !hasKind('Smelter') && !hasBpKind('Smelter')) {
          placeNear('Smelter');
        } else if (need.Tool < 10 && !hasKind('Workshop') && !hasBpKind('Workshop')) {
          placeNear('Workshop');
        } else if (need.ResearchPoint < 10 && !hasKind('ResearchLab') && !hasBpKind('ResearchLab')) {
          placeNear('ResearchLab');
        }
      }
      if (bps.length > 0) {
        // pick nearest blueprint
        let best: any = null; let bestD = Infinity;
        for (const b of bps) {
          const d = Math.hypot((b.position?.[0] ?? 0) - c.pos.x, (b.position?.[2] ?? 0) - c.pos.z);
          if (d < bestD) { bestD = d; best = b; }
        }
        if (best) {
          const target = new THREE.Vector3(best.position[0], 0, best.position[2]);
          c.target.copy(target);
          // expose assist point for BuildSystem
          const arr = ((globalThis as any).__pfw_build_assists as Array<{ pos: [number, number, number]; mult: number }>) ?? [];
          (globalThis as any).__pfw_build_assists = arr;
          const existing = arr.find(a => Math.hypot(a.pos[0] - c.pos.x, a.pos[2] - c.pos.z) < 0.5);
          if (!existing) arr.push({ pos: [c.pos.x, 0, c.pos.z], mult: 1.0 });
          // also expose builder presence list for BuildSystem to allow starting work gates
          // append builder presence; BuildSystem will clear each tick
          const near = ((globalThis as any).__pfw_near_builders as Array<[number, number, number]>) ?? [];
          (globalThis as any).__pfw_near_builders = near;
          near.push([c.pos.x, 0, c.pos.z]);
        }
      }
      // 자원도 없고 청사진도 없으면 Builder 고집 X: Worker로 빠르게 회귀 유도
      if (((globalThis as any).__pfw_blueprints as any[])?.length === 0 && !canSpawnBasic) {
        c.roleCandidate = 'Worker';
        c.roleCandidateTimer = 120; // 바로 전직 턴으로 유도
      }
    } else if (c.role === 'Researcher') {
      // 연구자는 연구실로 이동하여 대기(생산은 ProductionSystem이 처리)
      const labs = getBuildingsByKind('ResearchLab' as any);
      if (labs.length > 0) {
        // pick nearest lab
        let best = labs[0];
        let bestD = Infinity;
        for (const b of labs) {
          const d = Math.hypot(b.position[0] - c.pos.x, b.position[2] - c.pos.z);
          if (d < bestD) { bestD = d; best = b; }
        }
        c.target.set(best.position[0], 0, best.position[2]);
      }
    } else if (c.role === 'Explorer') {
      // 안개가 남아있는 방향으로 이동하여 밝힘
      const sanc = getSanctums()[0];
      const base = sanc ? new THREE.Vector3(sanc.center[0], 0, sanc.center[2]) : new THREE.Vector3(0,0,0);
      c.exploreTimer = Math.max(0, (c.exploreTimer ?? 0) - dt);
      const needNew = !c.exploreTarget || c.exploreTimer <= 0 || c.pos.distanceTo(c.exploreTarget) < 1.5;
      if (needNew) {
        let best: THREE.Vector3 | null = null; let bestScore = -Infinity;
        for (let i = 0; i < 16; i++) {
          const ang = Math.random() * Math.PI * 2;
          const r = 30 + Math.random() * 90;
          const x = base.x + Math.cos(ang) * r;
          const z = base.z + Math.sin(ang) * r;
          const vis = isWorldVisibleLazy(x, z);
          const score = (vis ? -2 : 2) + Math.random() * 0.5 - c.pos.distanceTo(new THREE.Vector3(x,0,z)) * 0.01;
          if (score > bestScore) { bestScore = score; best = new THREE.Vector3(x,0,z); }
        }
        c.exploreTarget = best ?? base.clone();
        c.exploreTimer = 6 + Math.random() * 6;
      }
      c.target.copy(c.exploreTarget ?? base);
    } else if (c.role === 'Worker') {
      // 생산 건물로 이동하여 운영(ProductionSystem이 처리)
      const priorities: Array<{ kind: BuildingKind; need: number }> = [
        { kind: 'Lumberyard' as any, need: (getQty as any)('Plank') < 50 ? 1 : 0 },
        { kind: 'Smelter' as any, need: (getQty as any)('IronIngot') < 40 ? 1 : 0 },
        { kind: 'Workshop' as any, need: (getQty as any)('Tool') < 30 ? 1 : 0 },
      ];
      let targetB: any = null;
      let bestScore = -1;
      for (const p of priorities) {
        if (p.need <= 0) continue;
        const list = getBuildingsByKind(p.kind);
        for (const b of list) {
          const d = Math.hypot(b.position[0] - c.pos.x, b.position[2] - c.pos.z);
          const score = p.need / Math.max(1, d);
          if (score > bestScore) { bestScore = score; targetB = b; }
        }
      }
      if (targetB) {
        c.target.set(targetB.position[0] + 0.8, 0, targetB.position[2] + 0.0);
        // mark presence when adjacent (list + counts)
        if (Math.hypot(c.pos.x - targetB.position[0], c.pos.z - targetB.position[2]) <= 0.9) {
          const arr: Array<string> = (globalThis as any).__pfw_near_producers ?? [];
          (globalThis as any).__pfw_near_producers = arr;
          if (!arr.includes(targetB.id)) arr.push(targetB.id);
          const counts: Record<string, number> = (globalThis as any).__pfw_near_producers_counts ?? {};
          (globalThis as any).__pfw_near_producers_counts = counts;
          counts[targetB.id] = (counts[targetB.id] ?? 0) + 1;
        }
      }
    } else if (c.state === 'Idle') {
      // 타겟 지시가 있으면 우선 이동(최고 우선)
      const tg = listTargets()[0];
      if (tg) {
        c.state = 'ToNode';
        c.target.set(tg.position[0], 0, tg.position[2]);
        c.nodeTargetId = null;
      } else {
      // 유틸리티 점수: 거리(역수) × 잔여량 × (슬롯 효율 보정) × 위험 보정
      // 작업 청크 기반 선택
      const chunks = listJobChunks();
      let best: { id: string; pos: [number, number, number]; score: number } | null = null;
       for (const ch of chunks) {
        if (ch.available <= 0) continue;
         // 미탐색 지역의 작업은 제외
         if (!isWorldVisibleLazy(ch.position[0], ch.position[2])) continue;
        const d = Math.max(1, c.pos.distanceTo(new THREE.Vector3(ch.position[0], 0, ch.position[2])));
        const eff = effectiveWorkersFor(ch.id, ch.reserved + 1) - effectiveWorkersFor(ch.id, ch.reserved);
        // 위험 보정: 성역 반경 밖 작업은 전시 위협도에 따라 감소. 겁쟁이 특성이면 더 큰 패널티
        let riskMult = 1.0;
        const sanc0 = getSanctums()[0];
        if (sanc0) {
          const dd = Math.hypot(ch.position[0] - sanc0.center[0], ch.position[2] - sanc0.center[2]);
          if (dd > sanc0.radius) {
            const threatNow = getThreat();
            const vuln = c.traits?.includes('Coward') ? 0.6 : 0.3;
            riskMult = Math.max(0.4, 1 - Math.min(0.6, threatNow * vuln));
          }
        }
        const score = (ch.available / d) * Math.max(0.2, eff) * riskMult;
        if (!best || score > best.score) best = { id: ch.id, pos: ch.position, score };
      }
      if (best && reserveJobChunk(best.id)) {
        c.nodeTargetId = best.id;
        c.state = 'ToNode';
        c.target.set(best.pos[0], 0, best.pos[2]);
      }
      }
    }

    const dir = c.target.clone().sub(c.pos);
    const dist = dir.length();
    const loadPenalty = 0.05 * c.carry.qty;
    const moveBase = Math.max(1.2, (c.derived?.Move ?? 2.0) * (1 - loadPenalty));
    // 특성/야간 보정
    const tsec = performance.now() / 1000;
    const isNight = Math.floor(tsec / 60) % 2 === 1; // 60s 주기 야간/주간
    let traitMoveMult = 1.0;
    if (c.traits?.includes('Dexterous')) traitMoveMult *= 1.05;
    if (isNight) traitMoveMult *= c.traits?.includes('NightOwl') ? 1.05 : 0.95;
    if (threat > 0.6 && c.traits?.includes('Coward') && c.role !== 'Guard') traitMoveMult *= 0.9;
    const base = moveBase * (threat > 0.6 ? 0.95 : 1.0) * traitMoveMult; // 전시 체제 시 소폭 이동 억제
    const factor = speedFactorAt(c.pos.x, c.pos.z);
    // 경로 평균 비용 근사: 현재 위치→타겟을 6구간으로 샘플링하여 평균 도로 계수 반영
    function pathFactorApprox(from: THREE.Vector3, to: THREE.Vector3): number {
      const steps = 6;
      let sum = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        sum += speedFactorAt(x, z);
      }
      return sum / (steps + 1);
    }
    const pf = pathFactorApprox(c.pos, c.target);
    const spd = base * Math.max(factor, pf);
    if (dist > 0.001) {
      dir.multiplyScalar(1 / dist);
      // 위험 회피: 몬스터 근접 시 반발 벡터 추가(간이)
      const mons = getMonsters();
      let repel = new THREE.Vector3();
      for (const m of mons) {
        const dx = c.pos.x - m.pos.x; const dz = c.pos.z - m.pos.z;
        const d2 = Math.hypot(dx, dz);
        const radius = 10;
        if (d2 < radius && d2 > 1e-3) {
          const w = (radius - d2) / radius;
          repel.add(new THREE.Vector3(dx / d2, 0, dz / d2).multiplyScalar(w));
        }
      }
      if (repel.lengthSq() > 1e-6) {
        repel.normalize().multiplyScalar(0.6);
        dir.add(repel).normalize();
      }
      c.vel.copy(dir).multiplyScalar(spd);
      c.pos.addScaledVector(c.vel, dt);
      // 피로 축적
      c.fatigue = Math.min(1, c.fatigue + dt * 0.02);
       // FoW: 이동 시 탐사 스트로크 + 시민 주변 가시 스탬프
       const dStroke = c.lastStroke.distanceTo(c.pos);
       if (dStroke > 1.5) {
         // 거리 기반 반지름 조절(이동 속도 빠르면 넓게)
         const speed = c.vel.length();
         const pathRadius = THREE.MathUtils.clamp(6 + speed * 2.5, 6, 12);
         addExploredStroke([[c.lastStroke.x, c.lastStroke.z], [c.pos.x, c.pos.z]], pathRadius);
         c.lastStroke.copy(c.pos);
       }
       // 시민 전방 부채꼴 + 후방 약간의 시야(사람형 시야 모델)
       if (c.vel.lengthSq() > 0.0025) {
         const dir = Math.atan2(c.vel.z, c.vel.x);
         const frontRadius = 14;
         const fov = (100 * Math.PI) / 180;
         addVisibleSector([c.pos.x, c.pos.z], frontRadius, dir, fov);
         // 약한 후방 시야
         addVisibleSector([c.pos.x, c.pos.z], 6, dir + Math.PI, (40 * Math.PI) / 180);
       }
      if (dist <= 1.2) {
        if (c.role !== 'Guard' && c.state === 'ToNode' && c.nodeTargetId) {
          const ch = getJobChunk(c.nodeTargetId);
          if (ch && ch.kind === 'Maintain') {
            const roads = getRoads();
            const r = roads.find(rr => rr.id === ch.nodeId);
            if (r) {
              (c as any).maintWork = ((c as any).maintWork ?? 0) + dt;
              if ((c as any).maintWork >= 4.0) {
                const gain = 0.15;
                r.durability = Math.min(1.0, (r.durability ?? 1) + gain);
                try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `도로 보수 +${Math.round(gain*100)}%` } })); } catch {}
                (c as any).maintWork = 0;
                releaseJobChunk(c.nodeTargetId);
                c.nodeTargetId = null;
                c.state = 'Idle';
              }
            }
          } else {
            // 노드 근처에서 가시적으로 작업: 근접 반경 내에서 정지 상태로 채집 진행
            const nodes = getNodes();
            const node = nodes.find((n) => c.nodeTargetId?.startsWith('Gather_') ? `Gather_${n.nodeId}` === c.nodeTargetId : n.nodeId === c.nodeTargetId);
             if (node) {
               const item = node.type === 'Forest' ? 'Wood' : node.type === 'IronMine' ? 'Stone' : node.type === 'HerbPatch' ? 'Herb' : 'ManaRaw';
              // 속도 상향: 벌목 1/4s, 채광 1/6s (가시성/템포 개선)
               const baseRate = node.type === 'Forest' ? (1 / 4) : (node.type === 'IronMine' ? (1 / 6) : (node.type === 'HerbPatch' ? (1 / 3.5) : (1 / 8)));
              // 전언/특성 멀티
              let gatherMult = Math.max(1, getMultiplier('Gather', node.type));
              if (c.traits?.includes('Diligent')) gatherMult *= 1.05;
              // 슬롯 감가: eff/n (reserved 인원 기준)
              let perWorkerEff = 1.0;
              const ch2 = getJobChunk(c.nodeTargetId);
              if (ch2) {
                const nRes = Math.max(1, ch2.reserved);
                const eff = effectiveWorkersFor(ch2.id, ch2.reserved);
                perWorkerEff = Math.max(0.1, eff / nRes);
              }
              const rate = baseRate * gatherMult * perWorkerEff; // unit/sec per worker
              (c as any).gatherProgress = ((c as any).gatherProgress ?? 0) + rate * dt;
              let produced = 0;
             while ((c as any).gatherProgress >= 1.0 && c.carry.qty < c.carry.capacity) {
                // 동일 타입 다수 노드 대비: 현재 타겟 노드에서 정확히 소모
                // 정착지 저장 여유가 없으면 생산 중단
                const free = ((): number => {
                  try {
                    // dynamic import via globalThis to avoid circular import at top level
                    const inv: any = (globalThis as any).__pfw_inventory_api;
                    if (inv && typeof inv.getFreeCapacity === 'function') {
                      return inv.getFreeCapacity(item);
                    }
                  } catch {}
                  return Infinity;
                })();
                if (free <= 0) break;
                if (tryConsumeFromNodeAt(node.nodeId, 1)) {
                  (c as any).gatherProgress -= 1.0;
                  produced += 1;
                } else {
                  break;
                }
              }
               // 여유가 거의 없으면 바로 납품 우선(부분만 채집했어도 이동)
               try {
                 const inv: any = (globalThis as any).__pfw_inventory_api;
                 const free = inv?.getFreeCapacity?.(item) ?? Infinity;
                 if (free <= Math.max(1, (inv?.getCapacity?.(item) ?? 0) * 0.02)) {
                   if (c.carry.qty > 0) {
                     c.state = 'ToSanctum';
                     const dep = getNearestDeposit(c.pos);
                     if (dep) c.target.copy(dep.pos); else c.target.copy(sanctumCenter);
                     if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
                   }
                 }
               } catch {}
              if (produced > 0) {
                c.carry.item = item as any;
                c.carry.qty += produced;
              }
              // 충돌 회피: 건물/노드/도로 겹침과 시민 간 겹침 방지(간단한 반발)
              function pushAway(px: number, pz: number, cx: number, cz: number, minDist: number): { x: number; z: number } {
                const dx = cx - px; const dz = cz - pz; const d = Math.hypot(dx, dz);
                if (d < Math.max(1e-3, minDist)) {
                  const u = Math.max(1e-3, d);
                  const ux = dx / u, uz = dz / u;
                  const need = (minDist - d) + 1e-3;
                  return { x: cx + ux * need, z: cz + uz * need };
                }
                return { x: cx, z: cz };
              }
              let nx = c.pos.x, nz = c.pos.z;
              // 노드와는 겹쳐서 채집 가능(반발 제거)
              // 건물로부터 1.2m, 도로 타일 중심으로부터 1.0m 이상 유지
              for (const b of getBuildings()) {
                ({ x: nx, z: nz } = pushAway(b.position[0], b.position[2], nx, nz, 1.2));
              }
              for (const r of getRoads()) {
                ({ x: nx, z: nz } = pushAway(r.position[0], r.position[2], nx, nz, 1.0));
              }
              // 시민 간 0.8m 회피
              for (const other of citizens) {
                if (other.id === c.id) continue;
                ({ x: nx, z: nz } = pushAway(other.pos.x, other.pos.z, nx, nz, 0.8));
              }
              c.pos.set(nx, 0, nz);
              // 가득 찼을 때만 납품으로 이동. 생산이 0이면 잠시 대기하며 계속 시도
              if (c.carry.qty >= c.carry.capacity) {
                c.state = 'ToSanctum';
                const dep = getNearestDeposit(c.pos);
                if (dep) c.target.copy(dep.pos); else c.target.copy(sanctumCenter);
                if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
              }
            } else {
              c.state = 'Idle';
              if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
              c.nodeTargetId = null;
            }
          }
          } else if (c.state === 'ToSanctum') {
          // 성역 도착: 납품
          if (c.carry.qty <= 0) {
            c.state = 'Idle';
           } else if (c.carry.qty > 0) {
             // Storage 또는 성역 중심 중 가까운 곳에서 2m 내 납품 처리
             const dep = getNearestDeposit(c.pos);
             const depPos = dep?.pos ?? sanctumCenter;
             if (c.pos.distanceTo(depPos) < 2.0) {
            if (c.carry.item) {
              const added = addItem(c.carry.item, c.carry.qty);
              try { (globalThis as any).__pfw_sanctum_ledger_add?.(0, c.carry.item, added); } catch {}
            }
            try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Resource', text: `납품 +${c.carry.qty} ${c.carry.item}` } })); } catch {}
            // 슬롯/청크 반납
            if (c.nodeTargetId) {
              if (c.nodeTargetId.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
              else releaseNodeSlot(c.nodeTargetId);
            }
            c.carry.item = null; c.carry.qty = 0; c.state = 'Idle'; c.nodeTargetId = null;
             }
          }
        }
      }
    }
    // 이동이 거의 없을 때도 도착 판정/작업 수행 보장
    if (c.role !== 'Guard' && c.state === 'ToNode' && c.nodeTargetId && dist <= 1.2) {
      const ch = getJobChunk(c.nodeTargetId);
      if (ch && ch.kind === 'Maintain') {
        const roads = getRoads();
        const r = roads.find(rr => rr.id === ch.nodeId);
        if (r) {
          (c as any).maintWork = ((c as any).maintWork ?? 0) + dt;
          if ((c as any).maintWork >= 4.0) {
            const gain = 0.15;
            r.durability = Math.min(1.0, (r.durability ?? 1) + gain);
            try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `도로 보수 +${Math.round(gain*100)}%` } })); } catch {}
            (c as any).maintWork = 0;
            releaseJobChunk(c.nodeTargetId);
            c.nodeTargetId = null;
            c.state = 'Idle';
          }
      }
      } else {
        const nodes = getNodes();
        const node = nodes.find((n) => c.nodeTargetId?.startsWith('Gather_') ? `Gather_${n.nodeId}` === c.nodeTargetId : n.nodeId === c.nodeTargetId);
         if (node) {
           const item = node.type === 'Forest' ? 'Wood' : node.type === 'IronMine' ? 'Stone' : node.type === 'HerbPatch' ? 'Herb' : 'ManaRaw';
           const baseRate = node.type === 'Forest' ? (1 / 4) : (node.type === 'IronMine' ? (1 / 6) : (node.type === 'HerbPatch' ? (1 / 3.5) : (1 / 8)));
          let gatherMult = Math.max(1, getMultiplier('Gather', node.type));
          if (c.traits?.includes('Diligent')) gatherMult *= 1.05;
          let perWorkerEff = 1.0;
          const ch2 = getJobChunk(c.nodeTargetId);
          if (ch2) {
            const nRes = Math.max(1, ch2.reserved);
            const eff = effectiveWorkersFor(ch2.id, ch2.reserved);
            perWorkerEff = Math.max(0.1, eff / nRes);
          }
          const rate = baseRate * gatherMult * perWorkerEff;
          (c as any).gatherProgress = ((c as any).gatherProgress ?? 0) + rate * dt;
          let produced = 0;
          while ((c as any).gatherProgress >= 1.0 && c.carry.qty < c.carry.capacity) {
            if (tryConsumeFromNodeAt(node.nodeId, 1)) {
              (c as any).gatherProgress -= 1.0;
              produced += 1;
            } else { break; }
          }
          if (produced > 0) { c.carry.item = item as any; c.carry.qty += produced; }
          if (c.carry.qty >= c.carry.capacity) {
            c.state = 'ToSanctum';
            const sanc = getSanctums()[0];
            if (sanc) c.target.set(sanc.center[0], 0, sanc.center[2]);
            if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
          }
        }
      }
    }
    // 성역 중심부에서 휴식 시 피로 회복
    const sanc = getSanctums()[0];
    if (sanc) {
      const d = Math.hypot(c.pos.x - sanc.center[0], c.pos.z - sanc.center[2]);
      if (d <= sanc.radius * 0.5) c.fatigue = Math.max(0, c.fatigue - dt * 0.05);
    }
    // A2 유틸리티 재평가: 0.6s 간격, 20% 이상 우위 시 전환
    if (c.role === 'Worker') {
      c.thinkTimer -= dt;
      if (c.thinkTimer <= 0) {
        c.thinkTimer = 0.6;
        const chunks = listJobChunks();
        const desiredWood = 50, desiredStone = 50;
        function scoreFor(ch: { id: string; nodeType: string; position: [number, number, number]; reserved: number; slots: { soft: number; hard: number }; available: number }): number {
          if (ch.available <= 0) return 0;
          const d = Math.max(1, c.pos.distanceTo(new THREE.Vector3(ch.position[0], 0, ch.position[2])));
          const distFactor = 1 / (1 + d / 50);
         const effNext = Math.max(0.1, effectiveWorkersFor(ch.id, ch.reserved + 1) - effectiveWorkersFor(ch.id, ch.reserved));
          let ed = getMultiplier('Gather', ch.nodeType);
          let need = 1.0;
          if (ch.id.startsWith('Gather_')) {
            const needBase = ch.nodeType === 'Forest' ? 'Wood' : 'Stone';
            const desired = needBase === 'Wood' ? desiredWood : desiredStone;
            const scarcity = Math.max(0, Math.min(1, (desired - (getQty as any)(needBase)) / desired));
            need = 1 + 0.5 * scarcity;
          } else if (ch.id.startsWith('Maintain_')) {
            // 도로 보수는 전언 대신 도로 상태와 거리만 반영(간이): 여유가 있으면 1.2, 기본 1.0
            ed = 1.0;
            need = 1.2;
          }
         const aptKey = nodeAptKey(ch.nodeType);
         const apt = aptKey ? ((c.aptitude as any)[aptKey] ?? 1.0) : 1.0;
          const fatigue = 1 - c.fatigue;
          // 위험 보정: 성역 밖 작업 시 전시 위협도 × 취약도
          let risk = 1.0;
          const sancA = getSanctums()[0];
          if (sancA) {
            const dd = Math.hypot(ch.position[0] - sancA.center[0], ch.position[2] - sancA.center[2]);
            if (dd > sancA.radius) {
              const threatNow = getThreat();
              const vuln = c.traits?.includes('Coward') ? 0.6 : 0.3;
              risk = Math.max(0.4, 1 - Math.min(0.6, threatNow * vuln));
            }
          }
          // TargetOrder: 가까운 타겟이 있으면 가산(가중치 +0.2까지)
          const tgt = listTargets()[0];
          let targetOrder = 0;
          if (tgt) {
            const td = Math.max(1, Math.hypot(tgt.position[0] - ch.position[0], tgt.position[2] - ch.position[2]));
            targetOrder = Math.max(0, 0.2 * (1 - Math.min(1, td / 40)));
          }
          return distFactor * effNext * ed * need * apt * fatigue * risk + targetOrder;
        }
        const scored = chunks.map(ch => ({ ch, score: scoreFor(ch as any) }))
          .sort((a, b) => b.score - a.score);
        const top = scored.slice(0, 5).map(s => ({ id: s.ch.id, score: s.score }));
        citizenTop5.set(c.id, top);
        (globalThis as any).__pfw_cit_top5 = getCitizenTop5();
        // 자원/재생력 고려: 노드 가용량 우선(available), 재생률을 간접 반영(available이 높을수록 선호)
         const best = scored[0];
        const current = chunks.find(ch => ch.id === c.nodeTargetId);
        const curScore = current ? scoreFor(current as any) : 0;
        const nowSec = performance.now() / 1000;
        const lockUntil = ((c as any).jobLockUntilSec ?? 0);
        const locked = c.state === 'ToNode' && c.nodeTargetId && nowSec < lockUntil;
        const switchThreshold = c.nodeTargetId ? 1.5 : 1.2; // 이동 중엔 더 높은 임계로 스위칭 억제
        if (!locked && best && best.score > curScore * switchThreshold) {
          if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
          if (reserveJobChunk(best.ch.id)) {
            c.nodeTargetId = best.ch.id;
            c.state = 'ToNode';
            c.target.set(best.ch.position[0], 0, best.ch.position[2]);
            (c as any).jobLockUntilSec = nowSec + 8; // 최소 수행 시간 보장
          }
        }
      }
    }
  }
}

export function createCitizenRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Object3D> = {};
  const bubbles: Record<string, { sprite: THREE.Sprite; emoji: string }> = {};
  const hitTimers: Record<string, number> = {};
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // damage flash listener
  const onHit = (e: Event): void => {
    const ce = e as CustomEvent<{ id: string }>;
    if (ce?.detail?.id) hitTimers[ce.detail.id] = 0.25; // 0.25s flash
  };
  window.addEventListener('pfw-citizen-hit', onHit as EventListener);
  const onClick = (ev: MouseEvent): void => {
    const canvas = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, scene.camera);
    const objs = Object.values(meshes);
    const hits = raycaster.intersectObjects(objs, true);
    if (hits.length > 0) {
      // ascend to the mesh root that we manage in `meshes`
      let o: THREE.Object3D | null = hits[0].object;
      const values = new Set(objs);
      while (o && !values.has(o)) o = o.parent;
      const root = o ?? hits[0].object;
      const hitEntry = Object.entries(meshes).find(([, v]) => v === root);
      const id = hitEntry?.[0];
      if (id) {
        try { window.dispatchEvent(new CustomEvent('pfw-open-inspector', { detail: { type: 'Citizen', id } })); } catch {}
      }
    }
  };
  const el = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
  if (el) el.addEventListener('click', onClick, true);

  function makeEmojiSprite(emoji: string): THREE.Sprite {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.6, 0.6, 0.6);
    return spr;
  }

  function emojiForCitizen(c: any): string {
    // Rough mapping by role/state
    if (c.role === 'Guard') return '🛡️';
    if (c.role === 'Builder') return '🔨';
    if (c.role === 'Researcher') return '🔬';
    if (c.role === 'Worker') {
      if (c.state === 'ToSanctum' && c.carry?.qty > 0) return '📦';
      if (c.state === 'ToNode') {
        if (typeof c.nodeTargetId === 'string' && c.nodeTargetId.startsWith('Maintain_')) return '🛠️';
        return '⛏️';
      }
      return '🏭';
    }
    if (c.state === 'Idle') return '💤';
    return '👣';
  }

  function makeCitizen(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x66ccff })
    );
    body.position.y = 0.6;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0b3 })
    );
    head.position.y = 1.3;
    g.add(head);
    const dir = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8844 })
    );
    dir.position.set(0, 1.05, 0.35);
    dir.rotation.x = Math.PI;
    g.add(dir);
    const leftHand = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0b3 })
    );
    const rightHand = leftHand.clone();
    leftHand.position.set(-0.28, 0.95, 0.05);
    rightHand.position.set(0.28, 0.95, 0.05);
    g.add(leftHand);
    g.add(rightHand);
    // tools/props
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    shaft.position.set(0, 0.45, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), new THREE.MeshBasicMaterial({ color: 0xc0c0c0 }));
    tip.position.set(0, 0.95, 0);
    spear.add(shaft); spear.add(tip); spear.position.set(0.22, 0.8, 0.18); spear.rotation.z = -0.6;
    spear.visible = false; g.add(spear);
    const hammer = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    handle.position.set(0, 0.25, 0);
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x555555 }));
    hammerHead.position.set(0, 0.45, 0);
    hammer.add(handle); hammer.add(hammerHead); hammer.position.set(0.22, 0.95, 0.12); hammer.visible = false; g.add(hammer);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0x224488 }));
    book.position.set(-0.18, 1.05, 0.08); book.visible = false; g.add(book);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    crate.position.set(0, 0.8, -0.05); crate.visible = false; g.add(crate);
    // role badge
    const badge = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x66ccff })
    );
    badge.position.set(0, 1.6, 0);
    (badge as any).name = 'badge';
    g.add(badge);
    (g as any).userData = { leftHand, rightHand, spear, hammer, book, crate, body };
    return g;
  }

  return function CitizenRenderSystem() {
    // remove stale
    for (const id of Object.keys(meshes)) {
      if (!citizens.find((c) => c.id === id)) {
        const m = meshes[id];
        group.remove(m);
        m.traverse?.((obj: any) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
        delete meshes[id];
        const b = bubbles[id];
        if (b) {
          group.remove(b.sprite);
          (b.sprite.material as THREE.SpriteMaterial).map?.dispose?.();
          (b.sprite.material as THREE.Material).dispose();
          delete bubbles[id];
        }
      }
    }
    // ensure
    for (const c of citizens) {
      let m = meshes[c.id];
      if (!m) { m = makeCitizen(); meshes[c.id] = m; group.add(m); }
      m.position.set(c.pos.x, 0, c.pos.z);
      // face moving direction
      const forward = c.vel.clone();
      if (forward.lengthSq() > 1e-4) {
        const yaw = Math.atan2(forward.x, forward.z);
        m.rotation.y = yaw;
      }
      // carry 상태 색상 표시 + 피격 플래시
      const udG = (m as any).userData || {};
      const body: THREE.Mesh = udG.body ?? (m.children[0] as THREE.Mesh);
      const mat = body.material as THREE.MeshBasicMaterial;
      const flash = Math.max(0, (hitTimers[c.id] ?? 0));
      if (flash > 0) {
        mat.color.set(0xff6666);
        hitTimers[c.id] = Math.max(0, flash - 0.016);
      } else {
        mat.color.set(c.carry.qty > 0 ? 0x33dd88 : 0x66ccff);
      }
      // role 배지 색상
      const badge = m.children.find((ch: any) => ch?.name === 'badge') as THREE.Mesh | undefined;
      if (badge) {
        const bm = badge.material as THREE.MeshBasicMaterial;
        let color = 0x66ccff;
        if (c.role === 'Guard') color = 0xff4444;
        else if (c.role === 'Lumberjack') color = 0x33cc66;
        else if (c.role === 'Miner') color = 0x888888;
        else if (c.role === 'Builder') color = 0xffcc33;
        else if (c.role === 'Researcher') color = 0x8a7dff;
        bm.color.set(color);
      }
      // emoji bubble
      const emoji = emojiForCitizen(c);
      const cur = bubbles[c.id];
      if (!cur || cur.emoji !== emoji) {
        if (cur) {
          (cur.sprite.parent as THREE.Object3D | undefined)?.remove(cur.sprite);
          (cur.sprite.material as THREE.SpriteMaterial).map?.dispose?.();
          (cur.sprite.material as THREE.Material).dispose();
          delete bubbles[c.id];
        }
        const spr = makeEmojiSprite(emoji);
        bubbles[c.id] = { sprite: spr, emoji };
        // attach to citizen mesh so picking works consistently
        const host = meshes[c.id];
        if (host) host.add(spr); else group.add(spr);
      }
      const spr = bubbles[c.id]?.sprite;
      if (spr) { spr.position.set(0, 1.9, 0); }
      // simple hand animations
      const ud = (m as any).userData || {};
      const lh: THREE.Mesh | undefined = ud.leftHand;
      const rh: THREE.Mesh | undefined = ud.rightHand;
      const spear: THREE.Group | undefined = ud.spear;
      const hammer: THREE.Group | undefined = ud.hammer;
      const book: THREE.Mesh | undefined = ud.book;
      const crate: THREE.Mesh | undefined = ud.crate;
      const t = performance.now() / 1000;
      const isWalking = c.vel.lengthSq() > 0.05;
      const distToTarget = c.target.distanceTo(c.pos);
      const isAtNode = c.state === 'ToNode' && distToTarget < 0.7;
      const isGather = isAtNode && typeof c.nodeTargetId === 'string' && c.nodeTargetId.startsWith('Gather_');
      const isMaintain = isAtNode && typeof c.nodeTargetId === 'string' && c.nodeTargetId.startsWith('Maintain_');
      const isBuild = c.role === 'Builder' && distToTarget < 1.2;
      // tool visibility
      if (spear) spear.visible = c.role === 'Guard';
      if (hammer) hammer.visible = isBuild;
      if (book) book.visible = c.role === 'Researcher';
      if (crate) crate.visible = c.carry.qty > 0;
      // spear swing when attacking
      if (spear) {
        const swing = (c.atkCd ?? 0) > 0.7 ? Math.sin((1 - Math.min(1, (c.atkCd ?? 0))) * Math.PI * 2) * 0.4 : 0;
        spear.rotation.x = -0.4 + swing;
      }
      // hammer tap when building
      if (hammer) {
        const tap = isBuild ? Math.abs(Math.sin(t * 12)) * 0.5 : 0;
        hammer.position.y = 0.95 + tap * 0.1;
      }
      // book idle bob
      if (book) {
        const bob = c.role === 'Researcher' ? Math.sin(t * 2) * 0.02 : 0;
        book.position.y = 1.05 + bob;
      }
      // crate follows torso forward a bit
      if (crate) {
        crate.position.z = c.carry.qty > 0 ? -0.08 : -0.05;
      }
      if (lh && rh) {
        if (isGather) {
          const a = Math.sin(t * 12) * 0.08;
          lh.position.set(-0.16 + a, 1.0, 0.12);
          rh.position.set(0.16 - a, 1.0, 0.12);
        } else if (isMaintain || isBuild) {
          const up = Math.abs(Math.sin(t * 10)) * 0.18;
          lh.position.set(-0.25, 0.95, 0.05);
          rh.position.set(0.22, 0.95 + up, 0.12);
        } else if (isWalking) {
          const sway = Math.sin(t * 8) * 0.12;
          lh.position.set(-0.28, 0.95, 0.05 + sway);
          rh.position.set(0.28, 0.95, 0.05 - sway);
        } else {
          lh.position.set(-0.28, 0.95, 0.05);
          rh.position.set(0.28, 0.95, 0.05);
        }
      }
    }
  };
}



