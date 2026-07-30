export type Comment = {
  id: string;
  article_id: string;
  author: string;
  body: string;
  quote: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  parent_id: string | null;
};
