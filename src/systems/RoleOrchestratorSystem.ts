import type { GameWorld } from '../ecs';

// Role orchestrator disabled (role-less mode)
export function getAssignments(): Readonly<Record<string, never>> { return {}; }
export function getRoleQuotas(): Readonly<Record<string, never>> { return {}; }

export function RoleOrchestratorSystem(_world: GameWorld, _dt: number): void {
  // disabled per role-less scheduling migration
}


