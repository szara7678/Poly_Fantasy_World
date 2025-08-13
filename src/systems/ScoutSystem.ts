// Scouts removed — keep minimal stubs
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';

export function getScoutCount(): number { return 0; }
export function spawnScout(_radius = 80, _speed = 0.3): void { /* noop */ }
export function clearScouts(): void { /* noop */ }
export function ScoutSystem(_world: GameWorld, _dt: number): void { /* noop */ }
export function createScoutRenderSystem(_scene: SceneRoot) { return function(): void { /* noop */ }; }


