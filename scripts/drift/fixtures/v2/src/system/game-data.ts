export class GameData {
  getSessionKey(slot: number): string {
    return "runData" + slot;
  }
}
