export type RecipeIndexSort =
  | "title-asc"
  | "title-desc"
  | "added-asc"
  | "added-desc"
  | "scheduled-asc"
  | "scheduled-desc";

export type RecipeIndexFilter = {
  marked?: boolean;
  scheduled?: boolean;
  tags?: string[];
  addedAfter?: number;
};

export type RecipeIndexQuery = {
  sortBy?: RecipeIndexSort;
  filter?: RecipeIndexFilter;
  search?: string;
  limit?: number;
};

export type RecipeIndexItem = {
  path: string;
  title: string;
  coverPath: string | null;
  marked: boolean;
  added: string | null;
  scheduled: string | null;
  addedTimestamp: number | null;
  scheduledTimestamp: number | null;
  tags: string[];
};

export type CachedRecipe = RecipeIndexItem & {
  fingerprint: string;
  titleLower: string;
  tagsLower: string[];
};

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