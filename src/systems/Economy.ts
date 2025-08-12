let coin = 100; // starting funds for prototype

export function getCoin(): number {
  return coin;
}

export function addCoin(amount: number): void {
  coin += amount;
}

export function spendCoin(amount: number): boolean {
  if (coin < amount) return false;
  coin -= amount;
  return true;
}


