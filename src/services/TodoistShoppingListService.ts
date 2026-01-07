import { App, Modal, Notice, TFile, moment } from "obsidian";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import CookingAssistantPlugin from "../main";

const execFileAsync = promisify(execFile);
const ModalBase = (Modal ?? class {}) as typeof Modal;

const SHOPPING_PROJECT_ID = "2353762598";
const DEFAULT_LABEL = "tinned-jarred-dried";
const BRIDGE_CLUB_PROJECT_MATCH = "bridge club";
const SESSION_LOG_PATH = path.join(
  os.homedir(),
  "projects",
  "sys-arc",
  "resources",
  "todoist-session.json"
);
const PREVIEW_LOG_PATH = path.join(
  os.homedir(),
  "projects",
  "sys-arc",
  "resources",
  "todoist-preview.md"
);
const SHOPPING_IGNORE_LIST = ["water", "salt", "pepper"];

type RecipeSource = {
  path: string;
  title: string;
  content: string;
  scheduledDate: string | null;
};

type IngredientRecipeSource = {
  path: string;
  title: string;
  ingredients: string[];
};

type ShoppingItem = {
  content: string;
  labels: string[];
  sources: string[];
};

type GeminiShoppingItem = {
  content: string;
  label: string;
};

type BridgeClubTask = {
  content: string;
  dueDate: string;
};

type ParsedIngredient = {
  displayName: string;
  quantity: number | null;
  unit: "g" | "ml" | "count" | null;
  countUnit: string | null;
};

type AggregatedItem = {
  displayName: string;
  quantity: number | null;
  unit: "g" | "ml" | "count" | null;
  countUnit: string | null;
  sources: Set<string>;
};

type TodoistTaskPayload = {
  content: string;
  labels?: string[];
  due_date?: string;
  section_id?: string;
};

type ConfirmSummary = {
  weekLabel: string;
  recipeCount: number;
  itemCount: number;
  baselineCount: number;
  bridgeClubCount: number;
  bridgeClubPlanned: number;
};

type TodoistAction = "send" | "preview" | "cancel";

const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb"
};

const LABEL_RULES: Array<{ label: string; keywords: string[] }> = [
  {
    label: "fruit-and-veg",
    keywords: [
      "onion",
      "garlic",
      "tomato",
      "potato",
      "carrot",
      "pepper",
      "capsicum",
      "lemon",
      "lime",
      "apple",
      "banana",
      "lettuce",
      "spinach",
      "kale",
      "mushroom",
      "aubergine",
      "eggplant",
      "courgette",
      "zucchini",
      "cabbage",
      "brussels sprout",
      "brussels sprouts",
      "broccoli",
      "cauliflower",
      "herb",
      "parsley",
      "basil",
      "coriander",
      "cilantro",
      "mint",
      "dill",
      "sage",
      "thyme",
      "rosemary",
      "ginger",
      "chilli",
      "chili",
      "spring onion",
      "scallion",
      "shallot",
      "leek",
      "celery",
      "orange"
    ]
  },
  {
    label: "dairy",
    keywords: [
      "milk",
      "cheese",
      "yogurt",
      "yoghurt",
      "cream",
      "butter",
      "parmesan",
      "mozzarella",
      "cheddar",
      "feta",
      "egg",
      "eggs"
    ]
  },
  {
    label: "meat-and-fish",
    keywords: [
      "chicken",
      "beef",
      "pork",
      "lamb",
      "fish",
      "salmon",
      "tuna",
      "anchovy",
      "anchovies",
      "shrimp",
      "prawn",
      "prawns",
      "bacon",
      "ham"
    ]
  },
  {
    label: "bakery",
    keywords: [
      "bread",
      "bun",
      "bagel",
      "tortilla",
      "pita",
      "pastry",
      "roll",
      "croissant",
      "brioche"
    ]
  },
  {
    label: "baking",
    keywords: [
      "flour",
      "sugar",
      "baking powder",
      "baking soda",
      "yeast",
      "cocoa",
      "vanilla"
    ]
  },
  {
    label: "drinks",
    keywords: ["wine", "beer", "cider", "vodka", "gin", "rum"]
  },
  {
    label: "frozen",
    keywords: ["frozen", "ice cream"]
  },
  {
    label: "household",
    keywords: ["paper", "soap", "detergent", "bleach", "cleaner", "sponge"]
  },
  {
    label: "toiletries",
    keywords: ["shampoo", "toothpaste", "deodorant", "razor"]
  },
  {
    label: "tinned-jarred-dried",
    keywords: [
      "beans",
      "lentils",
      "chickpeas",
      "rice",
      "pasta",
      "oil",
      "vinegar",
      "salt",
      "pepper",
      "spice",
      "spices",
      "stock",
      "tomato paste",
      "tinned",
      "canned",
      "can"
    ]
  }
];

const ALLOWED_LABELS = Array.from(
  new Set([...LABEL_RULES.map((rule) => rule.label), DEFAULT_LABEL])
);

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeScheduledDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = moment(trimmed);
  if (!parsed.isValid()) return null;
  return parsed.format("YYYY-MM-DD");
};

const PREP_PHRASES = [
  "good-quality",
  "good quality",
  "quality",
  "fresh",
  "freshly",
  "finely",
  "roughly",
  "thinly",
  "thickly",
  "chopped",
  "choppeds",
  "minced",
  "minceds",
  "sliced",
  "diced",
  "grated",
  "peeled",
  "crushed",
  "ground",
  "shredded",
  "julienned",
  "halved",
  "quartered",
  "trimmed",
  "rinsed",
  "drained",
  "optional",
  "to taste"
];

const WATER_DESCRIPTORS = new Set([
  "cold",
  "warm",
  "hot",
  "boiling",
  "ice",
  "iced",
  "filtered",
  "tap",
  "still",
  "sparkling"
]);

const INGREDIENT_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bvegetable\s+stock\b/i, replacement: "veg stock" },
  { pattern: /\bvegetable\s+broth\b/i, replacement: "veg stock" },
  { pattern: /\bveg(?:etable)?\s+stock\b/i, replacement: "veg stock" },
  { pattern: /\bparmesan\s+cheese\b/i, replacement: "parmesan" },
  { pattern: /\bfeta\s+cheese\b/i, replacement: "feta" }
];

const COUNT_UNIT_ALIASES: Record<string, string> = {
  clove: "clove",
  cloves: "clove",
  sprig: "sprig",
  sprigs: "sprig",
  bunch: "bunch",
  bunches: "bunch",
  stalk: "stalk",
  stalks: "stalk",
  stick: "stick",
  sticks: "stick",
  can: "can",
  cans: "can",
  tin: "tin",
  tins: "tin",
  jar: "jar",
  jars: "jar",
  pack: "pack",
  packs: "pack",
  bag: "bag",
  bags: "bag",
  piece: "piece",
  pieces: "piece",
  slice: "slice",
  slices: "slice",
  leaf: "leaf",
  leaves: "leaf"
};

const LABEL_OVERRIDES: Record<string, string> = {
  "butter bean": "tinned-jarred-dried",
  "butter beans": "tinned-jarred-dried",
  "brussels sprout": "fruit-and-veg",
  "brussels sprouts": "fruit-and-veg"
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "with",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "from",
  "by",
  "plus",
  "into",
  "over",
  "under",
  "between",
  "without",
  "as"
]);

export const parseIngredientsSection = (markdown: string): string[] => {
  const lines = markdown.split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      if (inSection) break;
      if (/^##\s+Ingredients\b/i.test(line)) {
        inSection = true;
      }
      continue;
    }
    if (!inSection) continue;
    if (!line) continue;

    const cleaned = line
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    if (cleaned) items.push(cleaned);
  }

  return items;
};

type GeminiShoppingContentParts = {
  content: string;
  ingredient: string;
};

const normalizeIgnoreValue = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export const parseGeminiShoppingContent = (value: string): GeminiShoppingContentParts => {
  const content = normalizeSpaces(value.trim().toLowerCase());
  if (!content) {
    throw new Error("Gemini shopping content is empty");
  }

  const parts = content.split(" - ");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error("Gemini shopping content has invalid format");
  }

  const ingredient = parts[0]?.trim();
  const recipePart = parts[parts.length - 1]?.trim();
  const quantity = parts.length === 3 ? parts[1]?.trim() : null;

  if (!ingredient) {
    throw new Error("Gemini shopping content missing ingredient");
  }
  if (quantity !== null && !quantity) {
    throw new Error("Gemini shopping content missing quantity");
  }
  if (!recipePart || !recipePart.startsWith("[") || !recipePart.endsWith("]")) {
    throw new Error("Gemini shopping content missing recipe list");
  }

  return { content, ingredient };
};

export const buildShoppingItemsFromGemini = (
  items: GeminiShoppingItem[],
  ignoreList: string[] = SHOPPING_IGNORE_LIST
): ShoppingItem[] => {
  const allowedLabels = new Set(ALLOWED_LABELS);
  const ignoreSet = new Set(ignoreList.map(normalizeIgnoreValue));
  const seen = new Set<string>();
  const shoppingItems: ShoppingItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new Error("Gemini shopping item is invalid");
    }
    const label = String(item.label ?? "").trim().toLowerCase();
    if (!label || !allowedLabels.has(label)) {
      throw new Error(`Gemini shopping item has unsupported label: ${item.label}`);
    }

    const parsed = parseGeminiShoppingContent(String(item.content ?? ""));
    if (ignoreSet.has(normalizeIgnoreValue(parsed.ingredient))) {
      continue;
    }

    if (seen.has(parsed.content)) {
      continue;
    }
    seen.add(parsed.content);

    shoppingItems.push({
      content: parsed.content,
      labels: [label],
      sources: []
    });
  }

  return shoppingItems;
};

const buildBridgeClubTasks = (recipes: RecipeSource[]): BridgeClubTask[] => {
  const tasks: BridgeClubTask[] = [];
  const seen = new Set<string>();

  for (const recipe of recipes) {
    if (!recipe.scheduledDate) continue;
    const content = `🍽️ - ${recipe.title}`;
    const key = `${content.toLowerCase()}|${recipe.scheduledDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      content,
      dueDate: recipe.scheduledDate
    });
  }

  return tasks;
};

const getTaskDueDate = (task: { due?: { date?: string | null; datetime?: string | null } }) => {
  const due = task.due;
  if (!due) return null;
  if (due.date) return due.date;
  if (due.datetime) return due.datetime.slice(0, 10);
  return null;
};

const parseNumberToken = (token: string): number | null => {
  if (/^\d+\/\d+$/.test(token)) {
    const [num, den] = token.split("/");
    const n = Number(num);
    const d = Number(den);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return n / d;
  }
  if (/^\d+(\.\d+)?$/.test(token)) {
    const parsed = Number(token);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseQuantity = (tokens: string[]): { quantity: number | null; consumed: number } => {
  if (tokens.length === 0) return { quantity: null, consumed: 0 };
  const first = tokens[0];
  const attachedMatch = first.match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/);
  if (attachedMatch) {
    const qty = parseNumberToken(attachedMatch[1]);
    if (qty !== null) {
      return { quantity: qty, consumed: 1 };
    }
  }

  const base = parseNumberToken(first);
  if (base === null) return { quantity: null, consumed: 0 };

  if (tokens.length > 1) {
    const fractional = parseNumberToken(tokens[1]);
    if (fractional !== null && Number.isInteger(base)) {
      return { quantity: base + fractional, consumed: 2 };
    }
  }
  return { quantity: base, consumed: 1 };
};

const normalizeUnitToken = (token: string | undefined): string | null => {
  if (!token) return null;
  const cleaned = token.toLowerCase().replace(/[.,]/g, "");
  return UNIT_ALIASES[cleaned] ?? null;
};

const normalizeCountUnitToken = (token: string | undefined): string | null => {
  if (!token) return null;
  const cleaned = token.toLowerCase().replace(/[.,]/g, "");
  return COUNT_UNIT_ALIASES[cleaned] ?? null;
};

const sanitizeIngredientName = (value: string): string => {
  let cleaned = value;

  cleaned = cleaned.replace(/\(.*?\)/g, "");
  cleaned = cleaned.split(/[,;].*/)[0] ?? cleaned;

  for (const phrase of PREP_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned.replace(/\b(of|and|with)\b\s*$/i, "");
  cleaned = normalizeSpaces(cleaned.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ""));

  for (const alias of INGREDIENT_ALIASES) {
    if (alias.pattern.test(cleaned)) {
      cleaned = cleaned.replace(alias.pattern, alias.replacement);
      break;
    }
  }

  return normalizeSpaces(cleaned).toLowerCase();
};

const abbreviateRecipeTitle = (title: string): string => {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const filtered = words.filter((word) => !STOP_WORDS.has(word));
  const selected = (filtered.length > 0 ? filtered : words).slice(0, 3);
  return selected.join(" ");
};

const convertToMetric = (
  quantity: number,
  unit: string | null
): { quantity: number; unit: "g" | "ml" | "count" } => {
  if (!unit) return { quantity, unit: "count" };
  switch (unit) {
    case "kg":
      return { quantity: quantity * 1000, unit: "g" };
    case "g":
      return { quantity, unit: "g" };
    case "l":
      return { quantity: quantity * 1000, unit: "ml" };
    case "ml":
      return { quantity, unit: "ml" };
    case "tsp":
      return { quantity: quantity * 5, unit: "ml" };
    case "tbsp":
      return { quantity: quantity * 15, unit: "ml" };
    case "cup":
      return { quantity: quantity * 240, unit: "ml" };
    case "oz":
      return { quantity: quantity * 28.3495, unit: "g" };
    case "lb":
      return { quantity: quantity * 453.592, unit: "g" };
    default:
      return { quantity, unit: "count" };
  }
};

const normalizeNameForKey = (name: string): string => {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(optional|to taste)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.endsWith("s") && !cleaned.endsWith("ss")) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
};

const pluralize = (name: string, quantity: number): string => {
  if (quantity === 1) return name;
  const lower = name.toLowerCase();
  if (lower.endsWith("s")) return name;
  return `${name}s`;
};

const formatMetricQuantity = (
  quantity: number,
  unit: "g" | "ml" | "count"
): string => {
  if (unit === "count") {
    const rounded = Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(2));
    return `${rounded}`;
  }
  if (unit === "g" && quantity >= 1000) {
    const kg = quantity / 1000;
    const rounded = Number.isInteger(kg) ? kg : Number(kg.toFixed(2));
    return `${rounded}kg`;
  }
  if (unit === "ml" && quantity >= 1000) {
    const litres = quantity / 1000;
    const rounded = Number.isInteger(litres) ? litres : Number(litres.toFixed(2));
    return `${rounded}l`;
  }
  const rounded = Math.round(quantity);
  return `${rounded}${unit}`;
};

const formatCountQuantity = (quantity: number, unit: string | null): string => {
  const rounded = Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(2));
  if (!unit) return `${rounded}`;
  const resolvedUnit = rounded === 1 ? unit : `${unit}s`;
  return `${rounded} ${resolvedUnit}`;
};

export const labelForIngredient = (name: string): string => {
  const normalized = normalizeNameForKey(name);
  const override = LABEL_OVERRIDES[normalized];
  if (override) return override;
  for (const rule of LABEL_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.label;
    }
  }
  return DEFAULT_LABEL;
};

const isWaterIngredient = (name: string): boolean => {
  const normalized = normalizeNameForKey(name);
  if (!normalized.includes("water")) return false;
  if (normalized === "water") return true;
  const words = normalized.split(" ").filter(Boolean);
  const filtered = words.filter((word) => word !== "water" && !WATER_DESCRIPTORS.has(word));
  return filtered.length === 0;
};

export const parseIngredientLine = (line: string): ParsedIngredient | null => {
  const cleaned = normalizeSpaces(line.replace(/^[-*+]\s+/, ""));
  if (!cleaned) return null;

  const tokens = cleaned.split(" ");
  const { quantity, consumed } = parseQuantity(tokens);
  if (quantity === null) {
    const sanitizedName = sanitizeIngredientName(cleaned);
    if (!sanitizedName) return null;
    if (isWaterIngredient(sanitizedName)) return null;
    return {
      displayName: sanitizedName,
      quantity: null,
      unit: null,
      countUnit: null
    };
  }

  let unitToken: string | null = null;
  let countUnit: string | null = null;
  let nameStart = consumed;
  let consumedUnit = false;

  if (consumed === 1) {
    const attachedMatch = tokens[0].match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/);
    if (attachedMatch) {
      unitToken = normalizeUnitToken(attachedMatch[2]);
      if (!unitToken) {
        countUnit = normalizeCountUnitToken(attachedMatch[2]);
      }
      nameStart = 1;
      consumedUnit = Boolean(unitToken || countUnit);
    }
  }

  if (!consumedUnit) {
    unitToken = normalizeUnitToken(tokens[consumed]);
    if (unitToken) {
      nameStart = consumed + 1;
    } else {
      countUnit = normalizeCountUnitToken(tokens[consumed]);
      if (countUnit) {
        nameStart = consumed + 1;
      }
    }
  }

  if (tokens[nameStart]?.toLowerCase() === "of") {
    nameStart += 1;
  }

  const name = normalizeSpaces(tokens.slice(nameStart).join(" "));
  const sanitizedName = sanitizeIngredientName(name);
  if (!sanitizedName) return null;
  if (isWaterIngredient(sanitizedName)) return null;

  const metric = convertToMetric(quantity, unitToken);
  return {
    displayName: sanitizedName,
    quantity: metric.quantity,
    unit: unitToken ? metric.unit : "count",
    countUnit
  };
};

const createRecipeLabel = (titles: string[]) => {
  const abbreviated = titles.map(abbreviateRecipeTitle).filter(Boolean);
  if (abbreviated.length === 0) return "";
  return `[${abbreviated.join(", ")}]`;
};

const aggregateIngredients = (recipes: IngredientRecipeSource[]): AggregatedItem[] => {
  const aggregated = new Map<string, AggregatedItem>();

  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const parsed = parseIngredientLine(line);
      if (!parsed) continue;

      const keyName = normalizeNameForKey(parsed.displayName);
      const keySuffix =
        parsed.quantity === null || parsed.unit === null
          ? "none"
          : parsed.unit === "count"
            ? `count:${parsed.countUnit ?? "count"}`
            : parsed.unit;
      const key = `${keyName}|${keySuffix}`;

      if (parsed.quantity === null || parsed.unit === null) {
        if (!aggregated.has(key)) {
          aggregated.set(key, {
            displayName: parsed.displayName,
            quantity: null,
            unit: null,
            countUnit: null,
            sources: new Set([recipe.title])
          });
        } else {
          aggregated.get(key)?.sources.add(recipe.title);
        }
        continue;
      }

      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity = (existing.quantity ?? 0) + parsed.quantity;
        existing.sources.add(recipe.title);
      } else {
        aggregated.set(key, {
          displayName: parsed.displayName,
          quantity: parsed.quantity,
          unit: parsed.unit,
          countUnit: parsed.countUnit,
          sources: new Set([recipe.title])
        });
      }
    }
  }

  return Array.from(aggregated.values());
};

const buildShoppingItemsFromAggregates = (
  aggregated: AggregatedItem[],
  labels: string[]
): ShoppingItem[] => {
  if (labels.length !== aggregated.length) {
    throw new Error("Label count mismatch for shopping items.");
  }

  const items: ShoppingItem[] = [];
  for (const [index, entry] of aggregated.entries()) {
    const label = labels[index] ?? DEFAULT_LABEL;
    const recipeList = Array.from(entry.sources);
    const recipeLabel = createRecipeLabel(recipeList);

    if (entry.quantity === null || entry.unit === null) {
      const content = recipeLabel ? `${entry.displayName} - ${recipeLabel}` : entry.displayName;
      items.push({
        content,
        labels: [label],
        sources: Array.from(entry.sources)
      });
      continue;
    }

    const formattedQty =
      entry.unit === "count"
        ? formatCountQuantity(entry.quantity, entry.countUnit)
        : formatMetricQuantity(entry.quantity, entry.unit);
    const name =
      entry.unit === "count"
        ? entry.countUnit
          ? entry.displayName
          : pluralize(entry.displayName, entry.quantity)
        : entry.displayName;
    const baseContent = `${name} - ${formattedQty}`.trim();
    const content = recipeLabel ? `${baseContent} - ${recipeLabel}` : baseContent;
    items.push({
      content,
      labels: [label],
      sources: Array.from(entry.sources)
    });
  }

  return items;
};

export const buildShoppingItems = (recipes: IngredientRecipeSource[]): ShoppingItem[] => {
  const aggregated = aggregateIngredients(recipes);
  const labels = aggregated.map((entry) => labelForIngredient(entry.displayName));
  return buildShoppingItemsFromAggregates(aggregated, labels);
};

class TodoistConfirmModal extends ModalBase {
  private resolved = false;

  constructor(
    app: App,
    private summary: ConfirmSummary,
    private onConfirm: (action: TodoistAction) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Send shopping list to Todoist?" });
    const summary = contentEl.createEl("div");
    summary.createEl("p", {
      text: `Week: ${this.summary.weekLabel}`
    });
    summary.createEl("p", {
      text: `Recipes: ${this.summary.recipeCount}, Items: ${this.summary.itemCount}`
    });
    summary.createEl("p", {
      text: `Current Todoist items: ${this.summary.baselineCount}`
    });
    summary.createEl("p", {
      text: `Bridge club items: ${this.summary.bridgeClubCount}, New meals: ${this.summary.bridgeClubPlanned}`
    });

    const actions = contentEl.createEl("div", { cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    const preview = actions.createEl("button", { text: "Preview only" });
    const confirm = actions.createEl("button", { text: "Send to Todoist" });

    cancel.addEventListener("click", () => {
      this.resolve("cancel");
      this.close();
    });
    preview.addEventListener("click", () => {
      this.resolve("preview");
      this.close();
    });
    confirm.addEventListener("click", () => {
      this.resolve("send");
      this.close();
    });
  }

  onClose() {
    this.resolve("cancel");
  }

  private resolve(value: TodoistAction) {
    if (this.resolved) return;
    this.resolved = true;
    this.onConfirm(value);
  }
}

export class TodoistShoppingListService {
  constructor(private app: App, private plugin: CookingAssistantPlugin) {}

  async sendShoppingList(payload: { recipePaths: string[]; weekLabel: string }) {
    const ledgerKey = this.createLedgerKey(payload.weekLabel);
    if (!payload.recipePaths.length) {
      new Notice("No scheduled recipes found for this week.");
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: no scheduled recipes for ${payload.weekLabel}`
      );
      return;
    }

    const recipes = await this.loadRecipes(payload.recipePaths);
    if (recipes.length === 0) {
      new Notice("No scheduled recipes found for this week.");
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: no scheduled recipes for ${payload.weekLabel}`
      );
      return;
    }

    let items: ShoppingItem[] = [];
    if (this.plugin.settings.todoistLabelerMode === "gemini") {
      try {
        items = await this.buildShoppingItemsWithGemini(recipes);
      } catch (error) {
        new Notice("Gemini shopping list failed. Check Gemini key and logs.");
        this.plugin.recordLedgerEntry(
          "error",
          ledgerKey,
          `todoist: gemini list failed (${this.formatError(error)})`
        );
        console.error("Gemini shopping list failed", error);
        return;
      }
      if (items.length === 0) {
        new Notice("Gemini returned no shopping list items.");
        this.plugin.recordLedgerEntry(
          "skipped",
          ledgerKey,
          `todoist: gemini returned no items for ${payload.weekLabel}`
        );
        return;
      }
    } else {
      const ingredientRecipes: IngredientRecipeSource[] = recipes.map((recipe) => ({
        path: recipe.path,
        title: recipe.title,
        ingredients: parseIngredientsSection(recipe.content)
      }));
      const aggregated = aggregateIngredients(ingredientRecipes);
      if (aggregated.length === 0) {
        new Notice("No ingredients found in scheduled recipes.");
        this.plugin.recordLedgerEntry(
          "skipped",
          ledgerKey,
          `todoist: no ingredients found for ${payload.weekLabel}`
        );
        return;
      }
      const labels = aggregated.map((entry) => labelForIngredient(entry.displayName));
      try {
        items = buildShoppingItemsFromAggregates(aggregated, labels);
      } catch (error) {
        new Notice("Shopping list labelling failed. Check logs.");
        this.plugin.recordLedgerEntry(
          "error",
          ledgerKey,
          `todoist: labeler mismatch (${this.formatError(error)})`
        );
        console.error("Shopping list labelling failed", error);
        return;
      }
    }

    let bridgeClubProjectId: string | null = null;
    let bridgeClubProjectName = "Bridge club";
    let bridgeClubBaseline = 0;
    let bridgeClubTasks: BridgeClubTask[] = [];
    try {
      const bridgeProject = await this.resolveBridgeClubProject();
      bridgeClubProjectId = bridgeProject.id;
      bridgeClubProjectName = bridgeProject.name;
      const existingBridgeTasks = await this.listTodoistTasks(bridgeClubProjectId);
      bridgeClubBaseline = existingBridgeTasks.length;
      const desiredBridgeTasks = buildBridgeClubTasks(recipes);
      const existingKeys = new Set(
        existingBridgeTasks
          .map((task) => {
            const dueDate = getTaskDueDate(task);
            if (!dueDate || !task.content) return null;
            return `${task.content.toLowerCase()}|${dueDate}`;
          })
          .filter(Boolean) as string[]
      );
      bridgeClubTasks = desiredBridgeTasks.filter((task) => {
        const key = `${task.content.toLowerCase()}|${task.dueDate}`;
        return !existingKeys.has(key);
      });
    } catch (error) {
      new Notice("Bridge club sync failed. Check Todoist token and logs.");
      this.plugin.recordLedgerEntry(
        "error",
        ledgerKey,
        `todoist: bridge club failed (${this.formatError(error)})`
      );
      console.error("Bridge club sync failed", error);
      return;
    }

    let baselineCount = 0;
    try {
      const current = await this.listTodoistTasks();
      baselineCount = current.length;
    } catch (error) {
      new Notice("Todoist list failed. Check TODOIST_TOKEN.");
      this.plugin.recordLedgerEntry(
        "error",
        ledgerKey,
        `todoist: list failed (${this.formatError(error)})`
      );
      console.error("Todoist list failed", error);
      return;
    }

    const action = await this.confirmSend({
      weekLabel: payload.weekLabel,
      recipeCount: recipes.length,
      itemCount: items.length,
      baselineCount,
      bridgeClubCount: bridgeClubBaseline,
      bridgeClubPlanned: bridgeClubTasks.length
    });
    if (action === "preview") {
      await this.writePreview(items, payload.weekLabel, bridgeClubTasks, bridgeClubProjectName);
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: preview saved for ${payload.weekLabel}`
      );
      new Notice(`Preview saved to ${PREVIEW_LOG_PATH}`);
      return;
    }
    if (action !== "send") {
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: cancelled for ${payload.weekLabel}`
      );
      return;
    }

    let bridgeClubCreated: Array<{ id: string; content: string; due?: { date?: string } }> = [];
    if (bridgeClubProjectId && bridgeClubTasks.length > 0) {
      try {
        bridgeClubCreated = await this.createBridgeClubTasks(
          bridgeClubTasks,
          bridgeClubProjectId
        );
      } catch (error) {
        new Notice("Bridge club create failed. Check token and logs.");
        this.plugin.recordLedgerEntry(
          "error",
          ledgerKey,
          `todoist: bridge club create failed (${this.formatError(error)})`
        );
        console.error("Bridge club create failed", error);
        return;
      }
    }

    let created: Array<{ id: string; content: string; labels: string[] }> = [];
    try {
      created = await this.createTodoistTasks(items);
    } catch (error) {
      new Notice("Todoist create failed. Check token and logs.");
      this.plugin.recordLedgerEntry(
        "error",
        ledgerKey,
        `todoist: create failed (${this.formatError(error)})`
      );
      console.error("Todoist create failed", error);
      return;
    }

    try {
      await this.logSession({
        weekLabel: payload.weekLabel,
        recipes,
        tasks: created,
        bridgeClub: bridgeClubProjectId
          ? {
              projectId: bridgeClubProjectId,
              projectName: bridgeClubProjectName,
              tasks: bridgeClubCreated
            }
          : undefined
      });
    } catch (error) {
      console.error("Todoist session log failed", error);
    }

    const mealCount = bridgeClubCreated.length;
    const mealSuffix = mealCount ? `, ${mealCount} meals to ${bridgeClubProjectName}` : "";
    new Notice(`Sent ${created.length} items to Todoist${mealSuffix}.`);
    this.plugin.recordLedgerEntry(
      "success",
      ledgerKey,
      `todoist: sent ${created.length} items, ${mealCount} meals for ${payload.weekLabel}`
    );
  }

  private async buildShoppingItemsWithGemini(
    recipes: RecipeSource[]
  ): Promise<ShoppingItem[]> {
    const gemini = this.plugin.geminiService;
    if (!gemini) {
      throw new Error("Gemini service unavailable");
    }
    const items = await gemini.buildShoppingList({
      recipes: recipes.map((recipe) => ({
        title: recipe.title,
        content: recipe.content
      })),
      ignoreList: SHOPPING_IGNORE_LIST,
      allowedLabels: ALLOWED_LABELS,
      defaultLabel: DEFAULT_LABEL,
      stopWords: Array.from(STOP_WORDS)
    });
    return buildShoppingItemsFromGemini(items, SHOPPING_IGNORE_LIST);
  }

  private async loadRecipes(paths: string[]): Promise<RecipeSource[]> {
    const recipes: RecipeSource[] = [];
    for (const recipePath of paths) {
      const file = this.app.vault.getAbstractFileByPath(recipePath);
      if (!(file instanceof TFile)) continue;
      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};
      const title = (frontmatter?.title as string) || file.basename || recipePath;
      const scheduledDate = normalizeScheduledDate(
        frontmatter.scheduled ?? frontmatter.date
      );
      recipes.push({
        path: recipePath,
        title,
        content,
        scheduledDate
      });
    }
    return recipes;
  }

  private async confirmSend(summary: ConfirmSummary): Promise<TodoistAction> {
    return new Promise((resolve) => {
      const modal = new TodoistConfirmModal(this.app, summary, resolve);
      modal.open();
    });
  }

  private getTodoistScriptPath(): string {
    const vaultPath = this.app.vault.adapter.getBasePath();
    const configDir = this.app.vault.configDir || ".obsidian";
    const pluginId = this.plugin.manifest.id;
    const normalized = path.normalize(vaultPath);
    const pluginsSuffix = path.join(configDir, "plugins");

    if (normalized.endsWith(pluginsSuffix)) {
      return path.join(normalized, pluginId, "scripts", "todoist_client.py");
    }
    if (normalized.endsWith(configDir)) {
      return path.join(normalized, "plugins", pluginId, "scripts", "todoist_client.py");
    }
    return path.join(normalized, configDir, "plugins", pluginId, "scripts", "todoist_client.py");
  }

  private async runTodoistCommand(args: string[]): Promise<string> {
    const scriptPath = this.getTodoistScriptPath();
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      maxBuffer: 1024 * 1024 * 5
    });
    return stdout;
  }

  private async listTodoistTasks(projectId: string = SHOPPING_PROJECT_ID): Promise<any[]> {
    const output = await this.runTodoistCommand(["list", "--project", projectId]);
    return JSON.parse(output);
  }

  private async listTodoistProjects(): Promise<Array<{ id: string; name: string }>> {
    const output = await this.runTodoistCommand(["projects"]);
    return JSON.parse(output);
  }

  private async resolveBridgeClubProject(): Promise<{ id: string; name: string }> {
    const projects = await this.listTodoistProjects();
    const match = projects.find((project) =>
      project.name.toLowerCase().includes(BRIDGE_CLUB_PROJECT_MATCH)
    );
    if (!match) {
      throw new Error("Bridge club project not found");
    }
    return { id: match.id, name: match.name };
  }

  private async createTodoistTasks(items: ShoppingItem[]) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "todoist-"));
    const payloadPath = path.join(tmpDir, "tasks.json");
    const payload: TodoistTaskPayload[] = items.map((item) => ({
      content: item.content,
      labels: item.labels
    }));
    await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8");

    try {
      const output = await this.runTodoistCommand([
        "create-batch",
        "--project",
        SHOPPING_PROJECT_ID,
        "--file",
        payloadPath
      ]);
      return JSON.parse(output);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async createBridgeClubTasks(tasks: BridgeClubTask[], projectId: string) {
    if (tasks.length === 0) return [];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "todoist-"));
    const payloadPath = path.join(tmpDir, "tasks.json");
    const payload: TodoistTaskPayload[] = tasks.map((task) => ({
      content: task.content,
      due_date: task.dueDate
    }));
    await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8");

    try {
      const output = await this.runTodoistCommand([
        "create-batch",
        "--project",
        projectId,
        "--file",
        payloadPath
      ]);
      return JSON.parse(output);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async writePreview(
    items: ShoppingItem[],
    weekLabel: string,
    bridgeClubTasks: BridgeClubTask[],
    bridgeClubProjectName: string
  ) {
    const lines = [
      "# todoist preview",
      "",
      `week: ${weekLabel}`,
      `generated: ${new Date().toISOString()}`,
      "",
      "## items",
      ...items.map((item) => `- ${item.content}`)
    ];
    if (bridgeClubTasks.length > 0) {
      lines.push("");
      lines.push(`## ${bridgeClubProjectName}`);
      lines.push(
        ...bridgeClubTasks.map((task) => `- ${task.content} (due ${task.dueDate})`)
      );
    }
    await fs.writeFile(PREVIEW_LOG_PATH, lines.join("\n"), "utf8");
  }

  private async logSession(payload: {
    weekLabel: string;
    recipes: RecipeSource[];
    tasks: Array<{ id: string; content: string; labels?: string[] }>;
    bridgeClub?: {
      projectId: string;
      projectName: string;
      tasks: Array<{ id: string; content: string; due?: { date?: string | null } }>;
    };
  }) {
    const entry = {
      timestamp: new Date().toISOString(),
      action: "create_shopping_list_from_weekly_planner",
      description: `Created shopping list items for ${payload.weekLabel}`,
      recipes: payload.recipes.map((recipe) => ({
        path: recipe.path,
        title: recipe.title
      })),
      tasks: payload.tasks.map((task) => ({
        id: task.id,
        content: task.content,
        labels: task.labels ?? []
      })),
      count: payload.tasks.length,
      bridgeClub: payload.bridgeClub
        ? {
            projectId: payload.bridgeClub.projectId,
            projectName: payload.bridgeClub.projectName,
            tasks: payload.bridgeClub.tasks.map((task) => ({
              id: task.id,
              content: task.content,
              dueDate: task.due?.date ?? null
            })),
            count: payload.bridgeClub.tasks.length
          }
        : null
    };

    let history: unknown = [];
    try {
      const existing = await fs.readFile(SESSION_LOG_PATH, "utf8");
      history = JSON.parse(existing);
    } catch {
      history = [];
    }

    const entries = Array.isArray(history) ? history : [];
    entries.push(entry);
    await fs.writeFile(SESSION_LOG_PATH, JSON.stringify(entries, null, 2), "utf8");
  }

  private createLedgerKey(weekLabel: string) {
    const timestamp = new Date().toISOString();
    const safeWeek = weekLabel.replace(/\s+/g, "-").toLowerCase();
    return `todoist:${safeWeek}:${timestamp}`;
  }

  private formatError(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
