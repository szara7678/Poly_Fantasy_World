import type { GameWorld } from '../ecs';
import { getQty, addItem, consume } from './Inventory';
import type { ItemId } from './Inventory';
import { getMarketFee } from './ResearchSystem';
import { getCoin, addCoin, spendCoin } from './Economy';

export type ContractKind = 'Buy' | 'Sell';

export interface Contract {
  id: string;
  kind: ContractKind;
  item: 'Wood' | 'Stone';
  qty: number;
  limitPrice: number; // per unit
  expiresSec: number;
  status: 'Open' | 'Closed';
}

const contracts: Contract[] = [];
const logs: string[] = [];

export function listContracts(): ReadonlyArray<Contract> { return contracts; }
export function listLogs(): ReadonlyArray<string> { return logs; }

// 동적 Desired/수급 추세 (전 아이템 대상; 시장은 현재 Wood/Stone만 거래)
const desiredStock: Record<ItemId, number> = {
  Wood: 50,
  Stone: 50,
  Plank: 30,
  IronIngot: 30,
  Tool: 20,
  Herb: 20,
  ManaRaw: 15,
  ResearchPoint: 40,
};
const lastQty: Record<ItemId, number> = {
  Wood: 0,
  Stone: 0,
  Plank: 0,
  IronIngot: 0,
  Tool: 0,
  Herb: 0,
  ManaRaw: 0,
  ResearchPoint: 0,
};
let marketInited = false;
const emaCons: Record<ItemId, number> = { Wood: 0, Stone: 0, Plank: 0, IronIngot: 0, Tool: 0, Herb: 0, ManaRaw: 0, ResearchPoint: 0 }; // units/sec
const emaProd: Record<ItemId, number> = { Wood: 0, Stone: 0, Plank: 0, IronIngot: 0, Tool: 0, Herb: 0, ManaRaw: 0, ResearchPoint: 0 }; // units/sec

function settlementPrice(item: ItemId): number {
  // SettlementPrice = BasePrice × (1 + Scarcity), BasePrice=1
  const base = 1;
  const desired = Math.max(10, desiredStock[item] ?? 50);
  const current = getQty(item);
  const scarcity = Math.max(-0.4, Math.min(1.0, (desired - current) / desired));
  return base * (1 + scarcity);
}

export function getDesired(item: ItemId): number {
  return desiredStock[item] ?? 50;
}

export function getSettlementPrice(item: ItemId): number {
  return settlementPrice(item);
}

export function setDesired(item: ItemId, value: number): void {
  desiredStock[item] = Math.max(0, Math.floor(value));
}
// role-less mode: remove staffing-linked desired adjustments

export function openContract(kind: ContractKind, item: 'Wood' | 'Stone', qty: number, limitPrice: number, ttlSec = 120): Contract {
  const c: Contract = { id: `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, item, qty, limitPrice, expiresSec: ttlSec, status: 'Open' };
  contracts.push(c);
  logs.unshift(`Open ${kind} ${qty} ${item} @≤${limitPrice.toFixed(2)} (ttl ${ttlSec}s)`);
  return c;
}

export function MarketSystem(_world: GameWorld, dt: number): void {
  // initialize lazily
  if (!marketInited) {
    for (const item of Object.keys(lastQty) as ItemId[]) lastQty[item] = getQty(item as any);
    marketInited = true;
  }
  // Update desired using EMA of recent consumption/production
  const alpha = Math.max(0.01, Math.min(0.2, dt));
  for (const item of Object.keys(desiredStock) as ItemId[]) {
    const cur = getQty(item);
    const dq = (cur - lastQty[item]) / Math.max(1e-3, dt); // units/sec
    const cons = Math.max(0, -dq);
    const prod = Math.max(0, dq);
    emaCons[item] = emaCons[item] * (1 - alpha) + cons * alpha;
    emaProd[item] = emaProd[item] * (1 - alpha) + prod * alpha;
    // base 50, 소비 늘면 상향, 생산 늘면 하향
    const base = desiredStock[item] ?? 50;
    desiredStock[item] = Math.max(10, Math.min(200, base + emaCons[item] * 300 - emaProd[item] * 120));
    lastQty[item] = cur;
  }
  for (const c of contracts) {
    if (c.status !== 'Open') continue;
    c.expiresSec -= dt;
    if (c.expiresSec <= 0) {
      c.status = 'Closed';
      logs.unshift(`Expired ${c.kind} ${c.qty} ${c.item}`);
      continue;
    }
    const price = settlementPrice(c.item);
      if (c.kind === 'Buy') {
      // We buy items from market if price ≤ limit and have coin
      const unit = Math.min(c.limitPrice, price);
        if (unit <= c.limitPrice && getCoin() >= unit) {
        const fill = Math.min(c.qty, 5); // fill in small batches
          const fee = getMarketFee();
          const cost = unit * fill * (1 + fee);
          if (spendCoin(cost)) {
          addItem(c.item, fill);
          c.qty -= fill;
            logs.unshift(`Bought ${fill} ${c.item} @${unit.toFixed(2)} (fee ${Math.round(fee*100)}%)`);
            // Price impact: buying increases desired-stock gap → slight price uptick next tick
            desiredStock[c.item] = Math.min(150, desiredStock[c.item] + Math.max(1, fill * 0.5));
        }
      }
    } else {
      // We sell items if price ≥ limit
      const unit = Math.max(c.limitPrice, price);
      if (unit >= c.limitPrice && getQty(c.item) > 0) {
        const fill = Math.min(c.qty, 5, getQty(c.item));
        if (consume(c.item, fill)) {
            const fee = getMarketFee();
            addCoin(unit * fill * (1 - fee));
          c.qty -= fill;
            logs.unshift(`Sold ${fill} ${c.item} @${unit.toFixed(2)} (fee ${Math.round(fee*100)}%)`);
            // Price impact: selling lowers scarcity → desired-stock gap narrows slightly
            desiredStock[c.item] = Math.max(20, desiredStock[c.item] - Math.max(1, fill * 0.4));
        }
      }
    }
    if (c.qty <= 0) {
      c.status = 'Closed';
      logs.unshift(`Closed ${c.kind} contract`);
    }
  }
}


