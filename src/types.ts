export interface Recipe {
  title: string;
  source?: string;
  imageUrl?: string;
  ingredients: string[];
  method: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
}

export interface ProcessedRecipe {
  recipe: Recipe;
  imageBytes?: ArrayBuffer;
  imageMimeType?: string;
}
