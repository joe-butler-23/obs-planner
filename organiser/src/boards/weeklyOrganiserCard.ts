import { App, TFile } from "obsidian";
import { OrganiserItem } from "../types";

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return char;
		}
	});

const toSafeString = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	return typeof value === "string" ? value : String(value);
};

const normalizeCoverImageValue = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return "";

	const wikiMatch = trimmed.match(/^!?\[\[(.+)\]\]$/);
	const inner = wikiMatch ? wikiMatch[1] : trimmed;
	const pathPart = inner.split("|")[0] ?? "";
	return pathPart.trim();
};

const isSafeCoverUrl = (value: string): boolean => {
	const lower = value.toLowerCase();
	if (
		lower.startsWith("http://") ||
		lower.startsWith("https://") ||
		lower.startsWith("app://") ||
		lower.startsWith("obsidian://")
	) {
		return true;
	}
	if (lower.startsWith("//")) return false;
	return !/^[a-z][a-z0-9+.-]*:/.test(lower);
};

const joinVaultPath = (baseDir: string, relativePath: string): string => {
	const parts = [...baseDir.split("/"), ...relativePath.split("/")];
	const resolved: string[] = [];
	for (const part of parts) {
		if (!part || part === ".") continue;
		if (part === "..") {
			resolved.pop();
			continue;
		}
		resolved.push(part);
	}
	return resolved.join("/");
};

const resolveCoverImage = (app: App, item: OrganiserItem): string => {
	const rawCoverImage =
		typeof item.coverImage === "string" ? item.coverImage.trim() : "";
	if (!rawCoverImage) return "";

	const normalized = normalizeCoverImageValue(rawCoverImage).replace(
		/\\/g,
		"/"
	);
	if (!normalized || !isSafeCoverUrl(normalized)) return "";

	const lower = normalized.toLowerCase();
	if (
		lower.startsWith("http://") ||
		lower.startsWith("https://") ||
		lower.startsWith("app://") ||
		lower.startsWith("obsidian://")
	) {
		return normalized;
	}

	const vaultPath = normalized.replace(/^\.\/+/, "").replace(/^\/+/, "");
	let file = app.vault.getAbstractFileByPath(vaultPath);
	if (file instanceof TFile) {
		return app.vault.getResourcePath(file);
	}

	const baseDir = item.path.includes("/")
		? item.path.slice(0, item.path.lastIndexOf("/"))
		: "";
	const resolvedPath = baseDir
		? joinVaultPath(baseDir, vaultPath)
		: vaultPath;
	file = app.vault.getAbstractFileByPath(resolvedPath);
	if (file instanceof TFile) {
		return app.vault.getResourcePath(file);
	}

	return "";
};

export const renderWeeklyOrganiserCard = (
	app: App,
	item: OrganiserItem
): string => {
	const iconByType: Record<string, string> = {
		recipe: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
		exercise: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`,
		task: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="m9 12 2 2 4-4"/></svg>`,
	};
	const icon = iconByType[item.type] ?? iconByType.task;

	const title = escapeHtml(toSafeString(item.title));
	const coverImage = resolveCoverImage(app, item);
	const escapedCoverImage = coverImage ? escapeHtml(coverImage) : "";

	const imageHTML = escapedCoverImage
		? `<div class="card-cover"><img src="${escapedCoverImage}" alt="${title}" draggable="false" /></div>`
		: "";

	return `
		<div class="organiser-card-content">
			${imageHTML}
			<div class="card-header">
				${icon}
				<div class="card-title">${title}</div>
			</div>
		</div>
	`;
};
