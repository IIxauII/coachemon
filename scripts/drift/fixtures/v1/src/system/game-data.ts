export class GameData {
  getSessionKey(slot: number): string {
    return "sessionData" + slot;
  }
}
