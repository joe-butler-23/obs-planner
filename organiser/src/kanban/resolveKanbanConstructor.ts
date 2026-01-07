import jKanbanModule from "jkanban";

export type JKanbanCtor = new (options: any) => any;

export const resolveKanbanConstructor = (): JKanbanCtor => {
	const moduleAny = jKanbanModule as unknown as {
		default?: unknown;
		jKanban?: unknown;
	};
	const globalAny = globalThis as { jKanban?: unknown };

	const candidate =
		(typeof moduleAny.default === "function" && moduleAny.default) ||
		(typeof (moduleAny.default as { jKanban?: unknown })?.jKanban ===
			"function" &&
			(moduleAny.default as { jKanban?: unknown }).jKanban) ||
		(typeof moduleAny.jKanban === "function" && moduleAny.jKanban) ||
		(typeof jKanbanModule === "function" && jKanbanModule) ||
		(typeof globalAny.jKanban === "function" && globalAny.jKanban) ||
		(typeof (window as { jKanban?: unknown }).jKanban === "function" &&
			(window as { jKanban?: unknown }).jKanban);

	if (typeof candidate !== "function") {
		throw new Error("jKanban constructor not available");
	}

	return candidate as JKanbanCtor;
};
