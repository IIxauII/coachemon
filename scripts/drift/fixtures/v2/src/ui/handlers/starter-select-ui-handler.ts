export class StarterSelectUiHandler {
  public cursor = 0;
  public rerollCount = 0;
  processInput(button: number): boolean {
    return this.popStarter(button);
  }
  popStarter(index: number): boolean {
    return index >= 0;
  }
}
