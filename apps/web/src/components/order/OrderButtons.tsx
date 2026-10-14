import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ShoppingCart, Zap } from 'lucide-react';
import { DEFAULT_CARD_MAX_QUANTITY, MAX_QUANTITY, useCart, type CartLine } from '../../lib/cart-context';
import QuantitySelector from './QuantitySelector';

export interface OrderableItem {
  id: string;
  name: string;
  priceValue: number;
  img: string;
  soldOut: boolean;
  categoryId?: string;
}

/** Checkout reads this from the navigation state to order one item without touching the cart. */
export interface BuyNowState {
  buyNow: CartLine;
}

/**
 * Quantity, "Add to cart" and "Order now" for one menu item. Once the item is in the cart the
 * selector edits the cart quantity directly, and "Add to cart" adds one more (the cart never holds
 * the same item twice). Clicks don't reach the card underneath (which opens the popup).
 */
export default function OrderButtons({ item, size = 'card', onAfterAdd }: { item: OrderableItem; size?: 'card' | 'popup'; onAfterAdd?: (item: OrderableItem) => void }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [draftQuantity, setDraftQuantity] = useState(1);
  const inCart = cart.lines.find(line => line.id === item.id);
  const quantity = inCart?.quantity ?? draftQuantity;
  const buttonClass = `order-btn${size === 'popup' ? ' order-btn-lg' : ''}`;

  if (item.soldOut) {
    return <div className={`order-actions order-sold-out${size === 'popup' ? ' is-popup' : ''}`}>売り切れ / Sold out</div>;
  }

  const line = { id: item.id, name: item.name, price: item.priceValue, img: item.img };

  const changeQuantity = (value: number) => {
    if (inCart) cart.setQuantity(item.id, value);
    else setDraftQuantity(value);
  };

  const addToCart = () => {
    const added = inCart ? 1 : draftQuantity;
    cart.add(line, added);
    setDraftQuantity(1);
    toast.success(`${item.name}をカートに追加しました（カート内 ${Math.min((inCart?.quantity ?? 0) + added, MAX_QUANTITY)}点）`);
    onAfterAdd?.(item);
  };

  const orderNow = () => {
    const state: BuyNowState = { buyNow: { ...line, quantity } };
    navigate('/order', { state });
  };

  return (
    <div className={`order-actions${size === 'popup' ? ' is-popup' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="order-qty">
        <span>数量</span>
        <QuantitySelector value={quantity} max={DEFAULT_CARD_MAX_QUANTITY} onChange={changeQuantity} label={item.name} size={size === 'popup' ? 'md' : 'sm'} />
      </div>
      <div className="order-buttons">
        <button
          type="button"
          onClick={addToCart}
          disabled={inCart?.quantity === MAX_QUANTITY}
          aria-label={inCart ? `${item.name}をもう1点カートに追加（現在${inCart.quantity}点）` : `${item.name}を${draftQuantity}点カートに追加`}
          className={`${buttonClass} order-btn-outline`}
        >
          <ShoppingCart size={17} aria-hidden="true" className="order-btn-icon" />
          カートに追加
        </button>
        <button
          type="button"
          onClick={orderNow}
          aria-label={`Order Place: ${item.name} ×${quantity}`}
          className={`${buttonClass} order-btn-solid`}
        >
          <Zap size={17} aria-hidden="true" className="order-btn-icon" fill="currentColor" />
          Order Place
        </button>
      </div>
    </div>
  );
}
