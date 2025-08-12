import { isInsideAnySanctumXZ } from './SanctumSystem';

export interface DamageContext {
  position: [number, number, number];
  isRangedOrAoe: boolean;
  baseDamage: number;
}

export function applySanctumBoundaryMitigation(ctx: DamageContext): number {
  // Outside boundary: ranged/aoe damage is mitigated by 50%
  if (!isInsideAnySanctumXZ(ctx.position) && ctx.isRangedOrAoe) {
    return ctx.baseDamage * 0.5;
  }
  return ctx.baseDamage;
}


