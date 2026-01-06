import { GoogleGenAI, Schema, Tool, Type } from "@google/genai";
import { InboxJob } from "./InboxWatcher";
import { ProcessedRecipe, Recipe } from "../types";

export type GeminiImagePayload = {
  bytes: ArrayBuffer;
  mimeType: string;
};

const RECIPE_JSON_SCHEMA_PROMPT = `
  Extract the recipe from the provided file. 
  Return the output strictly as a JSON object with the following schema:
  {
    "title": "string (the recipe name)",
    "source": "string (original source URL, website name, or cookbook name if identifiable)",
    "imageUrl": "string (IMPORTANT: the URL of the main hero/featured recipe photo - must be a full valid URL to an actual image file ending in .jpg, .jpeg, .png, or .webp. Look for the largest, most prominent food photo on the page, typically in the hero section or at the top of the recipe.)",
    "ingredients": ["string", "string"],
    "method": ["string", "string (numbered steps for cooking)"],
    "prepTime": "string (optional)",
    "cookTime": "string (optional)",
    "servings": "string (optional)"
  }
  
  Important notes:
  - Use "method" for cooking steps, not "instructions"
  - Ingredients should be formatted as "quantity unit ingredient" (e.g., "2 cups flour")
  - Method steps should be clear and numbered in the array
  - For imageUrl: Find the CURRENT main recipe image URL from the page's HTML. Look for <img> tags with src attributes containing the recipe photo, or og:image meta tags. The URL should be complete and currently valid.
  - If information is missing, use empty strings or empty arrays
  - Do not add markdown formatting like \`\`\`json
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

const extractOgImageFromPage = async (pageUrl: string): Promise<string | null> => {
  const corsProxies = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const proxyFn of corsProxies) {
    try {
      const proxyUrl = proxyFn(pageUrl);
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;

      const html = await response.text();
      const ogImageMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

      if (ogImageMatch?.[1]) {
        return ogImageMatch[1];
      }

      const imgMatches = html.match(/<img[^>]*src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/gi);
      if (imgMatches?.length) {
        for (const imgTag of imgMatches) {
          const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
          if (
            srcMatch?.[1] &&
            !srcMatch[1].includes("logo") &&
            !srcMatch[1].includes("icon") &&
            !srcMatch[1].includes("avatar")
          ) {
            return srcMatch[1];
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

const fetchImageAsArrayBuffer = async (
  imageUrl: string
): Promise<{ data: ArrayBuffer; mimeType: string } | null> => {
  if (!imageUrl || imageUrl.trim() === "") return null;

  const imageProxies = [
    (url: string) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp&q=85`,
    (url: string) => `https://cdn.statically.io/img/${url.replace(/^https?:\/\//, "")}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  const tryFetch = async (url: string) => {
    const response = await fetch(url, { headers: { Accept: "image/*" } });
    if (!response.ok) return null;
    const blob = await response.blob();
    const contentType = response.headers.get("content-type") || blob.type || "";
    const isImage =
      contentType.startsWith("image/") ||
      contentType.includes("webp") ||
      contentType.includes("jpeg") ||
      contentType.includes("png");

    if (!isImage || blob.size < 1024) return null;
    return { data: await blob.arrayBuffer(), mimeType: blob.type || "image/webp" };
  };

  try {
    const direct = await tryFetch(imageUrl);
    if (direct) return direct;
  } catch {
    // Fall through to proxies
  }

  for (const proxyFn of imageProxies) {
    try {
      const proxied = await tryFetch(proxyFn(imageUrl));
      if (proxied) return proxied;
    } catch {
      continue;
    }
  }

  return null;
};

const toBase64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private clientKey: string | null = null;

  constructor(private readonly getApiKey: () => string) {}

  async process(job: InboxJob, imagePayload?: GeminiImagePayload): Promise<ProcessedRecipe> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is missing");
    }

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientKey = apiKey;
    }

    const modelId = "gemini-2.0-flash";
    let contents: any;
    let tools: Tool[] | undefined = undefined;

    if (job.type === "image") {
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
    } else if (job.type === "url") {
      tools = [{ googleSearch: {} }];
      contents = {
        parts: [
          {
            text: `The file content provided is a URL to a recipe: ${job.content}.\n\nPlease use Google Search to visit this URL, read the recipe details from the page, and then ${RECIPE_JSON_SCHEMA_PROMPT}`
          }
        ]
      };
    } else {
      contents = {
        parts: [
          {
            text: `Here is the text content of a file:\n\n${job.content}\n\n${RECIPE_JSON_SCHEMA_PROMPT}`
          }
        ]
      };
    }

    const response = await this.client.models.generateContent({
      model: modelId,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
        tools
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    const recipe = JSON.parse(text) as Recipe;
    recipe.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    recipe.method = Array.isArray(recipe.method) ? recipe.method : [];

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
