import { generateMoveset } from "#app/ai/ai-moveset-gen";

export class Pokemon {
  public level = 1;
  generateAndPopulateMoveset(): void {
    generateMoveset(this);
  }
}

export class EnemyPokemon extends Pokemon {
  override generateAndPopulateMoveset(): void {
    if (this.level > 100) return;
    super.generateAndPopulateMoveset();
  }
}
