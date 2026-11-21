export interface Transaction {
  label: string;
  amount: number;
  at: number;
  balance: number;
}

/**
 * Player money: cash on hand + bank balance, with a ledger the UI can show.
 * All gameplay rewards and costs funnel through here.
 */
export class Economy {
  cash = 500;
  bank = 1250;
  readonly ledger: Transaction[] = [];
  onChange: (cash: number, bank: number) => void = () => {};

  add(amount: number, label: string, toBank = false): void {
    if (amount <= 0) return;
    if (toBank) this.bank += amount;
    else this.cash += amount;
    this.record(label, amount);
  }

  spend(amount: number, label: string): boolean {
    if (amount <= 0) return true;
    if (this.cash >= amount) {
      this.cash -= amount;
      this.record(label, -amount);
      return true;
    }
    if (this.cash + this.bank >= amount) {
      const fromBank = amount - this.cash;
      this.cash = 0;
      this.bank -= fromBank;
      this.record(label, -amount);
      return true;
    }
    return false;
  }

  deposit(amount: number): void {
    const move = Math.min(amount, this.cash);
    if (move <= 0) return;
    this.cash -= move;
    this.bank += move;
    this.record("Deposit", 0);
  }

  withdraw(amount: number): void {
    const move = Math.min(amount, this.bank);
    if (move <= 0) return;
    this.bank -= move;
    this.cash += move;
    this.record("Withdrawal", 0);
  }

  private record(label: string, amount: number): void {
    this.ledger.unshift({
      label,
      amount,
      at: Date.now(),
      balance: this.cash + this.bank,
    });
    if (this.ledger.length > 40) this.ledger.pop();
    this.onChange(this.cash, this.bank);
  }

  hydrate(cash: number, bank: number): void {
    this.cash = Math.max(0, Math.floor(cash));
    this.bank = Math.max(0, Math.floor(bank));
    this.onChange(this.cash, this.bank);
  }
}
