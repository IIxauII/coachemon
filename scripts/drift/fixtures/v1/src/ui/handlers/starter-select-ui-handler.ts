export class StarterSelectUiHandler {
  private filteredStarterContainers: unknown[] = [];
  private lastSpecies: unknown;
  public cursor = 0;
  processInput(button: number): boolean {
    return this.popStarter(button);
  }
  popStarter(index: number): boolean {
    return index >= 0;
  }
}
