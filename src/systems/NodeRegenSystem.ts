import type { GameWorld } from '../ecs';

export interface ResourceNode {
  nodeId: string;
  type: 'Forest' | 'IronMine' | 'HerbPatch' | 'ManaSpring';
  capMax: number;
  capNow: number;
  regenPerDay: number; // per real-time day in prototype; later use game days
  position: [number, number, number];
  slots?: { soft: number; hard: number };
}

const nodes: ResourceNode[] = [
  { nodeId: 'forest_01', type: 'Forest', capMax: 1000, capNow: 800, regenPerDay: 2, position: [60, 0, 40], slots: { soft: 4, hard: 6 } },
  { nodeId: 'iron_01', type: 'IronMine', capMax: 1000, capNow: 600, regenPerDay: 1, position: [-70, 0, 20], slots: { soft: 3, hard: 5 } },
  { nodeId: 'herb_01', type: 'HerbPatch', capMax: 300, capNow: 240, regenPerDay: 3, position: [20, 0, -40], slots: { soft: 2, hard: 3 } },
  { nodeId: 'mana_01', type: 'ManaSpring', capMax: 200, capNow: 120, regenPerDay: 0.5, position: [-30, 0, -50], slots: { soft: 1, hard: 2 } },
];

export function getNodes(): ResourceNode[] {
  return nodes;
}

const SECONDS_PER_DAY = 60 * 60 * 24;
const SAFE_RESERVE_RATIO = 0.2; // 안전 저수준 20%

export function NodeRegenSystem(_world: GameWorld, dt: number): void {
  const regenFactor = dt / SECONDS_PER_DAY;
  for (const node of nodes) {
    node.capNow = Math.min(node.capMax, node.capNow + node.regenPerDay * regenFactor);
  }
  // Maintenance extra chunks when durability simulated later; for now, create a small maintenance task randomly (demo)
  if (Math.random() < 0.0005) {
    const n = nodes[Math.floor(Math.random() * nodes.length)];
    const ex = (globalThis as any).__pfw_extra_chunks as any[] || [];
    (globalThis as any).__pfw_extra_chunks = ex;
    ex.push({ id: `Maintain_${Date.now()}`, kind: 'Maintain', refId: n.nodeId, nodeType: n.type, position: n.position, slots: { soft: 1, hard: 2 }, available: 1 });
  }
}

// 간단한 일일 쿼터 스텁: SafeReserve 이상일 때만 "가상 작업"을 발행한다고 가정
export interface DailyQuota {
  nodeId: string;
  available: number; // 오늘 채집 가능한 추정치
}

export function computeDailyQuotas(): DailyQuota[] {
  const quotas: DailyQuota[] = [];
  for (const node of nodes) {
    const safeReserve = node.capMax * SAFE_RESERVE_RATIO;
    const availableNow = Math.max(0, node.capNow - safeReserve);
    quotas.push({ nodeId: node.nodeId, available: Math.floor(availableNow) });
  }
  return quotas;
}

// 간단 채집 처리 스텁 제거(시민 시스템에서 처리)

// Citizens가 사용하는 간단 채집 헬퍼
export function tryConsumeFromNode(type: ResourceNode['type'], units: number): boolean {
  const node = nodes.find((n) => n.type === type);
  if (!node) return false;
  const safeReserve = node.capMax * SAFE_RESERVE_RATIO;
  if (node.capNow - units < safeReserve) return false;
  node.capNow -= units;
  return true;
}

// 정확한 노드 타겟 소모(동일 타입 다수 노드 지원)
export function tryConsumeFromNodeAt(nodeId: string, units: number): boolean {
  const node = nodes.find((n) => n.nodeId === nodeId);
  if (!node) return false;
  const safeReserve = node.capMax * SAFE_RESERVE_RATIO;
  if (node.capNow - units < safeReserve) return false;
  node.capNow -= units;
  return true;
}

// 간단 슬롯 예약: soft/hard 적용 및 감가 커브 계산 보조
const nodeReservations: Record<string, number[]> = {}; // nodeId -> expiry timestamps(ms)

type ReservationPool = number[]; // each entry is expiry timestamp (ms)
// const reservationTTLMs = 10000; // 10s (slots disabled)

export function getReservedSlots(nodeId: string): number {
  const arr = nodeReservations[nodeId] as ReservationPool | undefined;
  return arr ? arr.length : 0;
}

export function tryReserveNodeSlot(_nodeId: string): boolean {
  // 슬롯 제한 해제
  return true;
}

export function releaseNodeSlot(_nodeId: string): void { /* no-op: 슬롯 제한 해제 */ }

export function effectiveWorkers(_nodeId: string, n: number): number {
  // 제한 없음: 선형 효율
  return n;
}

// prune expired reservations each tick
export function pruneNodeReservations(): void {
  const now = performance.now();
  for (const id of Object.keys(nodeReservations)) {
    const arr = nodeReservations[id] as ReservationPool | undefined;
    if (!arr) continue;
    nodeReservations[id] = arr.filter((t) => t > now);
  }
}

// 노드 렌더링(간단 시각화)
import * as THREE from 'three';
import { getHeightAt } from './BiomeSystem';
import type { SceneRoot } from '../render/three/SceneRoot';

export function createNodeRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Mesh> = {};
  const bars: Record<string, THREE.Mesh> = {};
  const infoTexts: Record<string, THREE.Sprite> = {};

  function colorFor(type: ResourceNode['type']): number {
    switch (type) {
      case 'Forest': return 0x3bb273;
      case 'IronMine': return 0x888888;
      case 'HerbPatch': return 0x66ccff;
      case 'ManaSpring': return 0x8a7dff;
      default: return 0xffffff;
    }
  }

  return function NodeRenderSystem() {
    // remove stale
    for (const id of Object.keys(meshes)) {
      if (!nodes.find((n) => n.nodeId === id)) {
        const m = meshes[id];
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        delete meshes[id];
      }
    }
    // ensure meshes and sync
    for (const n of nodes) {
      let m = meshes[n.nodeId];
      const fill = THREE.MathUtils.clamp(n.capNow / n.capMax, 0.05, 1);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.CylinderGeometry(2.0, 2.0, 3.0, 18),
          new THREE.MeshBasicMaterial({ color: colorFor(n.type) })
        );
        meshes[n.nodeId] = m;
        group.add(m);
      }
      // FoW: 노드는 Visible 레이어에서만 보이도록 간단히 alpha by global flag
      let visible = true;
      try {
        const on = (window as any).__pfw_is_fog_enabled as boolean | undefined;
        const visFn = (window as any).require?.('../systems/FogOfWarSystem')?.isWorldVisible as ((x:number,z:number)=>boolean) | undefined;
        visible = !on || (visFn ? visFn(n.position[0], n.position[2]) : true);
        (m as any).visible = visible;
      } catch {}
      // stick to biome height slight offset
      const h = getHeightAt(n.position[0], n.position[2]);
      const y = (h - 0.5) * 1.2; // subtle relief
      m.position.set(n.position[0], 1.1 + y, n.position[2]);
      m.scale.set(1, fill, 1); // 남은 자원 비율로 높이 스케일

      // 예약 바(soft/hard/reserved)
      let bar = bars[n.nodeId];
      if (!bar) {
        bar = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.15, 0.3),
          new THREE.MeshBasicMaterial({ color: 0x44c0ff, transparent: true, opacity: 0.85 })
        );
        bars[n.nodeId] = bar;
        group.add(bar);
      }
      bar.position.set(n.position[0], 2.0 + y, n.position[2]);
      const softBar = n.slots?.soft ?? 4;
      const hardBar = n.slots?.hard ?? 6;
      // 외부 JobChunkSystem 모듈이 있으므로, 예약 수치를 표시하기 위해 글로벌 접근(간단 표기)
      const chList = (globalThis as any).__pfw_jobchunks as any[] | undefined;
      const ch = chList?.find((c) => c.nodeId === n.nodeId);
      const res = ch ? ch.reserved : 0;
      const frac = Math.min(1, (res / hardBar) || 0);
      bar.scale.set(Math.max(0.05, frac), 1, 1);
      const mat = bar.material as THREE.MeshBasicMaterial;
      mat.color.set(res <= softBar ? 0x44c0ff : 0xff8844);

      // 정보 텍스트: 생산량/슬롯 표시
      let spr = infoTexts[n.nodeId];
      if (!spr) {
        spr = makeTextSprite('');
        infoTexts[n.nodeId] = spr;
        group.add(spr);
      }
      spr.position.set(n.position[0], 2.6 + y, n.position[2]);
      try { (spr.material as THREE.SpriteMaterial).opacity = visible ? 1.0 : 0.0; } catch {}
      // opacity already set above with visibility check
      const line1 = `${n.type}  cap ${Math.floor(n.capNow)}/${n.capMax}`;
      const line2 = `regen ${n.regenPerDay}/day`;
      // effCurve marginal: eff(n+1)-eff(n) @ reserved
      const reservedNow = ((globalThis as any).__pfw_jobchunks as any[] | undefined)?.find((c: any) => c.nodeId === n.nodeId)?.reserved ?? 0;
      function effCurve(softSlots: number, hardSlots: number, k: number): number {
        const s = Math.max(0, softSlots); const h = Math.max(s, hardSlots);
        const clampEff = (x: number) => x <= s ? x : (x <= h ? s + 0.6 * (x - s) : s + 0.6 * (h - s));
        return Math.max(0, clampEff(k + 1) - clampEff(k));
      }
      const softSlots = n.slots?.soft ?? 4;
      const hardSlots = n.slots?.hard ?? 6;
      const marg = effCurve(softSlots, hardSlots, reservedNow);
      const line3 = `slots ${reservedNow}/${softSlots}/${hardSlots}  dEff+${marg.toFixed(2)}`;
      const txt = `${line1}\n${line2}\n${line3}`;
      updateTextSprite(spr, txt);
    }
  };
}

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  drawTextOnCanvas(ctx, canvas, text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(6, 1.5, 1);
  (spr as any).__canvas = canvas;
  (spr as any).__ctx = ctx;
  (spr as any).__tex = tex;
  return spr;
}

function updateTextSprite(spr: THREE.Sprite, text: string): void {
  const canvas = (spr as any).__canvas as HTMLCanvasElement;
  const ctx = (spr as any).__ctx as CanvasRenderingContext2D;
  const tex = (spr as any).__tex as THREE.CanvasTexture;
  drawTextOnCanvas(ctx, canvas, text);
  tex.needsUpdate = true;
}

function drawTextOnCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text: string): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const total = lines.length;
  const startY = canvas.height / 2 - ((total - 1) * 12);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 8, startY + i * 24);
  }
}


