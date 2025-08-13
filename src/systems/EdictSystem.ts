import type { GameWorld } from '../ecs';

export interface Edict {
  id: string;
  domain: string; // e.g., Build / Travel / Gather / Combat
  tag?: string; // e.g., Road / Building / IronMine
  mult: number; // 1.1 ~ 2.0 typically
  ttl: number; // seconds
  decay: number; // per-second multiplicative decay, e.g., 0.996
}

const edicts: Edict[] = [];
const MAX_TOTAL_MULT = 3.0; // plan cap

export function addEdict(e: Omit<Edict, 'id'>): Edict {
  const ed: Edict = { id: `edict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...e };
  edicts.push(ed);
  return ed;
}

export function removeEdict(id: string): void {
  const i = edicts.findIndex((e) => e.id === id);
  if (i >= 0) edicts.splice(i, 1);
}

export function listEdicts(): ReadonlyArray<Edict> {
  return edicts;
}

export function clearEdicts(): void {
  edicts.length = 0;
}

export function getMultiplier(domain: string, tag?: string): number {
  // multiply all that match domain and optionally tag
  // 태그가 지정되면 (정확히 일치하는 태그 ×) AND (태그 없는 일반 도메인 전언 ×) 모두 곱한다.
  let multTagged = 1.0;
  let multGlobal = 1.0;
  for (const e of edicts) {
    if (e.domain !== domain) continue;
    if (!e.tag) { multGlobal *= e.mult; continue; }
    if (tag && e.tag === tag) multTagged *= e.mult;
  }
  return Math.min(multTagged * multGlobal, MAX_TOTAL_MULT);
}

export function EdictSystem(_world: GameWorld, dt: number): void {
  for (const e of edicts) {
    e.ttl -= dt;
    // decay toward 1.0 by multiplying with decay each second
    e.mult = 1 + (e.mult - 1) * Math.pow(e.decay, dt);
  }
  for (let i = edicts.length - 1; i >= 0; i--) if (edicts[i].ttl <= 0) edicts.splice(i, 1);
}

// 간단 히트맵 샘플러용 API: 특정 태그에 대한 현재 멀티 반환(시각화 목적)
export function getDomainTagMultiplier(domain: string, tag: string): number {
  return getMultiplier(domain, tag);
}

export function getMultiplierDetail(domain: string, tag?: string): { effective: number; unclamped: number; capped: boolean } {
  let prod = 1.0;
  for (const e of edicts) {
    if (e.domain !== domain) continue;
    if (e.tag && tag && e.tag !== tag) continue;
    prod *= e.mult;
  }
  const eff = Math.min(prod, MAX_TOTAL_MULT);
  return { effective: eff, unclamped: prod, capped: prod > MAX_TOTAL_MULT };
}

export function getMaxTotalMult(): number { return MAX_TOTAL_MULT; }


