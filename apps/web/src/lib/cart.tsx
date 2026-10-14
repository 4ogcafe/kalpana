import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartContext, MAX_QUANTITY, type CartLine, type CartValue } from './cart-context';

const STORAGE_KEY = 'kalpana_cart';

// Storage can be unavailable (private mode, blocked cookies); the cart then just lasts for the visit.
function loadLines(): CartLine[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((line) => typeof line?.id === 'string' && line.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadLines);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore: see loadLines
    }
  }, [lines]);

  const [isOpen, setIsOpen] = useState(false);

  const add = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((candidate) => candidate.id === line.id);
      if (!existing) return [...prev, { ...line, quantity: Math.min(quantity, MAX_QUANTITY) }];
      return prev.map((candidate) =>
        candidate.id === line.id ? { ...candidate, quantity: Math.min(candidate.quantity + quantity, MAX_QUANTITY) } : candidate,
      );
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.id !== id)
        : prev.map((line) => (line.id === id ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line)),
    );
  }, []);

  const remove = useCallback((id: string) => setLines((prev) => prev.filter((line) => line.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);
  const removeMany = useCallback((ids: string[]) => setLines((prev) => prev.filter((line) => !ids.includes(line.id))), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
      removeMany,
      isOpen,
      openCart,
      closeCart,
    }),
    [lines, add, setQuantity, remove, clear, removeMany, isOpen, openCart, closeCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
