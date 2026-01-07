import { normalizePath, TFile, App } from "obsidian";
import { Recipe } from "../types";

export type HtmlExtraction = {
  recipe: Recipe | null;
  pageText: string;
  imageUrl?: string;
};

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
    .split(/\r?\n+/) // Corrected: escaped backslash for regex
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
    if (!/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(normalized)) continue; // Corrected: escaped backslash for regex
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

export const fetchHtmlFromPage = async (pageUrl: string): Promise<string | null> => {
  const corsProxies = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  const tryFetch = async (url: string) => {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) return null;
    return await response.text();
  };

  for (const proxyFn of corsProxies) {
    try {
      const proxyUrl = proxyFn(pageUrl);
      const html = await tryFetch(proxyUrl);
      if (html) return html;
    } catch {
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
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"]+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"]+)["'][^>]*property=["']og:image["']/i);
  if (ogImageMatch?.[1]) {
    return resolveUrl(ogImageMatch[1], pageUrl);
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