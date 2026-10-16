export class UI {
  private _mode = 0;
  public modeChain: readonly number[] = [];
  get mode(): number {
    return this._mode;
  }
}
