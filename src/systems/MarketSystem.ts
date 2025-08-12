import type { GameWorld } from '../ecs';
import { getQty, addItem, consume } from './Inventory';
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

function settlementPrice(item: 'Wood' | 'Stone'): number {
  // SettlementPrice = BasePrice × (1 + Scarcity), BasePrice=1 for prototype
  const base = 1;
  const desired = 50; // desired stock
  const current = getQty(item);
  const scarcity = Math.max(-0.4, Math.min(1.0, (desired - current) / desired));
  return base * (1 + scarcity);
}

export function openContract(kind: ContractKind, item: 'Wood' | 'Stone', qty: number, limitPrice: number, ttlSec = 120): Contract {
  const c: Contract = { id: `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, item, qty, limitPrice, expiresSec: ttlSec, status: 'Open' };
  contracts.push(c);
  logs.unshift(`Open ${kind} ${qty} ${item} @≤${limitPrice.toFixed(2)} (ttl ${ttlSec}s)`);
  return c;
}

export function MarketSystem(_world: GameWorld, dt: number): void {
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
        if (spendCoin(unit * fill)) {
          addItem(c.item, fill);
          c.qty -= fill;
          logs.unshift(`Bought ${fill} ${c.item} @${unit.toFixed(2)}`);
        }
      }
    } else {
      // We sell items if price ≥ limit
      const unit = Math.max(c.limitPrice, price);
      if (unit >= c.limitPrice && getQty(c.item) > 0) {
        const fill = Math.min(c.qty, 5, getQty(c.item));
        if (consume(c.item, fill)) {
          addCoin(unit * fill);
          c.qty -= fill;
          logs.unshift(`Sold ${fill} ${c.item} @${unit.toFixed(2)}`);
        }
      }
    }
    if (c.qty <= 0) {
      c.status = 'Closed';
      logs.unshift(`Closed ${c.kind} contract`);
    }
  }
}


