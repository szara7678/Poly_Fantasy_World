import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';
import { speedFactorAt } from './RoadNetwork';
import { addExploredStroke } from './FogOfWarSystem';
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

type RoleId = 'Worker' | 'Guard' | 'Lumberjack' | 'Miner' | 'Builder' | 'Researcher';

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
  aptitude: { Forest: number; IronMine: number };
  traits: TraitId[];
  stats: Stats;
  derived: DerivedStats;
  thinkTimer: number;
  hp: number;
  atk?: number;
  range?: number;
  atkCd?: number;
  combatXp?: number;
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
    citizens.push({ id: `cz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, pos, vel: new THREE.Vector3(), target: tgt, lastStroke: pos.clone(), state: 'Idle', carry: { item: null, qty: 0, capacity: carryCap }, nodeTargetId: null, role: 'Worker', roleCandidate: undefined, roleCandidateTimer: 0, fatigue: 0, aptitude: { Forest: 0.9 + Math.random() * 0.4, IronMine: 0.9 + Math.random() * 0.4 }, traits, stats, derived, thinkTimer: 0, hp: derived.HP, atk: 6 + Math.floor(stats.STR / 4), range: 1.5, atkCd: 0, combatXp: 0 });
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
  // 역할 자동 결정 히스테리시스(+20%/120s)
  for (const c of citizens) {
    const desiredWood = 50, desiredStone = 50;
    const edForest = getMultiplier('Gather', 'Forest');
    const edIron = getMultiplier('Gather', 'IronMine');
    const needWood = 1 + 0.5 * Math.max(0, Math.min(1, (desiredWood - (getQty as any)('Wood')) / desiredWood));
    const needStone = 1 + 0.5 * Math.max(0, Math.min(1, (desiredStone - (getQty as any)('Stone')) / desiredStone));
    const fatigue = 1 - c.fatigue;
    let scoreGuard = Math.max(0.1, threat * 2) * (c.stats ? (c.stats.STR / 10) : 1);
    if (c.traits?.includes('Indomitable')) scoreGuard *= 1.1;
    if (c.traits?.includes('Coward')) scoreGuard *= 0.85;
    let scoreLumber = (c.aptitude.Forest ?? 1) * edForest * needWood * fatigue;
    let scoreMiner = (c.aptitude.IronMine ?? 1) * edIron * needStone * fatigue;
    if (c.traits?.includes('Diligent')) { scoreLumber *= 1.1; scoreMiner *= 1.1; }
    // Builder: 미완 청사진 수 × 손재주/STR/DEX 가중, 자원 부족 시 페널티
    const bpCount = ((globalThis as any).__pfw_blueprints as any[])?.length ?? 0;
    let scoreBuilder = Math.max(0, bpCount) * ((c.traits?.includes('Dexterous') ? 1.05 : 1.0) * ((c.stats?.STR ?? 10) + (c.stats?.DEX ?? 10)) / 20) * fatigue;
    const woodEnoughB = (getQty as any)('Wood') >= 10;
    const stoneEnoughB = (getQty as any)('Stone') >= 10;
    const plankEnoughB = (getQty as any)('Plank') >= 6;
    const ironEnoughB = (getQty as any)('IronIngot') >= 6;
    const toolEnoughB = (getQty as any)('Tool') >= 2;
    const canSpawnBasicB = woodEnoughB || stoneEnoughB || plankEnoughB || ironEnoughB || toolEnoughB;
    if (!canSpawnBasicB && bpCount === 0) scoreBuilder *= 0.2; // 초반 자원 부족 시 빌더 선호 억제
    // Researcher: RP 부족도 × INT/WIS 가중
    const desiredRP = 50;
    const rpNow = (getQty as any)('ResearchPoint') ?? 0;
    const needRP = 1 + 0.5 * Math.max(0, Math.min(1, (desiredRP - rpNow) / desiredRP));
    let scoreResearch = needRP * (((c.stats?.INT ?? 10) + (c.stats?.WIS ?? 10)) / 20) * (c.traits?.includes('Pious') ? 1.05 : 1.0) * fatigue;
    let bestRole: RoleId = 'Worker';
    let bestScore = 1.0;
    if (scoreGuard > bestScore) { bestScore = scoreGuard; bestRole = 'Guard'; }
    if (scoreLumber > bestScore) { bestScore = scoreLumber; bestRole = 'Lumberjack'; }
    if (scoreMiner > bestScore) { bestScore = scoreMiner; bestRole = 'Miner'; }
    if (scoreBuilder > bestScore) { bestScore = scoreBuilder; bestRole = 'Builder'; }
    if (scoreResearch > bestScore) { bestScore = scoreResearch; bestRole = 'Researcher'; }
    const currentScore = c.role === 'Guard' ? scoreGuard : c.role === 'Lumberjack' ? scoreLumber : c.role === 'Miner' ? scoreMiner : 1.0;
    if (bestScore > currentScore * 1.2) {
      if (c.roleCandidate !== bestRole) { c.roleCandidate = bestRole; c.roleCandidateTimer = 0; }
      else {
        c.roleCandidateTimer = (c.roleCandidateTimer ?? 0) + dt;
        if ((c.roleCandidateTimer ?? 0) >= 120) {
          const prev = c.role;
          c.role = bestRole;
          c.roleCandidate = undefined;
          c.roleCandidateTimer = 0;
          try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Citizen', text: `역할 전직: ${prev} → ${bestRole}` } })); } catch {}
        }
      }
    } else { c.roleCandidate = undefined; c.roleCandidateTimer = 0; }
  }
  for (const c of citizens) {
    // 상태 전이: Idle -> ToNode (가까운 노드 선택), ToNode에서 도착 시 채집, ToSanctum에서 도착 시 납품
    const sanctum = getSanctums()[0];
    const sanctumCenter = sanctum ? new THREE.Vector3(sanctum.center[0], 0, sanctum.center[2]) : new THREE.Vector3(0, 0, 0);

    if (c.role === 'Guard') {
      // 경비: 무리 근처 몬스터 추격/교전, 없으면 순찰
      const sanctum = getSanctums()[0];
      const center = sanctum ? new THREE.Vector3(sanctum.center[0], 0, sanctum.center[2]) : new THREE.Vector3(0, 0, 0);
      const mons = getMonsters();
      // 타겟 탐색: 20m 내 가장 가까운 몬스터
      let tgtM: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const m0 of mons) {
        const d = Math.hypot(m0.pos.x - c.pos.x, m0.pos.z - c.pos.z);
        if (d < 20 && d < bestD) { bestD = d; tgtM = { x: m0.pos.x, z: m0.pos.z }; }
      }
      if (tgtM) {
        c.target.set(tgtM.x, 0, tgtM.z);
      } else {
        const ang = performance.now() / 1000 + parseInt(c.id.slice(-2), 36);
        const r = sanctum ? sanctum.radius + 6 : 20;
        c.target.set(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
      }
      // 공격 처리 및 경험치
      c.atkCd = Math.max(0, (c.atkCd ?? 0) - dt);
      if ((c.atkCd ?? 0) <= 0) {
        const ok = damageNearestMonster(c.pos.x, c.pos.z, c.atk ?? 6, c.range ?? 1.5);
        if (ok) {
          c.atkCd = 0.9;
          c.combatXp = (c.combatXp ?? 0) + 1;
          if ((c.combatXp ?? 0) % 8 === 0) { c.atk = (c.atk ?? 6) + 1; }
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
          const ok = BP.addBlueprint?.('Building' as any, pos, undefined, k, { silent: true });
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
        if (need.Plank < 20 && !hasKind('Lumberyard') && !hasBpKind('Lumberyard')) {
          placeNear('Lumberyard');
        } else if (need.IronIngot < 15 && !hasKind('Smelter') && !hasBpKind('Smelter')) {
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
        // mark presence when adjacent
        if (Math.hypot(c.pos.x - targetB.position[0], c.pos.z - targetB.position[2]) <= 0.9) {
          const arr: Array<string> = (globalThis as any).__pfw_near_producers ?? [];
          (globalThis as any).__pfw_near_producers = arr;
          if (!arr.includes(targetB.id)) arr.push(targetB.id);
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
      // 유틸리티 점수: 거리(역수) × 잔여량 × (슬롯 효율 보정)
      // 작업 청크 기반 선택
      const chunks = listJobChunks();
      let best: { id: string; pos: [number, number, number]; score: number } | null = null;
      for (const ch of chunks) {
        if (ch.available <= 0) continue;
        const d = Math.max(1, c.pos.distanceTo(new THREE.Vector3(ch.position[0], 0, ch.position[2])));
        const eff = effectiveWorkersFor(ch.id, ch.reserved + 1) - effectiveWorkersFor(ch.id, ch.reserved);
        const score = (ch.available / d) * Math.max(0.2, eff);
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
    const spd = base * factor;
    if (dist > 0.001) {
      dir.multiplyScalar(1 / dist);
      c.vel.copy(dir).multiplyScalar(spd);
      c.pos.addScaledVector(c.vel, dt);
      // 피로 축적
      c.fatigue = Math.min(1, c.fatigue + dt * 0.02);
      // FoW stroke every ~2m traveled
      const dStroke = c.lastStroke.distanceTo(c.pos);
      if (dStroke > 2.0) {
        addExploredStroke([[c.lastStroke.x, c.lastStroke.z], [c.pos.x, c.pos.z]], 8);
        c.lastStroke.copy(c.pos);
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
              const item = node.type === 'Forest' ? 'Wood' : 'Stone';
              // 속도 상향: 벌목 1/4s, 채광 1/6s (가시성/템포 개선)
              const baseRate = node.type === 'Forest' ? (1 / 4) : (node.type === 'IronMine' ? (1 / 6) : (1 / 4));
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
                if (tryConsumeFromNodeAt(node.nodeId, 1)) {
                  (c as any).gatherProgress -= 1.0;
                  produced += 1;
                } else {
                  break;
                }
              }
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
                c.target.copy(sanctumCenter);
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
          } else if (c.carry.qty > 0 && c.pos.distanceTo(sanctumCenter) < 2.0) {
            if (c.carry.item) addItem(c.carry.item, c.carry.qty);
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
          const item = node.type === 'Forest' ? 'Wood' : 'Stone';
          const baseRate = node.type === 'Forest' ? (1 / 4) : (node.type === 'IronMine' ? (1 / 6) : (1 / 4));
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
          const apt = (c.aptitude as any)[ch.nodeType] ?? 1.0;
          const fatigue = 1 - c.fatigue;
          // TargetOrder: 가까운 타겟이 있으면 가산(가중치 +0.2까지)
          const tgt = listTargets()[0];
          let targetOrder = 0;
          if (tgt) {
            const td = Math.max(1, Math.hypot(tgt.position[0] - ch.position[0], tgt.position[2] - ch.position[2]));
            targetOrder = Math.max(0, 0.2 * (1 - Math.min(1, td / 40)));
          }
          return distFactor * effNext * ed * need * apt * fatigue + targetOrder;
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


