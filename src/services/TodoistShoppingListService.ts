import { App, Modal, Notice, TFile } from "obsidian";
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
const SESSION_LOG_PATH = path.join(
  os.homedir(),
  "projects",
  "sys-arc",
  "resources",
  "todoist-session.json"
);

type RecipeSource = {
  path: string;
  title: string;
  ingredients: string[];
};

type ShoppingItem = {
  content: string;
  labels: string[];
  sources: string[];
};

type ParsedIngredient = {
  displayName: string;
  quantity: number | null;
  unit: "g" | "ml" | "count" | null;
};

type AggregatedItem = {
  displayName: string;
  quantity: number | null;
  unit: "g" | "ml" | "count" | null;
  label: string;
  sources: Set<string>;
};

type TodoistTaskPayload = {
  content: string;
  labels?: string[];
};

type ConfirmSummary = {
  weekLabel: string;
  recipeCount: number;
  itemCount: number;
  baselineCount: number;
};

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
      "broccoli",
      "cauliflower",
      "herb",
      "parsley",
      "basil",
      "coriander",
      "cilantro",
      "mint",
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
      "celery"
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

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

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

const INGREDIENT_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bvegetable\s+stock\b/i, replacement: "veg stock" },
  { pattern: /\bvegetable\s+broth\b/i, replacement: "veg stock" },
  { pattern: /\bveg(?:etable)?\s+stock\b/i, replacement: "veg stock" }
];

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

export const labelForIngredient = (name: string): string => {
  const normalized = name.toLowerCase();
  for (const rule of LABEL_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.label;
    }
  }
  return DEFAULT_LABEL;
};

export const parseIngredientLine = (line: string): ParsedIngredient | null => {
  const cleaned = normalizeSpaces(line.replace(/^[-*+]\s+/, ""));
  if (!cleaned) return null;

  const tokens = cleaned.split(" ");
  const { quantity, consumed } = parseQuantity(tokens);
  if (quantity === null) {
    const sanitizedName = sanitizeIngredientName(cleaned);
    if (!sanitizedName) return null;
    return {
      displayName: sanitizedName,
      quantity: null,
      unit: null
    };
  }

  let unitToken: string | null = null;
  let nameStart = consumed;

  if (consumed === 1) {
    const attachedMatch = tokens[0].match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/);
    if (attachedMatch) {
      unitToken = normalizeUnitToken(attachedMatch[2]);
      nameStart = 1;
    }
  }

  if (!unitToken) {
    unitToken = normalizeUnitToken(tokens[consumed]);
    if (unitToken) {
      nameStart = consumed + 1;
    }
  }

  const name = normalizeSpaces(tokens.slice(nameStart).join(" "));
  const sanitizedName = sanitizeIngredientName(name);
  if (!sanitizedName) return null;

  const metric = convertToMetric(quantity, unitToken);
  return {
    displayName: sanitizedName,
    quantity: metric.quantity,
    unit: metric.unit
  };
};

export const buildShoppingItems = (recipes: RecipeSource[]): ShoppingItem[] => {
  const aggregated = new Map<string, AggregatedItem>();

  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const parsed = parseIngredientLine(line);
      if (!parsed) continue;

      if (parsed.quantity === null || parsed.unit === null) {
        const keyName = normalizeNameForKey(parsed.displayName);
        const key = `${keyName}|none`;
        if (!aggregated.has(key)) {
          aggregated.set(key, {
            displayName: parsed.displayName,
            quantity: null,
            unit: null,
            label: labelForIngredient(parsed.displayName),
            sources: new Set([recipe.title])
          });
        } else {
          aggregated.get(key)?.sources.add(recipe.title);
        }
        continue;
      }

      const keyName = normalizeNameForKey(parsed.displayName);
      const key = `${keyName}|${parsed.unit}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity = (existing.quantity ?? 0) + parsed.quantity;
        existing.sources.add(recipe.title);
      } else {
        aggregated.set(key, {
          displayName: parsed.displayName,
          quantity: parsed.quantity,
          unit: parsed.unit,
          label: labelForIngredient(parsed.displayName),
          sources: new Set([recipe.title])
        });
      }
    }
  }

  const items: ShoppingItem[] = [];
  for (const entry of aggregated.values()) {
    const recipeList = Array.from(entry.sources);
    const recipeLabel = recipeList.map((recipe) => recipe.toLowerCase()).join(", ");

    if (entry.quantity === null || entry.unit === null) {
      const content = recipeLabel
        ? `${entry.displayName} - ${recipeLabel}`
        : entry.displayName;
      items.push({
        content,
        labels: [entry.label],
        sources: Array.from(entry.sources)
      });
      continue;
    }

    const formattedQty = formatMetricQuantity(entry.quantity, entry.unit);
    const name =
      entry.unit === "count"
        ? pluralize(entry.displayName, entry.quantity)
        : entry.displayName;
    const baseContent = `${name} - ${formattedQty}`.trim();
    const content = `${baseContent} - ${recipeLabel}`;
    items.push({
      content,
      labels: [entry.label],
      sources: Array.from(entry.sources)
    });
  }

  return items;
};

class TodoistConfirmModal extends ModalBase {
  private resolved = false;

  constructor(
    app: App,
    private summary: ConfirmSummary,
    private onConfirm: (approved: boolean) => void
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

    const actions = contentEl.createEl("div", { cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    const confirm = actions.createEl("button", { text: "Send to Todoist" });

    cancel.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });
    confirm.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }

  onClose() {
    this.resolve(false);
  }

  private resolve(value: boolean) {
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
    const items = buildShoppingItems(recipes);
    if (items.length === 0) {
      new Notice("No ingredients found in scheduled recipes.");
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: no ingredients found for ${payload.weekLabel}`
      );
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

    const approved = await this.confirmSend({
      weekLabel: payload.weekLabel,
      recipeCount: recipes.length,
      itemCount: items.length,
      baselineCount
    });
    if (!approved) {
      this.plugin.recordLedgerEntry(
        "skipped",
        ledgerKey,
        `todoist: cancelled for ${payload.weekLabel}`
      );
      return;
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
        tasks: created
      });
    } catch (error) {
      console.error("Todoist session log failed", error);
    }

    new Notice(`Sent ${created.length} items to Todoist.`);
    this.plugin.recordLedgerEntry(
      "success",
      ledgerKey,
      `todoist: sent ${created.length} items for ${payload.weekLabel}`
    );
  }

  private async loadRecipes(paths: string[]): Promise<RecipeSource[]> {
    const recipes: RecipeSource[] = [];
    for (const recipePath of paths) {
      const file = this.app.vault.getAbstractFileByPath(recipePath);
      if (!(file instanceof TFile)) continue;
      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const title =
        (cache?.frontmatter?.title as string) || file.basename || recipePath;
      recipes.push({
        path: recipePath,
        title,
        ingredients: parseIngredientsSection(content)
      });
    }
    return recipes;
  }

  private async confirmSend(summary: ConfirmSummary): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new TodoistConfirmModal(this.app, summary, resolve);
      modal.open();
    });
  }

  private getTodoistScriptPath(): string {
    const vaultPath = this.app.vault.adapter.getBasePath();
    const pluginId = this.plugin.manifest.id;
    return path.join(vaultPath, ".obsidian", "plugins", pluginId, "scripts", "todoist_client.py");
  }

  private async runTodoistCommand(args: string[]): Promise<string> {
    const scriptPath = this.getTodoistScriptPath();
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      maxBuffer: 1024 * 1024 * 5
    });
    return stdout;
  }

  private async listTodoistTasks(): Promise<Array<{ id: string }>> {
    const output = await this.runTodoistCommand([
      "list",
      "--project",
      SHOPPING_PROJECT_ID
    ]);
    return JSON.parse(output);
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

  private async logSession(payload: {
    weekLabel: string;
    recipes: RecipeSource[];
    tasks: Array<{ id: string; content: string; labels?: string[] }>;
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
      count: payload.tasks.length
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
