export interface Recipe {
  title: string;
  source: string;
  imageUrl?: string;  // URL to the recipe's cover image (extracted from webpage)
  ingredients: string[];
  method: string[];
  prepTime?: string;
  cookTime?: string;
  servings?: string;
}

export interface ProcessedRecipe {
  recipe: Recipe;
  markdown: string;
  imageData?: string; // Base64 image data if extracted from source
  imageMimeType?: string;
}

export enum FileStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  SKIPPED = 'SKIPPED'
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

export interface ProcessingLog {
  id: string;
  fileName: string;
  status: FileStatus;
  timestamp: Date;
  message?: string;
  resultLink?: string;
}

// Global window extensions for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
    tokenClient: any;
  }
}
