import type { Category, GalleryItem, GalleryStats } from "./types";

export const CATEGORIES: Category[] = ["All", "Posters", "Cities", "People", "Illustration", "Guofeng"];

const CATEGORY_KEYWORDS: Record<Exclude<Category, "All">, string[]> = {
  Posters: ["\u6d77\u62a5", "poster", "\u5ba3\u4f20", "\u4e3b\u89c6\u89c9", "\u5c01\u9762", "\u6392\u7248"],
  Cities: ["\u57ce\u5e02", "\u676d\u5dde", "\u4e0a\u6d77", "\u6df1\u5733", "\u5317\u4eac", "\u5e7f\u5dde", "\u91cd\u5e86", "\u5357\u4eac", "city", "urban"],
  People: ["\u4eba\u7269", "\u4eba\u50cf", "portrait", "\u5c11\u5973", "\u5973\u751f", "\u5973\u6027", "idol", "woman", "girl", "\u7537", "\u5973"],
  Illustration: ["\u63d2\u753b", "illustration", "anime", "\u52a8\u6f2b", "\u8d34\u7eb8", "sticker", "\u5361\u901a", "\u5409\u7965\u7269", "chibi"],
  Guofeng: ["\u56fd\u98ce", "\u53e4\u98ce", "\u4e2d\u56fd\u98ce", "\u6c49\u670d", "\u6c34\u58a8", "\u5c71\u6c34", "\u4e1c\u65b9", "\u53e4\u4ee3", "Chinese"],
};

const CATEGORY_ALIASES: Record<Category, string[]> = {
  All: [],
  Posters: ["Posters", "Poster", "\u6d77\u62a5"],
  Cities: ["Cities", "City", "\u57ce\u5e02"],
  People: ["People", "Portrait", "\u4eba\u7269", "\u4eba\u50cf"],
  Illustration: ["Illustration", "Illustrations", "\u63d2\u753b"],
  Guofeng: ["Guofeng", "Chinese", "\u56fd\u98ce", "\u53e4\u98ce", "\u4e2d\u56fd\u98ce"],
};

export function itemKey(item: GalleryItem) {
  return `${item.post_number}-${item.image_index}-${item.image_url}`;
}

export function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .slice(0, 24),
    ),
  );
}

export function itemSearchText(item: GalleryItem, userTags: string[] = []) {
  return normalizeText(
    [
      item.post_number,
      item.username,
      item.title,
      item.info,
      item.prompt,
      getOriginalTags(item).join(" "),
      userTags.join(" "),
    ].join(" "),
  );
}

export function deriveTags(item: GalleryItem): string[] {
  return getOriginalTags(item);
}

export function getOriginalTags(item: GalleryItem): string[] {
  const importedTags = normalizeTags(item.original_tags);
  if (importedTags.length) return importedTags;

  const source = normalizeText([item.title, item.info, item.prompt, item.username].join(" "));
  const tags = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => source.includes(keyword.toLowerCase())))
    .map(([category]) => category);

  if (item.prompt && item.prompt !== "\u672a\u63d0\u4f9b") tags.push("Prompt");
  if (item.image_index > 1) tags.push("Series");

  return Array.from(new Set(tags)).slice(0, 4);
}

export function getAllTags(item: GalleryItem, userTags: string[] = []) {
  return Array.from(new Set([...getOriginalTags(item), ...normalizeTags(userTags)]));
}

export type RelatedGalleryItem = {
  item: GalleryItem;
  score: number;
  reasons: string[];
};

const GENERIC_TAGS = new Set(["Prompt", "Series", "Inspiration", "\u7ec4\u56fe", "\u7075\u611f"]);
const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "this",
  "that",
  "into",
  "your",
  "prompt",
  "image",
  "style",
  "\u751f\u6210",
  "\u4e00\u5f20",
  "\u8bf7\u53c2\u8003",
  "\u4e0a\u4f20",
  "\u7167\u7247",
]);

function getItemUserTags(item: GalleryItem, userTagsByItem: Record<string, string[]>) {
  return normalizeTags(userTagsByItem[itemKey(item)] || item.user_tags || []);
}

function getComparableTags(item: GalleryItem, userTags: string[] = []) {
  return getAllTags(item, userTags).filter((tag) => !GENERIC_TAGS.has(tag));
}

function toKeywordTokens(value: string) {
  const source = normalizeText(value);
  const tokens = new Set<string>();

  for (const word of source.match(/[a-z0-9][a-z0-9_-]{2,}/g) || []) {
    if (!STOP_WORDS.has(word)) tokens.add(word);
  }

  for (const phrase of source.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let index = 0; index < phrase.length - 1; index += 1) {
      const token = phrase.slice(index, index + 2);
      if (!STOP_WORDS.has(token)) tokens.add(token);
    }
  }

  return tokens;
}

function getKeywordTokens(item: GalleryItem) {
  return toKeywordTokens([item.title, item.info, item.prompt].join(" "));
}

function intersectValues(a: string[], b: string[]) {
  const target = new Set(b.map((value) => normalizeText(value)));
  return a.filter((value) => target.has(normalizeText(value)));
}

function intersectTokens(a: Set<string>, b: Set<string>) {
  const shared: string[] = [];
  for (const token of a) {
    if (b.has(token)) shared.push(token);
  }
  return shared;
}

export function rankRelatedItems(
  target: GalleryItem,
  allItems: GalleryItem[],
  userTagsByItem: Record<string, string[]> = {},
  limit = 12,
): RelatedGalleryItem[] {
  const targetKey = itemKey(target);
  const targetOriginalTags = getOriginalTags(target).filter((tag) => !GENERIC_TAGS.has(tag));
  const targetUserTags = getItemUserTags(target, userTagsByItem);
  const targetKeywords = getKeywordTokens(target);
  const targetAllTags = getComparableTags(target, targetUserTags);

  const scored = allItems
    .filter((candidate) => itemKey(candidate) !== targetKey)
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      if (candidate.post_number === target.post_number) {
        score += 100;
        reasons.push("Same floor");
      }

      const candidateOriginalTags = getOriginalTags(candidate).filter((tag) => !GENERIC_TAGS.has(tag));
      const candidateUserTags = getItemUserTags(candidate, userTagsByItem);
      const sharedOriginalTags = intersectValues(targetOriginalTags, candidateOriginalTags);
      const sharedUserTags = intersectValues(targetUserTags, candidateUserTags);

      if (sharedOriginalTags.length) {
        score += sharedOriginalTags.length * 32;
        reasons.push(`Tags: ${sharedOriginalTags.slice(0, 2).join(", ")}`);
      }

      if (sharedUserTags.length) {
        score += sharedUserTags.length * 38;
        reasons.push(`My tags: ${sharedUserTags.slice(0, 2).join(", ")}`);
      }

      if (normalizeText(candidate.username) === normalizeText(target.username)) {
        score += 28;
        reasons.push("Same creator");
      }

      const sharedKeywords = intersectTokens(targetKeywords, getKeywordTokens(candidate));
      if (sharedKeywords.length) {
        score += Math.min(30, sharedKeywords.length * 4);
        reasons.push("Similar keywords");
      }

      const postDistance = Math.abs(candidate.post_number - target.post_number);
      if (postDistance > 0 && postDistance <= 5) {
        score += 10;
        reasons.push("Nearby floor");
      } else if (postDistance > 0 && postDistance <= 20) {
        score += 5;
      }

      if (!reasons.length && targetAllTags.length) score -= 1;

      return {
        item: candidate,
        score,
        reasons: reasons.slice(0, 3),
        postDistance,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.post_number === target.post_number && b.item.post_number === target.post_number) {
        return a.item.image_index - b.item.image_index;
      }
      if (a.postDistance !== b.postDistance) return a.postDistance - b.postDistance;
      return b.item.post_number - a.item.post_number || a.item.image_index - b.item.image_index;
    });

  return scored.slice(0, limit).map(({ item, score, reasons }) => ({ item, score, reasons }));
}

export function matchesCategory(item: GalleryItem, category: Category) {
  if (category === "All") return true;
  const aliases = new Set(CATEGORY_ALIASES[category].map((value) => normalizeText(value)));
  return getOriginalTags(item).some((tag) => aliases.has(normalizeText(tag)));
}

export function getDisplayTitle(item: GalleryItem) {
  const prompt = (item.prompt || "").replace(/\s+/g, " ").trim();
  if (!prompt || prompt === "\u672a\u63d0\u4f9b") return item.title || `Floor ${item.post_number} work`;

  const cleaned = prompt
    .replace(/^\u751f\u6210\u4e00\u5f20/, "")
    .replace(/^\u8bf7\u751f\u6210/, "")
    .replace(/^Create an? /i, "")
    .replace(/^A /i, "")
    .replace(/^\u4e00\u5f20/, "")
    .trim();

  return truncateText(cleaned, 18);
}

export function getPromptPreview(item: GalleryItem, maxLength = 76) {
  const prompt = (item.prompt || "Not provided").replace(/\s+/g, " ").trim();
  return truncateText(prompt, maxLength);
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export function computeStats(items: GalleryItem[]): GalleryStats {
  const posts = new Map<number, number>();
  for (const item of items) posts.set(item.post_number, (posts.get(item.post_number) || 0) + 1);

  return {
    images: items.length,
    posts: posts.size,
    users: new Set(items.map((item) => item.username)).size,
    copyablePrompts: items.filter((item) => item.prompt && item.prompt !== "\u672a\u63d0\u4f9b").length,
    multiImagePosts: Array.from(posts.values()).filter((count) => count > 1).length,
  };
}

export function topTags(items: GalleryItem[], limit = 8) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of getOriginalTags(item).filter((value) => value !== "Prompt" && value !== "\u7ec4\u56fe")) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
