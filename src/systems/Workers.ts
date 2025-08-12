let availableWorkers = 3; // prototype workers

export function getWorkers(): number {
  return availableWorkers;
}

export function setWorkers(n: number): void {
  availableWorkers = Math.max(0, Math.floor(n));
}

export function tryReserveWorker(): boolean {
  if (availableWorkers <= 0) return false;
  availableWorkers -= 1;
  return true;
}

export function releaseWorker(): void {
  availableWorkers += 1;
}



