export type GalleryItem = {
  post_number: number;
  username: string;
  post_url: string;
  image_url: string;
  thumb_url: string;
  title: string;
  info: string;
  prompt: string;
  image_index: number;
  original_tags?: string[];
  user_tags?: string[];
};

export type Category = "All" | "Posters" | "Cities" | "People" | "Illustration" | "Guofeng";

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
