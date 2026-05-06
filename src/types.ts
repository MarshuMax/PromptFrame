export type GalleryItem = {
  id?: number;
  post_number: number;
  username: string;
  post_url: string;
  image_url: string;
  thumb_url: string;
  title: string;
  info: string;
  prompt: string;
  image_index: number;
  recommended?: boolean;
  pinned?: boolean;
  original_tags?: string[];
  user_tags?: string[];
  created_at?: string;
  updated_at?: string;
};

export type Category = "全部" | string;

export type SortMode = "newest" | "oldest";

export type ViewMode = "grid" | "list";

export type ThemeMode = "light" | "dark";

export type GalleryStats = {
  images: number;
  posts: number;
  users: number;
  copyablePrompts: number;
  multiImagePosts: number;
};
