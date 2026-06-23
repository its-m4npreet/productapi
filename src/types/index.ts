export const VALID_CATEGORIES = [
  'Electronics',
  'Fashion',
  'Grocery',
  'Books',
  'Home',
  'Sports',
  'Beauty',
  'Toys',
  'Furniture',
  'Footwear',
] as const;

export type ProductCategory = (typeof VALID_CATEGORIES)[number];

export interface CursorData {
  updatedAt: Date;
  id: string;
}

export interface ProductsQueryParams {
  limit?: number;
  cursor?: string;
  category?: string;
}

export interface ProductsResponse {
  products: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    createdAt: string;
    updatedAt: string;
  }>;
  nextCursor: string | null;
}

export interface ApiError {
  error: string;
  details?: string;
}
