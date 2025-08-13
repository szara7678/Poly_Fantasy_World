import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';

interface Monster {
  id: string;
  kind: 'Wolf' | 'Goblin';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  speed: number;
  hp: number;
  atk: number;
  range: number;
  cooldown: number;
  // AI
  state?: 'Roam' | 'Chase' | 'Regroup' | 'Flee';
  packId?: string;
  breedCd?: number; // seconds remaining before pack can breed again
  // Stats/skills
  stats: { STR: number; DEX: number; INT: number; VIT: number };
  skills: { melee: number; pack: number; survival: number };
}

const monsters: Monster[] = [];

export function getMonsterCount(): number { return monsters.length; }
export function getMonsters(): ReadonlyArray<Monster> { return monsters; }

export function spawnMonster(kind: Monster['kind'] = 'Wolf', posOpt?: THREE.Vector3, parentA?: Monster, parentB?: Monster): void {
  const sanctums = getSanctums();
  const s = sanctums[0];
  const pos = posOpt ?? (() => {
    const radius = s ? s.radius + 60 + Math.random() * 80 : 120 + Math.random() * 120;
    const ang = Math.random() * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
  })();
  // inherit or randomize stats
  const base = (n: number, v: number) => n + Math.floor((Math.random() - 0.5) * v);
  const stats = parentA && parentB ? {
    STR: base(Math.floor((parentA.stats.STR + parentB.stats.STR) / 2), 2),
    DEX: base(Math.floor((parentA.stats.DEX + parentB.stats.DEX) / 2), 2),
    INT: base(Math.floor((parentA.stats.INT + parentB.stats.INT) / 2), 2),
    VIT: base(Math.floor((parentA.stats.VIT + parentB.stats.VIT) / 2), 2),
  } : {
    STR: 8 + Math.floor(Math.random() * 6),
    DEX: 8 + Math.floor(Math.random() * 6),
    INT: 6 + Math.floor(Math.random() * 6),
    VIT: 10 + Math.floor(Math.random() * 6),
  };
  const m: Monster = {
    id: `mob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    pos,
    vel: new THREE.Vector3(),
    speed: (kind === 'Wolf' ? 3.4 : 2.7) * (1 + (stats.DEX - 10) / 50),
    hp: (kind === 'Wolf' ? 30 : 50) + (stats.VIT - 10) * 2,
    atk: (kind === 'Wolf' ? 6 : 8) + Math.floor((stats.STR - 10) / 2),
    range: kind === 'Wolf' ? 1.2 : 3.0,
    cooldown: 0,
    state: 'Roam',
    packId: undefined,
    breedCd: 60 + Math.random() * 60,
    stats,
    skills: { melee: 0, pack: 0, survival: 0 },
  };
  // assign pack: find nearest same kind within radius
  const nearby = monsters.filter(o => o.kind === kind && o.pos.distanceTo(pos) <= 20);
  if (nearby.length > 0) m.packId = nearby[0].packId ?? nearby[0].id;
  else m.packId = m.id;
  monsters.push(m);
}

let accum = 0;
export function MonsterSystem(_world: GameWorld, dt: number): void {
  accum += dt;
  if (accum >= 15) { // 주기적 스폰
    accum = 0;
    spawnMonster(Math.random() < 0.7 ? 'Wolf' : 'Goblin');
  }
  const sanctums = getSanctums();
  // Build pack centers
  const packCenter = new Map<string, THREE.Vector3>();
  const packCount = new Map<string, number>();
  for (const m of monsters) {
    if (!m.packId) continue;
    const cur = packCenter.get(m.packId) ?? new THREE.Vector3();
    cur.add(m.pos);
    packCenter.set(m.packId, cur);
    packCount.set(m.packId, (packCount.get(m.packId) ?? 0) + 1);
  }
  for (const [id, v] of packCenter) {
    const n = packCount.get(id) ?? 1;
    v.multiplyScalar(1 / n);
  }
  // breeding per pack
  const maxMonsters = 80;
  if (monsters.length < maxMonsters) {
    for (const m of monsters) m.breedCd = Math.max(0, (m.breedCd ?? 0) - dt);
    const byPack = new Map<string, Monster[]>();
    for (const m of monsters) {
      if (!m.packId) continue;
      const arr = byPack.get(m.packId) ?? [];
      arr.push(m); byPack.set(m.packId, arr);
    }
    for (const [pid, list] of byPack) {
      if ((packCount.get(pid) ?? 0) < 3) continue;
      const ready = list.every(m => (m.breedCd ?? 0) <= 0);
      if (!ready) continue;
      if (Math.random() < 0.15) {
        const center = packCenter.get(pid) ?? list[0].pos;
        const a = list[Math.floor(Math.random() * list.length)];
        const b = list[Math.floor(Math.random() * list.length)];
        spawnMonster(a.kind, center.clone().add(new THREE.Vector3((Math.random()-0.5)*2,0,(Math.random()-0.5)*2)), a, b);
        for (const m of list) m.breedCd = 90 + Math.random() * 60;
        try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Combat', text: `몬스터 번식: ${a.kind} 무리 +1` } })); } catch {}
      }
    }
  }
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    m.cooldown = Math.max(0, m.cooldown - dt);
    // AI: pack-aware roaming with occasional raids
    const center = (m.packId && packCenter.get(m.packId)) ? packCenter.get(m.packId)!.clone() : new THREE.Vector3();
    const toCenter = center.clone().sub(m.pos);
    const distCenter = toCenter.length();
    const lowHp = m.hp < ((m.kind === 'Wolf' ? 30 : 50) * 0.3);
    const wander = new THREE.Vector3(Math.cos((performance.now()/1000) + i) * 0.5, 0, Math.sin((performance.now()/1000) + i) * 0.5);
    let desired = new THREE.Vector3();
    if (lowHp && distCenter > 2) {
      desired.copy(toCenter).normalize();
    } else {
      // slight pull towards center + wander
      desired.copy(toCenter.multiplyScalar(0.02)).add(wander);
      // chance to raid nearest sanctum if close enough as a group
      if (sanctums.length > 0 && (packCount.get(m.packId ?? '') ?? 1) >= 3) {
        const s0 = sanctums[0];
        const dToSanctum = center.distanceTo(new THREE.Vector3(s0.center[0],0,s0.center[2]));
        if (dToSanctum < s0.radius + 60) {
          const dirTo = new THREE.Vector3(s0.center[0],0,s0.center[2]).sub(m.pos).normalize();
          desired.add(dirTo.multiplyScalar(0.8));
        }
      }
    }
    if (desired.lengthSq() > 1e-4) desired.normalize();
    m.vel.copy(desired.multiplyScalar(m.speed));
    m.pos.addScaledVector(m.vel, dt);
    // 공격 로직: 범위 내 시민이 있으면 공격 (거리가 충분히 가까울수록 쿨다운 단축)
    if (m.cooldown <= 0) {
      const hit = (globalThis as any).__pfw_damageCitizen?.(m.pos.x, m.pos.z, m.atk, m.range) ?? false;
      if (hit) {
        const speedup = Math.max(0.8, 1.2 - Math.min(0.6, (m.range - 0.8) * 0.2));
        m.cooldown = speedup; // 근접 계열 약간 더 빠름
        m.skills.melee += 1;
        m.stats.STR += Math.random() < 0.2 ? 1 : 0;
        m.stats.DEX += Math.random() < 0.15 ? 1 : 0;
        m.atk += Math.random() < 0.2 ? 1 : 0;
        m.speed *= 1 + (Math.random() < 0.1 ? 0.02 : 0);
      }
    }
    // 사망 제거(향후 전투 연동). HP가 0 이하인 몬스터 제거
    if (m.hp <= 0) monsters.splice(i, 1);
  }
}

export function createMonsterRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Object3D> = {};
  const hpBars: Record<string, THREE.Mesh> = {};
  const bubbles: Record<string, { sprite: THREE.Sprite; emoji: string }> = {};
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
  function emojiForMonster(m: any): string {
    // 추격/공격/배회 상태 간단 추정
    const speed = m.vel?.length?.() ?? 0;
    if (m.cooldown > 0.6) return '💢'; // 방금 때림
    if (speed > 0.2) return '🏃';
    return '👀';
  }
  function colorFor(kind: Monster['kind']): number { return kind === 'Wolf' ? 0x665544 : 0x2e7d32; }
  function makeWolf(): THREE.Object3D {
    const g = new THREE.Group();
    const matBody = new THREE.MeshBasicMaterial({ color: colorFor('Wolf') });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.35), matBody);
    body.position.set(0, 0.45, 0); g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), matBody);
    head.position.set(0, 0.55, 0.4); g.add(head);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), matBody);
    tail.position.set(0, 0.55, -0.45); tail.rotation.x = Math.PI / 2; g.add(tail);
    const legGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6);
    const matLeg = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const fl = new THREE.Mesh(legGeom, matLeg); fl.position.set(-0.3, 0.2, 0.2); g.add(fl);
    const fr = fl.clone(); fr.position.set(0.3, 0.2, 0.2); g.add(fr);
    const bl = fl.clone(); bl.position.set(-0.3, 0.2, -0.2); g.add(bl);
    const br = fl.clone(); br.position.set(0.3, 0.2, -0.2); g.add(br);
    (g as any).userData = { fl, fr, bl, br, tail, head };
    return g;
  }
  function makeGoblin(): THREE.Object3D {
    const g = new THREE.Group();
    const matBody = new THREE.MeshBasicMaterial({ color: colorFor('Goblin') });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), matBody);
    body.position.y = 0.8; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), new THREE.MeshBasicMaterial({ color: 0x99cc66 }));
    head.position.y = 1.4; g.add(head);
    const earGeom = new THREE.ConeGeometry(0.08, 0.18, 8);
    const earL = new THREE.Mesh(earGeom, new THREE.MeshBasicMaterial({ color: 0x99cc66 })); earL.position.set(-0.18, 1.5, 0); earL.rotation.z = Math.PI * 0.25; g.add(earL);
    const earR = earL.clone(); earR.position.x = 0.18; earR.rotation.z = -Math.PI * 0.25; g.add(earR);
    const legGeom = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8);
    const matLimb = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const ll = new THREE.Mesh(legGeom, matLimb); ll.position.set(-0.16, 0.3, 0); g.add(ll);
    const lr = ll.clone(); lr.position.x = 0.16; g.add(lr);
    const armGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8);
    const al = new THREE.Mesh(armGeom, matLimb); al.position.set(-0.32, 1.0, 0.08); al.rotation.z = Math.PI / 2.5; g.add(al);
    const ar = al.clone(); ar.position.set(0.32, 1.0, 0.08); ar.rotation.z = -Math.PI / 2.5; g.add(ar);
    // crude spear for attack
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    shaft.position.set(0, 0.35, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), new THREE.MeshBasicMaterial({ color: 0xc0c0c0 }));
    tip.position.set(0, 0.75, 0);
    spear.add(shaft); spear.add(tip); spear.position.set(0.36, 1.0, 0.0); spear.rotation.z = -0.8; g.add(spear);
    (g as any).userData = { ll, lr, al, ar, head, spear };
    return g;
  }
  function makeMonster(kind: Monster['kind']): THREE.Object3D {
    return kind === 'Wolf' ? makeWolf() : makeGoblin();
  }

  return function MonsterRender(_world: GameWorld, _dt: number): void {
    for (const id of Object.keys(meshes)) {
      if (!monsters.find((m) => m.id === id)) {
        const mm = meshes[id];
        group.remove(mm);
        (mm as any).traverse?.((obj: any) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
        delete meshes[id];
        const hb = hpBars[id];
        if (hb) { group.remove(hb); hb.geometry.dispose(); (hb.material as THREE.Material).dispose(); delete hpBars[id]; }
        const b = bubbles[id];
        if (b) { group.remove(b.sprite); (b.sprite.material as THREE.SpriteMaterial).map?.dispose?.(); (b.sprite.material as THREE.Material).dispose(); delete bubbles[id]; }
      }
    }
    for (const m of monsters) {
      let mesh = meshes[m.id];
      if (!mesh) { mesh = makeMonster(m.kind); meshes[m.id] = mesh; group.add(mesh); }
      mesh.position.set(m.pos.x, 0.6, m.pos.z);
      // 이동 방향으로 회전
      if (m.vel.lengthSq() > 1e-4) {
        const yaw = Math.atan2(m.vel.x, m.vel.z);
        mesh.rotation.y = yaw;
      }
      // HP bar
      let bar = hpBars[m.id];
      if (!bar) {
        bar = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.08),
          new THREE.MeshBasicMaterial({ color: 0xff4444 })
        );
        bar.rotation.x = -Math.PI / 2;
        hpBars[m.id] = bar;
        group.add(bar);
      }
      bar.position.set(m.pos.x, 1.25, m.pos.z);
      const hpFrac = Math.max(0, Math.min(1, m.hp / (m.kind === 'Wolf' ? 30 : 50)));
      bar.scale.set(Math.max(0.05, hpFrac), 1, 1);
      // emoji bubble
      const emoji = emojiForMonster(m);
      const cur = bubbles[m.id];
      if (!cur || cur.emoji !== emoji) {
        if (cur) { group.remove(cur.sprite); (cur.sprite.material as THREE.SpriteMaterial).map?.dispose?.(); (cur.sprite.material as THREE.Material).dispose(); delete bubbles[m.id]; }
        const spr = makeEmojiSprite(emoji);
        bubbles[m.id] = { sprite: spr, emoji };
        group.add(spr);
      }
      const spr = bubbles[m.id]?.sprite;
      if (spr) spr.position.set(m.pos.x, 1.7, m.pos.z);
      // animation by kind
      const ud: any = (mesh as any).userData || {};
      const t = performance.now() / 1000;
      const moving = m.vel.lengthSq() > 0.02;
      if (m.kind === 'Wolf') {
        const fl: THREE.Mesh | undefined = ud.fl; const fr: THREE.Mesh | undefined = ud.fr; const bl: THREE.Mesh | undefined = ud.bl; const br: THREE.Mesh | undefined = ud.br;
        const tail: THREE.Mesh | undefined = ud.tail; const head: THREE.Mesh | undefined = ud.head;
        const a = moving ? Math.sin(t * 10) * 0.35 : 0;
        if (fl && fr && bl && br) {
          fl.rotation.x = a; fr.rotation.x = -a; bl.rotation.x = -a; br.rotation.x = a;
        }
        if (tail) tail.rotation.z = Math.sin(t * 6) * 0.25;
        if (head) head.position.y = 0.55 + (moving ? Math.sin(t * 6) * 0.03 : 0);
      } else {
        const ll: THREE.Mesh | undefined = ud.ll; const lr: THREE.Mesh | undefined = ud.lr;
        const al: THREE.Mesh | undefined = ud.al; const ar: THREE.Mesh | undefined = ud.ar; const spear: THREE.Group | undefined = ud.spear;
        const walk = moving ? Math.sin(t * 6) * 0.25 : 0;
        if (ll && lr) { ll.rotation.x = walk; lr.rotation.x = -walk; }
        if (al && ar) { al.rotation.x = -walk * 0.6; ar.rotation.x = walk * 0.6; }
        if (spear) {
          // quick jab when on cooldown just triggered
          const jab = m.cooldown > 0.6 ? Math.sin((1.2 - Math.min(1.2, m.cooldown)) * Math.PI * 3) * 0.5 : 0;
          spear.rotation.x = -0.4 + jab;
        }
      }
    }
  };
}

// 위협도: 성역 반경+60m 내 몬스터 수 기반 간이 지표(0~1)
export function threatNearSanctums(): number {
  const sanctums = getSanctums();
  let near = 0;
  for (const m of monsters) {
    for (const s of sanctums) {
      const dx = m.pos.x - s.center[0];
      const dz = m.pos.z - s.center[2];
      const d = Math.hypot(dx, dz);
      if (d <= s.radius + 60) { near += 1; break; }
    }
  }
  return Math.max(0, Math.min(1, near / 6));
}

let wartime = false;
const ENTER_THRESHOLD = 0.6;
const EXIT_THRESHOLD = 0.4;

export function getThreat(): number {
  const raw = threatNearSanctums();
  if (!wartime && raw >= ENTER_THRESHOLD) wartime = true;
  if (wartime && raw <= EXIT_THRESHOLD) wartime = false;
  return wartime ? Math.max(raw, ENTER_THRESHOLD) : Math.min(raw, EXIT_THRESHOLD);
}

export function damageNearestMonster(x: number, z: number, amount: number, radius = 2.0): boolean {
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    const d = Math.hypot(m.pos.x - x, m.pos.z - z);
    if (d <= radius && d < bestD) { bestD = d; bestIdx = i; }
  }
  if (bestIdx >= 0) {
    monsters[bestIdx].hp -= amount;
    if (monsters[bestIdx].hp <= 0) monsters.splice(bestIdx, 1);
    return true;
  }
  return false;
}


