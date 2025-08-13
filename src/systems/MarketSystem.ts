import type { GameWorld } from '../ecs';
import { getQty, addItem, consume } from './Inventory';
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

// 동적 Desired/수급 추세
const desiredStock: Record<'Wood' | 'Stone', number> = { Wood: 50, Stone: 50 };
const lastQty: Record<'Wood' | 'Stone', number> = { Wood: 0, Stone: 0 };
let marketInited = false;
const emaCons: Record<'Wood' | 'Stone', number> = { Wood: 0, Stone: 0 }; // units/sec
const emaProd: Record<'Wood' | 'Stone', number> = { Wood: 0, Stone: 0 }; // units/sec

function settlementPrice(item: 'Wood' | 'Stone'): number {
  // SettlementPrice = BasePrice × (1 + Scarcity), BasePrice=1
  const base = 1;
  const desired = Math.max(10, desiredStock[item]);
  const current = getQty(item);
  const scarcity = Math.max(-0.4, Math.min(1.0, (desired - current) / desired));
  return base * (1 + scarcity);
}

export function getDesired(item: 'Wood' | 'Stone'): number {
  return desiredStock[item];
}

export function getSettlementPrice(item: 'Wood' | 'Stone'): number {
  return settlementPrice(item);
}
// Link desired stock with staffing: if builders 부족, 도구 수요 상향 등(간이)
try {
  const rc = (globalThis as any).__pfw_roles as Record<string, number> | undefined;
  if (rc) {
    const low = Math.max(0, 2 - (rc['Builder'] ?? 0));
    if (low > 0) desiredStock.Wood = Math.min(150, desiredStock.Wood + low * 2);
  }
} catch {}

export function openContract(kind: ContractKind, item: 'Wood' | 'Stone', qty: number, limitPrice: number, ttlSec = 120): Contract {
  const c: Contract = { id: `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, item, qty, limitPrice, expiresSec: ttlSec, status: 'Open' };
  contracts.push(c);
  logs.unshift(`Open ${kind} ${qty} ${item} @≤${limitPrice.toFixed(2)} (ttl ${ttlSec}s)`);
  return c;
}

export function MarketSystem(_world: GameWorld, dt: number): void {
  // initialize lazily
  if (!marketInited) {
    lastQty.Wood = getQty('Wood');
    lastQty.Stone = getQty('Stone');
    marketInited = true;
  }
  // Update desired using EMA of recent consumption/production
  const alpha = Math.max(0.01, Math.min(0.2, dt));
  for (const item of ['Wood', 'Stone'] as const) {
    const cur = getQty(item);
    const dq = (cur - lastQty[item]) / Math.max(1e-3, dt); // units/sec
    const cons = Math.max(0, -dq);
    const prod = Math.max(0, dq);
    emaCons[item] = emaCons[item] * (1 - alpha) + cons * alpha;
    emaProd[item] = emaProd[item] * (1 - alpha) + prod * alpha;
    // base 50, 소비 늘면 상향, 생산 늘면 하향
    const base = 50;
    desiredStock[item] = Math.max(20, Math.min(150, base + emaCons[item] * 300 - emaProd[item] * 100));
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
        }
      }
    }
    if (c.qty <= 0) {
      c.status = 'Closed';
      logs.unshift(`Closed ${c.kind} contract`);
    }
  }
}


