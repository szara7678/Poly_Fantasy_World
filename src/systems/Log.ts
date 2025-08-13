export type LogCategory = 'Resource' | 'Market' | 'Build' | 'Road' | 'Research' | 'Combat' | 'System' | 'Sanctum' | 'Citizen';

export interface LogEntry {
  time: number; // ms since epoch
  category: LogCategory | string;
  text: string;
}

const entries: LogEntry[] = [];

const PER_CATEGORY_LIMIT = 100;

export function addLog(category: LogEntry['category'], text: string): void {
  entries.unshift({ time: Date.now(), category, text });
  // Per-category cap: keep most recent PER_CATEGORY_LIMIT entries per category
  let seen = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].category === category) {
      seen++;
      if (seen > PER_CATEGORY_LIMIT) { entries.splice(i, 1); i--; }
    }
  }
}

export function getLogs(filter?: { categories?: Array<LogEntry['category']>; limitPerCategory?: number; mode?: 'All' | 'ByTab' }): ReadonlyArray<LogEntry> {
  // mode: 'All' (전체), 'ByTab' (선택된 카테고리만)
  const selected = filter?.categories ?? [];
  const mode = filter?.mode ?? 'All';
  const limit = filter?.limitPerCategory ?? PER_CATEGORY_LIMIT;
  const out: LogEntry[] = [];
  const perCatCount = new Map<string, number>();
  for (const e of entries) {
    if (mode === 'ByTab' && selected.length > 0) {
      if (!selected.includes(e.category)) continue;
    }
    const used = perCatCount.get(e.category as string) ?? 0;
    if (used >= limit) continue;
    perCatCount.set(e.category as string, used + 1);
    out.push(e);
  }
  return out;
}

export function getCategories(): string[] {
  const set = new Set<string>();
  for (const e of entries) set.add(e.category);
  return Array.from(set.values()).sort();
}

export function clearCategory(category: LogEntry['category']): void {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].category === category) entries.splice(i, 1);
}

let listenerReady = false;
export function initLogListener(): void {
  if (listenerReady) return;
  listenerReady = true;
  try {
    window.addEventListener('pfw-ui-log', ((e: Event) => {
      const ce = e as CustomEvent<{ category: LogCategory | string; text: string }>;
      const d = ce.detail;
      if (d && d.text) addLog(d.category ?? 'System', d.text);
    }) as EventListener);
  } catch {}
}


