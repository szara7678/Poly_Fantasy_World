export type ItemId = 'Wood' | 'Stone' | 'Plank' | 'IronIngot' | 'Tool' | 'Herb' | 'ManaRaw' | 'ResearchPoint';

import { getBuildingsByKind } from './Buildings';

const inventory: Record<ItemId, number> = {
  Wood: 0,
  Stone: 0,
  Plank: 0,
  IronIngot: 0,
  Tool: 0,
  Herb: 0,
  ManaRaw: 0,
  ResearchPoint: 0,
};

export function getInventory(): Readonly<Record<ItemId, number>> {
  return inventory;
}

export function getQty(item: ItemId): number {
  return inventory[item];
}

// Storage capacity model: per-item capacity = base + StorageCount * bonus
const BASE_CAP_PER_ITEM = 40;
const PER_STORAGE_BONUS = 100;

export function getCapacity(item: ItemId): number {
  // ResearchPoint can be unbounded in prototype
  if (item === 'ResearchPoint') return Number.POSITIVE_INFINITY;
  const storages = getBuildingsByKind('Storage');
  const levels = storages.reduce((acc, b) => acc + (b.level ?? 1), 0);
  return BASE_CAP_PER_ITEM + levels * PER_STORAGE_BONUS;
}

export function getFreeCapacity(item: ItemId): number {
  const cap = getCapacity(item);
  const q = getQty(item);
  return Math.max(0, (isFinite(cap) ? cap : q + Number.POSITIVE_INFINITY) - q);
}

export function addItem(item: ItemId, qty: number): number {
  const cap = getCapacity(item);
  const cur = inventory[item] ?? 0;
  const room = isFinite(cap) ? Math.max(0, cap - cur) : qty;
  const add = Math.max(0, Math.min(qty, room));
  inventory[item] = cur + add;
  return add;
}

export function canConsume(item: ItemId, qty: number): boolean {
  return (inventory[item] ?? 0) >= qty;
}

// expose capacity API to global (to be used by systems without import cycles)
try {
  (globalThis as any).__pfw_inventory_api = { getFreeCapacity, getCapacity };
} catch {}

export function consume(item: ItemId, qty: number): boolean {
  if (!canConsume(item, qty)) return false;
  inventory[item] -= qty;
  return true;
}



