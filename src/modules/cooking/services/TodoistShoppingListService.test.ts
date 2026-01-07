import { describe, expect, it } from "vitest";
import {
  buildShoppingItemsFromGemini,
  buildShoppingItems,
  labelForIngredient,
  parseGeminiShoppingContent,
  parseIngredientsSection
} from "./TodoistShoppingListService";

describe("TodoistShoppingListService helpers", () => {
  it("extracts ingredients from markdown section", () => {
    const markdown = [
      "# Title",
      "",
      "## Ingredients",
      "- 1 onion",
      "- 2 onions",
      "- salt",
      "",
      "## Method",
      "Do the thing."
    ].join("\n");
    const items = parseIngredientsSection(markdown);
    expect(items).toEqual(["1 onion", "2 onions", "salt"]);
  });

  it("parses gemini shopping content with quantity", () => {
    const parsed = parseGeminiShoppingContent("carrots - 250g - [carrot beansotto]");
    expect(parsed).toEqual({
      content: "carrots - 250g - [carrot beansotto]",
      ingredient: "carrots"
    });
  });

  it("parses gemini shopping content without quantity", () => {
    const parsed = parseGeminiShoppingContent("bay leaf - [beanotto]");
    expect(parsed).toEqual({
      content: "bay leaf - [beanotto]",
      ingredient: "bay leaf"
    });
  });

  it("filters ignored items from gemini output", () => {
    const items = buildShoppingItemsFromGemini(
      [
        { content: "salt - [recipe a]", label: "tinned-jarred-dried" },
        { content: "carrots - 250g - [recipe a]", label: "fruit-and-veg" }
      ],
      ["salt", "water", "pepper"]
    );
    expect(items).toHaveLength(1);
    expect(items[0].content).toBe("carrots - 250g - [recipe a]");
  });

  it("rejects unsupported gemini labels", () => {
    expect(() =>
      buildShoppingItemsFromGemini([{ content: "carrots - 250g - [recipe a]", label: "unknown" }])
    ).toThrow("unsupported label");
  });

  it("merges count-based ingredients and keeps no-quantity items", () => {
    const items = buildShoppingItems([
      { path: "a.md", title: "Recipe A", ingredients: ["1 onion", "salt"] },
      { path: "b.md", title: "Recipe B", ingredients: ["2 onions", "salt"] }
    ]);
    const onion = items.find((item) => item.content.includes("onion"));
    expect(onion?.content).toBe("onions - 3 - [recipe, recipe b]");
    const salt = items.filter((item) => item.content === "salt");
    expect(salt).toHaveLength(0);
    const saltItem = items.find((item) => item.content.startsWith("salt -"));
    expect(saltItem?.content).toBe("salt - [recipe, recipe b]");
  });

  it("converts imperial units to metric", () => {
    const items = buildShoppingItems([
      { path: "c.md", title: "Recipe C", ingredients: ["1 lb flour"] }
    ]);
    expect(items[0].content).toBe("flour - 454g - [recipe c]");
  });

  it("labels common produce", () => {
    expect(labelForIngredient("onion")).toBe("fruit-and-veg");
  });

  it("strips prep notes and normalizes stock labels", () => {
    const items = buildShoppingItems([
      {
        path: "d.md",
        title: "Beanotto",
        ingredients: [
          "250g carrots, sliced into thin coins on a slight angle (just thinner than a pound coin)",
          "500ml good-quality vegetable stock"
        ]
      }
    ]);
    const carrot = items.find((item) => item.content.startsWith("carrots -"));
    expect(carrot?.content).toBe("carrots - 250g - [beanotto]");
    const stock = items.find((item) => item.content.startsWith("veg stock -"));
    expect(stock?.content).toBe("veg stock - 500ml - [beanotto]");
  });

  it("formats count units like cloves and excludes water", () => {
    const items = buildShoppingItems([
      {
        path: "e.md",
        title: "Garlic Soup",
        ingredients: ["2 cloves garlic, minced", "cold water"]
      }
    ]);
    const garlic = items.find((item) => item.content.startsWith("garlic -"));
    expect(garlic?.content).toBe("garlic - 2 cloves - [garlic soup]");
    const water = items.find((item) => item.content.includes("water"));
    expect(water).toBeUndefined();
  });

  it("merges parmesan aliases", () => {
    const items = buildShoppingItems([
      { path: "f.md", title: "Recipe A", ingredients: ["25g parmesan"] },
      { path: "g.md", title: "Recipe B", ingredients: ["25g parmesan cheese"] }
    ]);
    const parm = items.find((item) => item.content.startsWith("parmesan -"));
    expect(parm?.content).toBe("parmesan - 50g - [recipe, recipe b]");
  });
});
