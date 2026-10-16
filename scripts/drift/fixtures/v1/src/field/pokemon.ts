import { generateMoveset } from "#app/ai/ai-moveset-gen";

export class Pokemon {
  public level = 1;
  generateAndPopulateMoveset(): void {
    generateMoveset(this);
  }
}
