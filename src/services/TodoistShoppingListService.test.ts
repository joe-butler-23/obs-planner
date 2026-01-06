import { describe, expect, it } from "vitest";
import {
  buildShoppingItems,
  labelForIngredient,
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
