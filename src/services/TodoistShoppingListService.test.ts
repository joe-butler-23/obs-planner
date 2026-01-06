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
    expect(onion?.content).toBe("onions 3");
    const salt = items.filter((item) => item.content === "salt");
    expect(salt).toHaveLength(1);
  });

  it("converts imperial units to metric", () => {
    const items = buildShoppingItems([
      { path: "c.md", title: "Recipe C", ingredients: ["1 lb flour"] }
    ]);
    expect(items[0].content).toBe("454g flour");
  });

  it("labels common produce", () => {
    expect(labelForIngredient("onion")).toBe("fruit-and-veg");
  });
});
