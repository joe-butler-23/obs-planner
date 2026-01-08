import { normalizePath, TFile, App } from "obsidian";
import { Recipe } from "../types";

export type HtmlExtraction = {
  recipe: Recipe | null;
  pageText: string;
  imageUrl?: string;
};

const NEWLINE_PATTERN = /\r?\n+/;
const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp)(\?|#|$)/i;
const OG_IMAGE_PROPERTY_FIRST = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"]+)["']/i;
const OG_IMAGE_CONTENT_FIRST = /<meta[^>]*content=["']([^"]+)["'][^>]*property=["']og:image["']/i;
const IMG_TAG_PATTERN = /<img[^>]*src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/gi;
const SRC_ATTR_PATTERN = /src=["']([^"']+)["']/i;

let lastFetchTime = 0;

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toStringList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toStringList);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = trimString((value as { text?: unknown }).text);
    return text ? [text] : [];
  }
  return [];
};

const splitSteps = (value: string) =>
  value
    .split(NEWLINE_PATTERN)
    .map((step) => step.trim())
    .filter(Boolean);

const toInstructionSteps = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toInstructionSteps);
  if (typeof value === "string") return splitSteps(value);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return splitSteps(obj.text);
    if (obj.itemListElement) return toInstructionSteps(obj.itemListElement);
  }
  return [];
};

const isRecipeType = (value: unknown) => {
  if (typeof value === "string") return value.toLowerCase() === "recipe";
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.toLowerCase() === "recipe");
  }
  return false;
};

const resolveUrl = (value: string, baseUrl: string) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const extractImageUrlFromJsonLd = (value: unknown, baseUrl: string): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return resolveUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrlFromJsonLd(item, baseUrl);
      if (found) return found;
    }
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === "string") return resolveUrl(obj.url, baseUrl);
    if (typeof obj["@id"] === "string") return resolveUrl(obj["@id"], baseUrl);
  }
  return undefined;
};

const parseHtml = (html: string): Document | null => {
  if (typeof DOMParser === "undefined") return null;
  return new DOMParser().parseFromString(html, "text/html");
};

const extractTitleFromDoc = (doc: Document) => {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  if (ogTitle) return ogTitle.trim();
  const h1 = doc.querySelector("h1")?.textContent;
  if (h1) return h1.trim();
  const title = doc.querySelector("title")?.textContent;
  return title ? title.trim() : "";
};

const extractOgImageFromDoc = (doc: Document, pageUrl: string) => {
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage) return resolveUrl(ogImage, pageUrl);
  return undefined;
};

const extractFirstImageFromDoc = (doc: Document, pageUrl: string) => {
  const images = Array.from(doc.querySelectorAll("img"));
  for (const img of images) {
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src");
    if (!src) continue;
    const normalized = src.toLowerCase();
    if (normalized.includes("logo") || normalized.includes("icon") || normalized.includes("avatar")) {
      continue;
    }
    if (!IMAGE_EXT_PATTERN.test(normalized)) continue;
    return resolveUrl(src, pageUrl);
  }
  return undefined;
};

const collectRecipesFromJsonLd = (value: unknown, depth: number = 0): Record<string, unknown>[] => {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecipesFromJsonLd(item, depth + 1));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (isRecipeType(obj["@type"])) return [obj];
    if (obj["@graph"]) return collectRecipesFromJsonLd(obj["@graph"], depth + 1);
    if (obj.mainEntity) return collectRecipesFromJsonLd(obj.mainEntity, depth + 1);
    if (obj.itemListElement) return collectRecipesFromJsonLd(obj.itemListElement, depth + 1);
  }
  return [];
};

const extractRecipeFromJsonLd = (doc: Document, pageUrl: string): Recipe | null => {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const recipes = collectRecipesFromJsonLd(parsed);
      if (recipes.length === 0) continue;
      const recipe = recipes[0] as Record<string, unknown>;
      const title = trimString(recipe.name);
      const ingredients = toStringList(recipe.recipeIngredient ?? recipe.ingredients);
      const method = toInstructionSteps(recipe.recipeInstructions ?? recipe.instructions);
      const imageUrl = extractImageUrlFromJsonLd(recipe.image, pageUrl);
      const prepTime = trimString(recipe.prepTime);
      const cookTime = trimString(recipe.cookTime);
      const servings = trimString(recipe.recipeYield ?? recipe.yield);

      return {
        title,
        source: "",
        imageUrl,
        ingredients,
        method,
        prepTime,
        cookTime,
        servings
      };
    } catch {
      continue;
    }
  }
  return null;
};

const extractRecipeFromWprm = (doc: Document): Recipe | null => {
  const container = doc.querySelector(".wprm-recipe-container");
  if (!container) return null;
  const title = container.querySelector(".wprm-recipe-name")?.textContent?.trim() ?? "";
  const ingredients = Array.from(
    container.querySelectorAll(".wprm-recipe-ingredient")
  )
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);
  const method = Array.from(container.querySelectorAll(".wprm-recipe-instruction"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);

  return {
    title,
    source: "",
    imageUrl: undefined,
    ingredients,
    method,
    prepTime: "",
    cookTime: "",
    servings: ""
  };
};

export const extractRecipeFromHtml = (html: string, pageUrl: string): HtmlExtraction | null => {
  const doc = parseHtml(html);
  if (!doc) return null;
  const pageText = doc.body?.textContent ?? "";

  const jsonLd = extractRecipeFromJsonLd(doc, pageUrl);
  const wprm = extractRecipeFromWprm(doc);

  const title =
    jsonLd?.title ||
    wprm?.title ||
    extractTitleFromDoc(doc) ||
    "";

  const ingredients =
    jsonLd?.ingredients?.length ? jsonLd.ingredients : wprm?.ingredients ?? [];
  const method = jsonLd?.method?.length ? jsonLd.method : wprm?.method ?? [];
  const imageUrl =
    jsonLd?.imageUrl ||
    wprm?.imageUrl ||
    extractOgImageFromDoc(doc, pageUrl) ||
    extractFirstImageFromDoc(doc, pageUrl);

  const recipe: Recipe = {
    title: title.trim(),
    source: "",
    imageUrl,
    ingredients,
    method,
    prepTime: jsonLd?.prepTime ?? "",
    cookTime: jsonLd?.cookTime ?? "",
    servings: jsonLd?.servings ?? ""
  };

  const hasAny = Boolean(recipe.title || recipe.ingredients.length || recipe.method.length);
  return {
    recipe: hasAny ? recipe : null,
    pageText,
    imageUrl
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await promise;
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutError);
    }
    throw error;
  }
};

const rateLimit = async () => {
  const MIN_DELAY_MS = 2000;
  const now = Date.now();
  const timeSinceLastFetch = now - lastFetchTime;

  if (timeSinceLastFetch < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLastFetch));
  }

  lastFetchTime = Date.now();
};

export const fetchHtmlFromPage = async (pageUrl: string): Promise<string | null> => {
  const corsProxies = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  const tryFetch = async (url: string) => {
    const controller = new AbortController();
    const response = await withTimeout(
      fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal
      }),
      30000, // 30 second timeout
      `Fetch timeout for ${url}`
    );

    if (!response.ok) return null;
    return await response.text();
  };

  for (const proxyFn of corsProxies) {
    try {
      await rateLimit();
      const proxyUrl = proxyFn(pageUrl);
      console.debug('[RecipeParser] Fetching HTML', {
        pageUrl,
        proxyUrl,
        timestamp: new Date().toISOString()
      });
      const html = await tryFetch(proxyUrl);
      if (html) return html;
    } catch (error) {
      console.debug('[RecipeParser] Fetch failed', {
        pageUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
  }

  return null;
};

export const fetchReadableTextFromPage = async (pageUrl: string): Promise<string | null> => {
  const jinaProxies = [
    (url: string) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`,
    (url: string) => `https://r.jina.ai/https://${url.replace(/^https?:\/\//, "")}`
  ];

  for (const proxyFn of jinaProxies) {
    try {
      const proxyUrl = proxyFn(pageUrl);
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;
      const text = await response.text();
      if (text.trim()) return text;
    } catch {
      continue;
    }
  }

  return null;
};

export const extractOgImageFromHtml = (html: string, pageUrl: string): string | null => {
  const doc = parseHtml(html);
  if (doc) {
    return (
      extractOgImageFromDoc(doc, pageUrl) ??
      extractFirstImageFromDoc(doc, pageUrl) ??
      null
    );
  }

  const ogImageMatch =
    html.match(OG_IMAGE_PROPERTY_FIRST) ||
    html.match(OG_IMAGE_CONTENT_FIRST);
  if (ogImageMatch?.[1]) {
    return resolveUrl(ogImageMatch[1], pageUrl);
  }

  const imgMatches = html.match(IMG_TAG_PATTERN);
  if (imgMatches?.length) {
    for (const imgTag of imgMatches) {
      const srcMatch = imgTag.match(SRC_ATTR_PATTERN);
      if (
        srcMatch?.[1] &&
        !srcMatch[1].includes("logo") &&
        !srcMatch[1].includes("icon") &&
        !srcMatch[1].includes("avatar")
      ) {
        return resolveUrl(srcMatch[1], pageUrl);
      }
    }
  }

  return null;
};

export const extractOgImageFromPage = async (pageUrl: string): Promise<string | null> => {
  const html = await fetchHtmlFromPage(pageUrl);
  if (!html) return null;
  return extractOgImageFromHtml(html, pageUrl);
};

export const fetchImageAsArrayBuffer = async (
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
    const controller = new AbortController();
    const response = await withTimeout(
      fetch(url, {
        headers: { Accept: "image/*" },
        signal: controller.signal
      }),
      60000, // 60 second timeout for images
      `Image fetch timeout for ${url}`
    );

    if (!response.ok) return null;
    const blob = await response.blob();
    const contentType = response.headers.get("content-type") || blob.type || "";
    const isImage =
      contentType.startsWith("image/") ||
      contentType.includes("webp") ||
      contentType.includes("jpeg") ||
      contentType.includes("png");

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    if (!isImage || blob.size < 1024 || blob.size > MAX_IMAGE_SIZE) {
      if (blob.size > MAX_IMAGE_SIZE) {
        console.warn('[RecipeParser] Image too large, skipping', {
          url,
          sizeMB: (blob.size / 1024 / 1024).toFixed(2)
        });
      }
      return null;
    }

    return { data: await blob.arrayBuffer(), mimeType: blob.type || "image/webp" };
  };

  try {
    await rateLimit();
    console.debug('[RecipeParser] Fetching image', {
      imageUrl,
      timestamp: new Date().toISOString()
    });
    const direct = await tryFetch(imageUrl);
    if (direct) return direct;
  } catch (error) {
    console.debug('[RecipeParser] Direct image fetch failed', {
      imageUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  for (const proxyFn of imageProxies) {
    try {
      await rateLimit();
      const proxyUrl = proxyFn(imageUrl);
      console.debug('[RecipeParser] Trying image proxy', {
        imageUrl,
        proxyUrl
      });
      const proxied = await tryFetch(proxyUrl);
      if (proxied) return proxied;
    } catch (error) {
      console.debug('[RecipeParser] Proxy image fetch failed', {
        imageUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
  }

  return null;
};

export const mergeRecipeFallback = (target: Recipe, fallback: Recipe | null) => {
  if (!fallback) return;
  if (!target.title && fallback.title) target.title = fallback.title;
  if (!target.prepTime && fallback.prepTime) target.prepTime = fallback.prepTime;
  if (!target.cookTime && fallback.cookTime) target.cookTime = fallback.cookTime;
  if (!target.servings && fallback.servings) target.servings = fallback.servings;
  if (!target.imageUrl && fallback.imageUrl) target.imageUrl = fallback.imageUrl;
  if (target.ingredients.length === 0 && fallback.ingredients.length > 0) {
    target.ingredients = fallback.ingredients;
  }
  if (target.method.length === 0 && fallback.method.length > 0) {
    target.method = fallback.method;
  }
};