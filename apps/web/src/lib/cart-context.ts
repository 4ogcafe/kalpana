import { createContext, useContext } from 'react';

export interface CartLine {
  id: string;
  name: string;
  price: number;
  img: string;
  quantity: number;
}

export interface CartValue {
  lines: CartLine[];
  count: number;
  total: number;
  /** Adds `quantity` (default 1); an item already in the cart has its quantity increased, never duplicated. */
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Removes only these items, e.g. the ones just ordered. */
  removeMany: (ids: string[]) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

export const MAX_QUANTITY = 20;
export const DEFAULT_CARD_MAX_QUANTITY = 10;

export const CartContext = createContext<CartValue | null>(null);

export function useCart(): CartValue {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}
