export type ItemId = 'Wood' | 'Stone';

const inventory: Record<ItemId, number> = {
  Wood: 0,
  Stone: 0,
};

export function getInventory(): Readonly<Record<ItemId, number>> {
  return inventory;
}

export function getQty(item: ItemId): number {
  return inventory[item];
}

export function addItem(item: ItemId, qty: number): void {
  inventory[item] = Math.max(0, (inventory[item] ?? 0) + qty);
}

export function canConsume(item: ItemId, qty: number): boolean {
  return (inventory[item] ?? 0) >= qty;
}

export function consume(item: ItemId, qty: number): boolean {
  if (!canConsume(item, qty)) return false;
  inventory[item] -= qty;
  return true;
}



