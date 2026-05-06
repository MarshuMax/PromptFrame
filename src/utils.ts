import type { Category, GalleryItem, GalleryStats } from "./types";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  海报: ["海报", "poster", "宣传", "主视觉", "封面", "排版"],
  城市: ["城市", "杭州", "上海", "深圳", "北京", "广州", "重庆", "南京", "city", "urban"],
  人物: ["人物", "人像", "portrait", "少女", "女生", "女性", "idol", "woman", "girl", "男", "女"],
  插画: ["插画", "illustration", "anime", "动漫", "贴纸", "sticker", "卡通", "吉祥物", "chibi"],
  国风: ["国风", "古风", "中国风", "汉服", "水墨", "山水", "东方", "古代", "Chinese"],
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

  if (item.prompt && item.prompt !== "未提供") tags.push("Prompt");
  if (item.image_index > 1) tags.push("组图");

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

const GENERIC_TAGS = new Set(["Prompt", "组图", "灵感"]);
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
  "生成",
  "一张",
  "请参考",
  "上传",
  "照片",
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
        reasons.push("同楼层");
      }

      const candidateOriginalTags = getOriginalTags(candidate).filter((tag) => !GENERIC_TAGS.has(tag));
      const candidateUserTags = getItemUserTags(candidate, userTagsByItem);
      const sharedOriginalTags = intersectValues(targetOriginalTags, candidateOriginalTags);
      const sharedUserTags = intersectValues(targetUserTags, candidateUserTags);

      if (sharedOriginalTags.length) {
        score += sharedOriginalTags.length * 32;
        reasons.push(`标签：${sharedOriginalTags.slice(0, 2).join("、")}`);
      }

      if (sharedUserTags.length) {
        score += sharedUserTags.length * 38;
        reasons.push(`我的标签：${sharedUserTags.slice(0, 2).join("、")}`);
      }

      if (normalizeText(candidate.username) === normalizeText(target.username)) {
        score += 28;
        reasons.push("同作者");
      }

      const sharedKeywords = intersectTokens(targetKeywords, getKeywordTokens(candidate));
      if (sharedKeywords.length) {
        score += Math.min(30, sharedKeywords.length * 4);
        reasons.push("关键词相似");
      }

      const postDistance = Math.abs(candidate.post_number - target.post_number);
      if (postDistance > 0 && postDistance <= 5) {
        score += 10;
        reasons.push("相邻楼层");
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
  if (category === "全部") return true;
  return getOriginalTags(item).includes(category);
}

function titleFromPrompt(promptRaw: string, limit = 15) {
  const prompt = String(promptRaw || "").replace(/\s+/g, " ").trim();
  if (!prompt || prompt === "未提供") return "";

  const cleaned = prompt
    .replace(/^生成一张/, "")
    .replace(/^请生成/, "")
    .replace(/^Create an? /i, "")
    .replace(/^A /i, "")
    .replace(/^一张/, "")
    .trim();

  const base = cleaned || prompt;
  const hasCjk = /[\u3400-\u9FFF]/.test(base);

  if (hasCjk) {
    const compact = base.replace(/\s+/g, "");
    if (compact.length <= limit) return compact;
    return `${compact.slice(0, limit).trim()}...`;
  }

  const words = base.split(/\s+/g).filter(Boolean);
  if (words.length <= limit) return base;
  return `${words.slice(0, limit).join(" ").trim()}...`;
}

export function getDisplayTitle(item: GalleryItem) {
  const title = String(item.title || "").replace(/\s+/g, " ").trim();
  const looksAutoTitle = /^第\d+层-图\d+$/.test(title);
  if (title && !looksAutoTitle) return title;

  const fromPrompt = titleFromPrompt(item.prompt, 15);
  if (fromPrompt) return fromPrompt;

  if (title) return title;
  return `第${item.post_number}层作品`;
}

export function getPromptPreview(item: GalleryItem, maxLength = 76) {
  const prompt = (item.prompt || "未提供").replace(/\s+/g, " ").trim();
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
    copyablePrompts: items.filter((item) => item.prompt && item.prompt !== "未提供").length,
    multiImagePosts: Array.from(posts.values()).filter((count) => count > 1).length,
  };
}

export function topTags(items: GalleryItem[], limit = 8) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of getOriginalTags(item).filter((value) => value !== "Prompt" && value !== "组图")) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
