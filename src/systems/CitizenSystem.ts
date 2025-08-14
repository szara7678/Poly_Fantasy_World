import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';
import { speedFactorAt } from './RoadNetwork';
import { computePathSmart } from './Pathfinding';
import { addExploredStroke, addVisibleSector } from './FogOfWarSystem';
import { listTargets } from './TargetSystem';
import { tryConsumeFromNodeAt, getNodes, releaseNodeSlot, pruneNodeReservations } from './NodeRegenSystem';
import { listJobChunks, reserveJobChunk, releaseJobChunk, effectiveWorkersFor, getJobChunk } from './JobChunkSystem';
 
import { getDispatchAssignment } from './JobDispatcherSystem';
import { getRoads } from './RoadNetwork';
import { addItem, getQty, canConsume, consume } from './Inventory';
import { getMultiplier } from './EdictSystem';
import { getThreat, getMonsters } from './MonsterSystem';
import { getBuildingsByKind, getBuildings } from './Buildings';
 

type TraitId = 'Diligent' | 'Coward' | 'Pious' | 'NightOwl' | 'Dexterous' | 'Indomitable';

interface Stats {
  STR: number; DEX: number; INT: number; VIT: number; WIS: number; CHA: number;
}

interface DerivedStats {
  HP: number; Stamina: number; Mana: number; Carry: number; Move: number;
}

type RoleId = 'Guard' | 'Lumberjack' | 'Miner' | 'Builder' | 'Researcher' | 'Explorer' | 'Carpenter' | 'Smith' | 'Artisan' | 'Herbalist' | 'Acolyte';

interface Citizen {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  lastStroke: THREE.Vector3;
  state: 'Idle' | 'ToNode' | 'WorkingGather' | 'WorkingMaintain' | 'Assist' | 'ToSanctum' | 'ToSupply';
  carry: { item: 'Wood' | 'Stone' | 'Herb' | 'ManaRaw' | null; qty: number; capacity: number };
  nodeTargetId: string | null;
  role: RoleId; // legacy field (ignored by role-less scheduling)
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
  detourTarget?: THREE.Vector3;
  detourTimer?: number;
  stuckTimer?: number;
  pathEvalTimer?: number;
  equipment?: { tool?: 'Axe' | 'Pick' | 'Hammer' };
}

const citizens: Citizen[] = [];
export function getCitizens(): ReadonlyArray<Citizen> { return citizens; }
try { (globalThis as any).__pfw_citizens = citizens; } catch {}
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
    citizens.push({ id: `cz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, pos, vel: new THREE.Vector3(), target: tgt, lastStroke: pos.clone(), state: 'Idle', carry: { item: null, qty: 0, capacity: carryCap }, nodeTargetId: null, role: 'Builder', fatigue: 0, aptitude: {
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
    }, traits, stats, derived, thinkTimer: 0, hp: derived.HP, atk: 6 + Math.floor(stats.STR / 4), range: 1.5, atkCd: 0, combatXp: 0, spawnSec: performance.now() / 1000, hasInitialRole: false, equipment: { tool: Math.random() < 0.5 ? 'Axe' : (Math.random() < 0.5 ? 'Pick' : undefined) } });
  }
}

// Save/Load snapshots (minimal, prototype): position (x,z), role, carry, fatigue
export interface CitizenSnapshot {
  x: number; z: number; role: RoleId; carry?: { item: 'Wood' | 'Stone' | 'Herb' | 'ManaRaw' | null; qty: number }; fatigue: number;
}

export function getCitizenSnapshots(): CitizenSnapshot[] {
  return citizens.map(c => ({ x: c.pos.x, z: c.pos.z, role: c.role, carry: { item: c.carry.item, qty: c.carry.qty }, fatigue: c.fatigue }));
}

export function applyCitizenSnapshots(list: CitizenSnapshot[]): void {
  // Clear and repopulate with fresh citizens at given positions/roles
  citizens.length = 0;
  for (const s of list) {
    const pos = new THREE.Vector3(s.x, 0, s.z);
    const tgt = pos.clone().add(new THREE.Vector3((Math.random()-0.5)*6, 0, (Math.random()-0.5)*6));
    const stats: Stats = { STR: 10, DEX: 10, INT: 10, VIT: 10, WIS: 10, CHA: 10 };
    const derived: DerivedStats = { HP: 50 + stats.VIT * 10, Stamina: 50 + (stats.STR + stats.DEX) * 5, Mana: 30 + (stats.INT + stats.WIS) * 8, Carry: 20 + stats.STR * 2, Move: 3.5 * (1 + stats.DEX / 50) };
    const carryCap = Math.max(1, Math.floor(derived.Carry / 10));
    const carryQty = Math.min(carryCap, Math.max(0, s.carry?.qty ?? 0));
    const c: Citizen = {
      id: `cz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pos, vel: new THREE.Vector3(), target: tgt, lastStroke: pos.clone(),
      state: 'Idle', carry: { item: (s.carry?.item ?? null) as any, qty: carryQty, capacity: carryCap }, nodeTargetId: null,
      role: s.role,
      fatigue: Math.max(0, Math.min(1, s.fatigue)),
      aptitude: { Forest: 1, IronMine: 1, Hunt: 1, Farm: 1, Herd: 1, Craft: 1, Smith: 1, Build: 1, Alchemy: 1, Heal: 1, Research: 1, Combat: 1, Trade: 1 },
      traits: [], stats, derived, thinkTimer: 0, hp: derived.HP, atk: 6, range: 1.5, atkCd: 0, combatXp: 0,
      spawnSec: performance.now() / 1000, hasInitialRole: true,
    };
    citizens.push(c);
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
    function getNearestStorage(from: THREE.Vector3): { pos: THREE.Vector3; id?: string } | null {
      try {
        const stores = getBuildingsByKind('Storage' as any);
        let best: any = null; let bestD = Infinity;
        for (const s of stores) {
          const p = new THREE.Vector3(s.position[0], 0, s.position[2]);
          const d = from.distanceTo(p);
          if (d < bestD) { bestD = d; best = { pos: p, id: s.id }; }
        }
        return best;
      } catch { return null; }
    }

    if (c.state === 'Idle') {
      // 타겟 지시가 있으면 우선 이동(최고 우선)
      const tg = listTargets()[0];
      if (tg) {
        c.state = 'ToNode';
        c.target.set(tg.position[0], 0, tg.position[2]);
        c.nodeTargetId = null;
      } else {
      // 중앙 디스패처 할당 우선 사용
      const asg = getDispatchAssignment(c.id);
      if (asg && typeof asg.jobId === 'string') {
        const jid = asg.jobId;
        const ch = getJobChunk(jid);
        if (ch) {
          c.nodeTargetId = jid;
          c.state = 'ToNode';
          c.target.set(ch.position[0], 0, ch.position[2]);
        } else if (jid.startsWith('Assist_') || jid.startsWith('Build_') || jid.startsWith('Defend_') || jid.startsWith('Explore_')) {
          // Assist 작업: 건물 위치로 이동
          c.nodeTargetId = jid;
          // 위치는 extras에 반영됨(JobDispatcherSystem). 최근 extras에서 좌표를 받아 사용
          try {
            const extras: Array<{ id: string; position: [number, number, number] }> = (globalThis as any).__pfw_extra_chunks ?? [];
            const ex = extras.find(e => e.id === jid);
            if (ex) c.target.set(ex.position[0], 0, ex.position[2]);
          } catch {}
        }
      } else {
        // 백업 제거: 중앙 디스패처만 사용
      }
      }
    }

    // 위험 우회: 경로상 몬스터 접근 시 일시적인 회피 웨이포인트 설정
    function maybeSetDetour(current: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
      // guard-specific bypass removed in role-less mode
      // 유지보수 보급/납품 중에는 우회 강도 낮춤
      const allow = c.state === 'ToNode' || c.role === 'Explorer';
      if (!allow) return desired;
      const steps = 6;
      const vx = desired.x - current.x; const vz = desired.z - current.z;
      const len = Math.hypot(vx, vz);
      if (len < 1e-3) return desired;
      const ux = vx / len; const uz = vz / len;
      const mons = getMonsters();
      let danger = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        const x = current.x + vx * t; const z = current.z + vz * t;
        let nearest = Infinity;
        for (const m of mons) {
          const d2 = Math.hypot(m.pos.x - x, m.pos.z - z);
          if (d2 < nearest) nearest = d2;
        }
        const local = nearest <= 8 ? 1.0 : nearest <= 14 ? 0.6 : 0.0;
        danger = Math.max(danger, local);
      }
      if (danger >= 1.0 && (!c.detourTimer || c.detourTimer <= 0)) {
        // 좌/우 중 더 안전한 쪽으로 90° 회피 웨이포인트 생성(거리 6m)
        const left = new THREE.Vector3(-uz, 0, ux);
        const right = new THREE.Vector3(uz, 0, -ux);
        function scoreDir(dv: THREE.Vector3): number {
          const px = current.x + dv.x * 6; const pz = current.z + dv.z * 6;
          let nearest = Infinity;
          for (const m of mons) {
            const d2 = Math.hypot(m.pos.x - px, m.pos.z - pz);
            if (d2 < nearest) nearest = d2;
          }
          return nearest;
        }
        const sL = scoreDir(left), sR = scoreDir(right);
        const pick = sL >= sR ? left : right;
        c.detourTarget = new THREE.Vector3(current.x + pick.x * 6, 0, current.z + pick.z * 6);
        c.detourTimer = 4.0;
      }
      if (c.detourTarget && (c.detourTimer ?? 0) > 0) {
        return c.detourTarget.clone();
      }
      return desired;
    }

    // detour timer decay
    if ((c.detourTimer ?? 0) > 0) c.detourTimer = Math.max(0, (c.detourTimer ?? 0) - dt);
    if (c.detourTarget && c.pos.distanceTo(c.detourTarget) < 0.8) { c.detourTarget = undefined; c.detourTimer = 0; }

    // 간이 A*: 멀리 떨어진 목표에 대해서는 경사/도로/위험을 고려한 경로로 중간 웨이포인트를 한 번에 설정
    let finalTarget = maybeSetDetour(c.pos, c.target);
    {
      const d2goal = c.pos.distanceTo(c.target);
      c.pathEvalTimer = Math.max(0, (c.pathEvalTimer ?? 0) - dt);
      if (d2goal > 18 && (!c.detourTimer || c.detourTimer <= 0) && (c.pathEvalTimer ?? 0) <= 0) {
        const path = computePathSmart([c.pos.x, c.pos.z], [c.target.x, c.target.z], 48, 4);
        if (path && path.length >= 2) {
          const next = path[Math.min(1, path.length - 1)];
          finalTarget = new THREE.Vector3(next[0], 0, next[2]);
          c.pathEvalTimer = 0.6; // re-evaluate path at most ~1.6Hz
        } else {
          c.pathEvalTimer = 0.6;
        }
      }
    }
    const dir = finalTarget.clone().sub(c.pos);
    const dist = dir.length();
    const loadPenalty = 0.05 * c.carry.qty;
    const moveBase = Math.max(1.2, (c.derived?.Move ?? 2.0) * (1 - loadPenalty));
    // 특성/야간 보정
    const tsec = performance.now() / 1000;
    const isNight = Math.floor(tsec / 60) % 2 === 1; // 60s 주기 야간/주간
    let traitMoveMult = 1.0;
    if (c.traits?.includes('Dexterous')) traitMoveMult *= 1.05;
    if (isNight) traitMoveMult *= c.traits?.includes('NightOwl') ? 1.05 : 0.95;
    if (threat > 0.6 && c.traits?.includes('Coward')) traitMoveMult *= 0.9;
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
    const pf = pathFactorApprox(c.pos, finalTarget);
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
        if ((c.state === 'ToNode' || c.state === 'WorkingGather' || c.state === 'WorkingMaintain') && c.nodeTargetId) {
          const ch = getJobChunk(c.nodeTargetId);
          if (ch && ch.kind === 'Maintain') {
            c.state = 'WorkingMaintain';
            const roads = getRoads();
            const r = roads.find(rr => rr.id === ch.nodeId);
            if (r) {
              (c as any).maintWork = ((c as any).maintWork ?? 0) + dt;
              if ((c as any).maintWork >= 4.0) {
                // 자원 소비 규칙 및 재보급 처리
                let ok = true;
                let usedCarry = false;
                let item: any = null; let qty = 0;
                if (r.type === 'Gravel') { item = 'Stone'; qty = 1; }
                else if (r.type === 'Wood') { item = 'Wood'; qty = 1; }
                else if (r.type === 'Stone') { item = 'Stone'; qty = 1; }
                if (item && qty > 0) {
                  // 우선 손에 들고 있으면 사용
                  if (c.carry.item === item && c.carry.qty >= qty) {
                    c.carry.qty -= qty; if (c.carry.qty <= 0) c.carry.item = null;
                    usedCarry = true; ok = true;
                  } else {
                    ok = canConsume(item, qty) && consume(item, qty);
                  }
                }
                if (ok) {
                  const gain = 0.15;
                  r.durability = Math.min(1.0, (r.durability ?? 1) + gain);
                  try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `도로 보수 +${Math.round(gain*100)}% (${item ? (usedCarry ? '휴대' : item+" -"+qty) : '무료'})` } })); } catch {}
                } else {
                  // 재보급 루틴: 가까운 Storage로 이동하여 보급 시도 후 복귀
                  (c as any).needSupply = { item, qty };
                  const near = getNearestStorage(c.pos);
                  if (near) { c.state = 'ToSupply'; c.target.copy(near.pos); }
                  (c as any).supplyWaitSec = 0;
                }
                (c as any).maintWork = 0;
                 if (c.state !== 'ToSupply') {
                  releaseJobChunk(c.nodeTargetId);
                  c.nodeTargetId = null;
                  c.state = 'Idle';
                }
              }
            }
          } else if (ch && ch.kind === 'Gather') {
            c.state = 'WorkingGather';
            // 노드 근처에서 가시적으로 작업: 근접 반경 내에서 정지 상태로 채집 진행
            const nodes = getNodes();
            const node = nodes.find((n) => c.nodeTargetId?.startsWith('Gather_') ? `Gather_${n.nodeId}` === c.nodeTargetId : n.nodeId === c.nodeTargetId);
             if (node) {
               const item = node.type === 'Forest' ? 'Wood' : node.type === 'IronMine' ? 'Stone' : node.type === 'HerbPatch' ? 'Herb' : 'ManaRaw';
              // 속도 상향: 벌목 1/3s, 채광 1/5s, 약초 1/3s, 마나 1/7s
               const baseRate = node.type === 'Forest' ? (1 / 3) : (node.type === 'IronMine' ? (1 / 5) : (node.type === 'HerbPatch' ? (1 / 3) : (1 / 7)));
              // 전언/특성 멀티
              let gatherMult = Math.max(1, getMultiplier('Gather', node.type));
              // 스탯/적성 기반 작업 속도 보정
              const STR = c.stats?.STR ?? 10, DEX = c.stats?.DEX ?? 10, VIT = c.stats?.VIT ?? 10;
              const A = c.aptitude ?? {} as any;
              const apt = node.type === 'Forest' ? (A.Forest ?? 1) : node.type === 'IronMine' ? (A.IronMine ?? 1) : node.type === 'HerbPatch' ? (A.Alchemy ?? 1) : (A.Research ?? 1);
              const statFit = node.type === 'Forest' ? ((STR-10)/40 + (DEX-10)/50) : node.type === 'IronMine' ? ((STR-10)/40 + (VIT-10)/60) : 0.1;
              gatherMult *= Math.max(0.7, 1 + 0.15*(apt-1) + statFit);
              // ToolFit: 도구 보유 시 보너스
              const t = c.equipment?.tool;
              if (node.type === 'Forest' && t === 'Axe') gatherMult *= 1.15;
              if (node.type === 'IronMine' && t === 'Pick') gatherMult *= 1.15;
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
                // 스킬/스탯/적성 성장(소량)
                const g = produced * 0.01;
                if (item === 'Wood') {
                  c.stats.STR += Math.random() < g ? 1 : 0;
                  (c.aptitude as any).Forest = Math.min(((c.aptitude as any).Forest ?? 1) + g*0.02, 3);
                } else if (item === 'Stone') {
                  c.stats.VIT += Math.random() < g ? 1 : 0;
                  (c.aptitude as any).IronMine = Math.min(((c.aptitude as any).IronMine ?? 1) + g*0.02, 3);
                }
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
          } else if (!ch && typeof c.nodeTargetId === 'string' && (c.nodeTargetId.startsWith('Assist_') || c.nodeTargetId.startsWith('Build_') || c.nodeTargetId.startsWith('Explore_') || c.nodeTargetId.startsWith('Defend_'))) {
            // Assist/Build/Explore/Defend pseudo-job 도착 처리
            const extras: Array<{ id: string; position: [number, number, number] }> = (globalThis as any).__pfw_extra_chunks ?? [];
            const ex = extras.find(e => e.id === c.nodeTargetId);
            if (ex) {
              const nearEnough = Math.hypot(c.pos.x - ex.position[0], c.pos.z - ex.position[2]) <= 0.9;
              if (nearEnough) {
                const arr: Array<string> = (globalThis as any).__pfw_near_producers ?? [];
                (globalThis as any).__pfw_near_producers = arr;
                if (!arr.includes(c.nodeTargetId)) arr.push(c.nodeTargetId);
                const counts: Record<string, number> = (globalThis as any).__pfw_near_producers_counts ?? {};
                (globalThis as any).__pfw_near_producers_counts = counts;
                counts[c.nodeTargetId] = (counts[c.nodeTargetId] ?? 0) + 1;
                const weights: Record<string, number> = (globalThis as any).__pfw_near_producers_weights ?? {};
                (globalThis as any).__pfw_near_producers_weights = weights;
                weights[c.nodeTargetId] = (weights[c.nodeTargetId] ?? 0) + 1.0;
                // kind별 상태 설정
                if (c.nodeTargetId.startsWith('Build_')) c.state = 'Assist';
                else if (c.nodeTargetId.startsWith('Explore_')) c.state = 'Assist';
                else if (c.nodeTargetId.startsWith('Defend_')) c.state = 'Assist';
                else c.state = 'Assist';
              }
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
          } else {
            // no-op: 다른 작업 유형은 아직 없음
        }
          }
        } else if (c.state === 'ToSupply') {
          // 보급 도착 처리
          const need = (c as any).needSupply as { item: 'Wood' | 'Stone'; qty: number } | undefined;
          if (need) {
            // Storage 근처 2m 내에서 보급 시도
            if (c.pos.distanceTo(c.target) < 2.0) {
              if (canConsume(need.item as any, need.qty)) {
                if (consume(need.item as any, need.qty)) {
                  // 휴대에 적재(유형 동일하면 누적)
                  if (c.carry.item === need.item || c.carry.item === null) {
                    c.carry.item = need.item as any;
                    c.carry.qty = Math.min(c.carry.capacity, c.carry.qty + need.qty);
                  }
                  try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `보급 완료: ${need.item} x${need.qty}` } })); } catch {}
                  // 원래 작업 위치로 복귀
                  if (c.nodeTargetId) {
                    const ch = getJobChunk(c.nodeTargetId);
                    if (ch) {
                      c.state = 'ToNode';
                      c.target.set(ch.position[0], 0, ch.position[2]);
                    } else { c.state = 'Idle'; }
                  } else { c.state = 'Idle'; }
                  (c as any).needSupply = undefined;
                }
              } else {
                // 대기 타임아웃
                (c as any).supplyWaitSec = ((c as any).supplyWaitSec ?? 0) + dt;
                if (((c as any).supplyWaitSec ?? 0) > 10) {
                  try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `보급 실패(타임아웃): ${need.item}` } })); } catch {}
                  if (c.nodeTargetId?.startsWith('Maintain_')) releaseJobChunk(c.nodeTargetId);
                  c.nodeTargetId = null; c.state = 'Idle'; (c as any).needSupply = undefined;
                }
              }
            }
          } else {
            c.state = 'Idle';
          }
        }
      }
    }
    // close per-citizen block above; subsequent maintenance in second pass below
  // 성역 휴식 및 작업 재평가(세컨드 패스)
  for (const c of citizens) {
    const sanc = getSanctums()[0];
    if (sanc) {
      const d = Math.hypot(c.pos.x - sanc.center[0], c.pos.z - sanc.center[2]);
      if (d <= sanc.radius * 0.5) c.fatigue = Math.max(0, c.fatigue - dt * 0.05);
    }
    if (c.role === 'Lumberjack' || c.role === 'Miner') {
      c.thinkTimer -= dt;
      if (c.thinkTimer <= 0) {
        c.thinkTimer = 0.6;
        const chunks = listJobChunks();
        const desiredWood = 50, desiredStone = 50;
        function scoreFor(ch: { id: string; nodeType: string; position: [number, number, number]; reserved: number; slots: { soft: number; hard: number }; available: number }): number {
          if (ch.available <= 0) return 0;
          const isGather = typeof ch.id === 'string' && ch.id.startsWith('Gather_');
          if (c.role === 'Lumberjack') {
            if (!(isGather && ch.nodeType === 'Forest')) return 0;
          } else if (c.role === 'Miner') {
            if (!(isGather && ch.nodeType === 'IronMine')) return 0;
          }
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
            ed = getMultiplier('Build', 'Road');
            need = 1.2;
          }
          const apt = (() => {
            if (ch.nodeType === 'Forest') return (c.aptitude as any).Forest ?? 1.0;
            if (ch.nodeType === 'IronMine') return (c.aptitude as any).IronMine ?? 1.0;
            if (ch.nodeType === 'HerbPatch') return (c.aptitude as any).Alchemy ?? 1.0;
            if (ch.nodeType === 'ManaSpring') return (c.aptitude as any).Research ?? 1.0;
            return 1.0;
          })();
          const fatigue = 1 - c.fatigue;
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
         const best = scored[0];
        const current = chunks.find(ch => ch.id === c.nodeTargetId);
        const curScore = current ? scoreFor(current as any) : 0;
        const nowSec = performance.now() / 1000;
        const lockUntil = ((c as any).jobLockUntilSec ?? 0);
        const locked = c.state === 'ToNode' && c.nodeTargetId && nowSec < lockUntil;
        const switchThreshold = c.nodeTargetId ? 1.5 : 1.2;
        if (!locked && best && best.score > curScore * switchThreshold) {
          if (c.nodeTargetId?.startsWith('Gather_')) releaseJobChunk(c.nodeTargetId);
          if (reserveJobChunk(best.ch.id)) {
            c.nodeTargetId = best.ch.id;
            c.state = 'ToNode';
            c.target.set(best.ch.position[0], 0, best.ch.position[2]);
            (c as any).jobLockUntilSec = nowSec + 8;
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
    // role-less: keep generic icons only
    if (c.role === 'Builder') return '🔨';
    if (c.role === 'Researcher') return '🔬';
    if (c.role === 'Carpenter' || c.role === 'Smith' || c.role === 'Artisan') {
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
      // role-less: badge shows generic color only
      const badge = m.children.find((ch: any) => ch?.name === 'badge') as THREE.Mesh | undefined;
      if (badge) {
        const bm = badge.material as THREE.MeshBasicMaterial;
        const genericColor = 0x66ccff;
        bm.color.set(genericColor);
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
      if (spear) spear.visible = false;
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



