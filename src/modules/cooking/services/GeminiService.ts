import { GoogleGenAI, Schema, Tool, Type } from "@google/genai";
import { InboxJob } from "../services/InboxWatcher";
import { ProcessedRecipe, Recipe } from "../types";
import {
  extractOgImageFromPage,
  extractRecipeFromHtml,
  fetchHtmlFromPage,
  fetchImageAsArrayBuffer,
  fetchReadableTextFromPage,
  mergeRecipeFallback
} from "./RecipeParser";

export type GeminiImagePayload = {
  bytes: ArrayBuffer;
  mimeType: string;
};

const MAX_SOURCE_TEXT_CHARS = 20000;

const STRICT_SYSTEM_INSTRUCTION =
  "You are a strict extraction engine. Only output information that is explicitly present in the provided content. Never guess or invent details. If data is missing, return empty strings or empty arrays.";

const LABEL_SYSTEM_INSTRUCTION =
  "You are a strict ingredient labeling engine. Think carefully and choose the best label from the allowed list. Do not default due to uncertainty; only use the default label when no other label fits. Output JSON only.";
const SHOPPING_SYSTEM_INSTRUCTION =
  "You are a strict shopping list engine. Only use ingredients explicitly present in the input. Never invent items or quantities. Output JSON only.";

const RECIPE_JSON_SCHEMA_PROMPT = `
  Extract the recipe from the provided content.
  You MUST NOT infer, guess, or add anything that is not explicitly present.
  Return the output strictly as a JSON object with the following schema:
  {
    "title": "string (the recipe name)",
    "source": "string (original source URL, website name, or cookbook name if identifiable)",
    "imageUrl": "string (full valid URL to the main recipe image, only if explicitly present)",
    "ingredients": ["string", "string"],
    "method": ["string", "string"],
    "prepTime": "string (optional)",
    "cookTime": "string (optional)",
    "servings": "string (optional)"
  }

  Important notes:
  - Use "method" for cooking steps, not "instructions"
  - Ingredients and method steps must be copied verbatim or minimally cleaned (remove bullets/numbering only)
  - If information is missing, use empty strings or empty arrays
  - Do not add markdown formatting like 
`;

const recipeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    source: { type: Type.STRING },
    imageUrl: { type: Type.STRING },
    ingredients: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    method: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    prepTime: { type: Type.STRING },
    cookTime: { type: Type.STRING },
    servings: { type: Type.STRING }
  },
  required: ["title", "ingredients", "method"]
};

const buildLabelSchema = (labels: string[]): Schema => ({
  type: Type.OBJECT,
  properties: {
    labels: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: labels
      }
    }
  },
  required: ["labels"]
});

const buildShoppingListSchema = (labels: string[]): Schema => ({
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          label: { type: Type.STRING, enum: labels }
        },
        required: ["content", "label"]
      }
    }
  },
  required: ["items"]
});

const buildLabelPrompt = (
  ingredients: string[],
  labels: string[],
  defaultLabel: string
) => `Label each ingredient using one of the allowed labels below.

Rules:
- Return a JSON object with a "labels" array matching the input order.
- The array length MUST equal the number of input ingredients.
- Only use labels from the allowed list.
- If unsure, think harder. Only use "${defaultLabel}" when no other label fits.

Allowed labels: ${labels.join(", ")}

Ingredients (order matters):
${JSON.stringify(ingredients)}
`;

const buildShoppingListPrompt = (payload: {
  recipes: Array<{ title: string; content: string }>;
  ignoreList: string[];
  allowedLabels: string[];
  defaultLabel: string;
  stopWords: string[];
}) => `Create a single deduplicated shopping list from the recipes below.

Rules:
- Think carefully about units and conversions before responding.
- Use ONLY ingredients explicitly present in the input content.
- Each recipe includes raw markdown content. Extract ingredients from the content.
- Prefer the "## Ingredients" section when present; otherwise use explicit ingredient lines from the recipe text.
- Ignore frontmatter and non-ingredient lines (headings, section labels like "for the sauce", "toppings:", "optional", instructions).
- Canonicalize ingredient names by removing prep notes and descriptors (e.g. "parmesan grated" -> "parmesan").
- Keep distinct ingredients separate (e.g. red wine vinegar != sherry vinegar).
- Ignore any ingredient matching the ignore list (including variants like sea salt or black pepper).
- Merge identical ingredients across recipes; sum quantities after converting to metric (g, ml). Keep count units as counts.
- Output all text in lowercase.
- Build short recipe names: remove stop words, then keep the first 3 words (fallback to first 3 words if none remain).
- Short recipe names must keep the dish noun if present (soup, stew, curry, salad, pahi, roast, bowl, bake, pie).
- Format each item as:
  - with quantity: "ingredient - quantity - [recipe a, recipe b]"
  - without quantity: "ingredient - [recipe a, recipe b]"
- Quantity formatting:
  - metric weights/volumes: use compact format like "250g", "500ml"
- convert cups to metric (ml) and do NOT output "cup"/"cups"
- counts: use "ingredient - 2" when the unit is the ingredient itself (e.g. onions -> "onions - 2")
- counts: use unit nouns only when they differ from the ingredient (e.g. "garlic - 2 cloves", "parsley - 1 bunch")
- if a quantity has no unit, treat it as a count ("ingredient - 2")
- citrus conversion: lemon/lime zest or juice should become base fruit counts (e.g. "lemon zest" -> "lemons - 1"; "juice of 2 limes" -> "limes - 2")
- herb freshness: if the ingredient explicitly says fresh or dried, append "(fresh)" or "(dried)"; otherwise no suffix
- Labels MUST be one of the allowed labels. If unsure, think harder and only use the default label when no other label fits.

Allowed labels: ${payload.allowedLabels.join(", ")}
Default label: ${payload.defaultLabel}
Ignore list: ${payload.ignoreList.join(", ")}
Stop words: ${payload.stopWords.join(", ")}

Input JSON:
${JSON.stringify({ recipes: payload.recipes }, null, 2)}

Return JSON in the schema:
{ "items": [ { "content": "string", "label": "string" } ] }
`;

const normalizeForMatch = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const filterBySource = (values: string[], sourceText?: string) => {
  if (!sourceText || values.length === 0) return values;
  const normalizedSource = normalizeForMatch(sourceText);
  if (!normalizedSource) return values;
  return values.filter((value) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return false;
    return normalizedSource.includes(normalized);
  });
};

const toBase64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private clientKey: string | null = null;

  constructor(private readonly getApiKey: () => string) {}

  async labelIngredients(payload: {
    ingredients: string[];
    allowedLabels: string[];
    defaultLabel: string;
  }): Promise<string[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is missing");
    }

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientKey = apiKey;
    }

    const ingredients = payload.ingredients.map((item) => item.trim()).filter(Boolean);
    if (ingredients.length === 0) return [];

    const allowedLabels = Array.from(
      new Set(payload.allowedLabels.map((label) => label.trim()).filter(Boolean))
    );
    if (!allowedLabels.includes(payload.defaultLabel)) {
      allowedLabels.push(payload.defaultLabel);
    }
    if (allowedLabels.length === 0) {
      throw new Error("No allowed labels provided");
    }

    const response = await this.client.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          {
            text: buildLabelPrompt(ingredients, allowedLabels, payload.defaultLabel)
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: buildLabelSchema(allowedLabels),
        systemInstruction: LABEL_SYSTEM_INSTRUCTION,
        temperature: 0,
        topK: 1,
        topP: 0.1,
        seed: 0
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    const parsed = JSON.parse(text) as { labels?: unknown };
    if (!Array.isArray(parsed.labels)) {
      throw new Error("Gemini response missing labels array");
    }

    if (parsed.labels.length !== ingredients.length) {
      throw new Error("Gemini label count mismatch");
    }

    const allowed = new Set(allowedLabels);
    const labels = parsed.labels.map((label) =>
      typeof label === "string" ? label.trim() : ""
    );
    for (const label of labels) {
      if (!label || !allowed.has(label)) {
        throw new Error(`Gemini returned unsupported label: ${label}`);
      }
    }

    return labels;
  }

  async buildShoppingList(payload: {
    recipes: Array<{ title: string; content: string }>;
    ignoreList: string[];
    allowedLabels: string[];
    defaultLabel: string;
    stopWords: string[];
  }): Promise<Array<{ content: string; label: string }>> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is missing");
    }

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientKey = apiKey;
    }

    const recipes = payload.recipes
      .map((recipe) => ({
        title: recipe.title.trim(),
        content: recipe.content.trim()
      }))
      .filter((recipe) => recipe.title && recipe.content);
    if (recipes.length === 0) return [];

    const defaultLabel = payload.defaultLabel.trim().toLowerCase();
    const allowedLabels = Array.from(
      new Set(payload.allowedLabels.map((label) => label.trim().toLowerCase()).filter(Boolean))
    );
    if (!allowedLabels.includes(defaultLabel)) {
      allowedLabels.push(defaultLabel);
    }
    if (allowedLabels.length === 0) {
      throw new Error("No allowed labels provided");
    }

    const response = await this.client.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          {
            text: buildShoppingListPrompt({
              recipes,
              ignoreList: payload.ignoreList,
              allowedLabels,
              defaultLabel,
              stopWords: payload.stopWords
            })
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: buildShoppingListSchema(allowedLabels),
        systemInstruction: SHOPPING_SYSTEM_INSTRUCTION,
        temperature: 0,
        topK: 1,
        topP: 0.1,
        seed: 0
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    const parsed = JSON.parse(text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) {
      throw new Error("Gemini response missing items array");
    }

    const allowed = new Set(allowedLabels);
    return parsed.items.map((item) => {
      if (!item || typeof item !== "object") {
        throw new Error("Gemini returned invalid item");
      }
      const content = "content" in item ? String((item as any).content ?? "").trim() : "";
      const rawLabel = "label" in item ? String((item as any).label ?? "").trim() : "";
      const label = rawLabel.toLowerCase();
      if (!content) {
        throw new Error("Gemini returned empty content");
      }
      if (!label || !allowed.has(label)) {
        throw new Error(`Gemini returned unsupported label: ${rawLabel}`);
      }
      return { content, label };
    });
  }

  async process(job: InboxJob, imagePayload?: GeminiImagePayload): Promise<ProcessedRecipe> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is missing");
    }

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientKey = apiKey;
    }

    const modelId = "gemini-flash-latest";
    let contents: any;
    let tools: Tool[] | undefined = undefined;
    let recipe: Recipe | null = null;
    let sourceText: string | undefined;
    let fallbackRecipe: Recipe | null = null;
    let fallbackImageUrl: string | undefined;

    if (job.type === "url") {
      const html = await fetchHtmlFromPage(job.content);
      if (html) {
        const extraction = extractRecipeFromHtml(html, job.content);
        if (extraction) {
          sourceText = extraction.pageText;
          fallbackRecipe = extraction.recipe;
          fallbackImageUrl = extraction.imageUrl;
        }
      } else {
        const readable = await fetchReadableTextFromPage(job.content);
        if (readable) {
          sourceText = readable;
        }
      }

      if (
        fallbackRecipe &&
        fallbackRecipe.ingredients.length > 0 &&
        fallbackRecipe.method.length > 0
      ) {
        recipe = fallbackRecipe;
      }
    }

    if (!recipe && job.type === "image") {
      if (!imagePayload) {
        throw new Error("Image payload missing for image job");
      }
      contents = {
        parts: [
          {
            inlineData: {
              mimeType: imagePayload.mimeType,
              data: toBase64(imagePayload.bytes)
            }
          },
          { text: RECIPE_JSON_SCHEMA_PROMPT }
        ]
      };
    } else if (!recipe && job.type === "url") {
      const trimmedText = sourceText?.slice(0, MAX_SOURCE_TEXT_CHARS);
      if (trimmedText) {
        contents = {
          parts: [
            {
              text: `Here is the page text extracted from ${job.content}.\nOnly use this text to extract the recipe.\n\n${trimmedText}\n\n${RECIPE_JSON_SCHEMA_PROMPT}`
            }
          ]
        };
      } else {
        tools = [{ googleSearch: {} }];
        contents = {
          parts: [
            {
              text: `The file content provided is a URL to a recipe: ${job.content}.\n\nPlease use Google Search to visit this URL, read the recipe details from the page, and then ${RECIPE_JSON_SCHEMA_PROMPT}`
            }
          ]
        };
      }
    } else if (!recipe) {
      contents = {
        parts: [
          {
            text: `Here is the text content of a file:\n\n${job.content}\n\n${RECIPE_JSON_SCHEMA_PROMPT}`
          }
        ]
      };
    }

    if (!recipe) {
      const response = await this.client.models.generateContent({
        model: modelId,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: recipeSchema,
          systemInstruction: STRICT_SYSTEM_INSTRUCTION,
          temperature: 0,
          topK: 1,
          topP: 0.1,
          seed: 0,
          tools
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response from Gemini");
      }

      recipe = JSON.parse(text) as Recipe;
      recipe.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      recipe.method = Array.isArray(recipe.method) ? recipe.method : [];

      const filterSource = job.type === "text" ? job.content : sourceText;
      if (filterSource) {
        recipe.ingredients = filterBySource(recipe.ingredients, filterSource);
        recipe.method = filterBySource(recipe.method, filterSource);
      }

      mergeRecipeFallback(recipe, fallbackRecipe);
      if (!recipe.imageUrl && fallbackImageUrl) {
        recipe.imageUrl = fallbackImageUrl;
      }
    }

    if (!recipe) {
      throw new Error("Recipe extraction failed");
    }

    recipe.ingredients = recipe.ingredients.map((value) => value.trim()).filter(Boolean);
    recipe.method = recipe.method.map((value) => value.trim()).filter(Boolean);

    const fallbackSource = job.source || (job.type === "url" ? job.content : "");
    if (!recipe.source && fallbackSource) {
      recipe.source = fallbackSource;
    }

    let imageBytes = imagePayload?.bytes;
    let imageMimeType = imagePayload?.mimeType;

    if (!imageBytes && recipe.imageUrl) {
      const fetched = await fetchImageAsArrayBuffer(recipe.imageUrl);
      if (fetched) {
        imageBytes = fetched.data;
        imageMimeType = fetched.mimeType;
      }
    }

    if (!imageBytes && job.type === "url") {
      const ogImageUrl = await extractOgImageFromPage(job.content);
      if (ogImageUrl) {
        const fetched = await fetchImageAsArrayBuffer(ogImageUrl);
        if (fetched) {
          imageBytes = fetched.data;
          imageMimeType = fetched.mimeType;
        }
      }
    }

    return {
      recipe,
      imageBytes,
      imageMimeType
    };
  }
}