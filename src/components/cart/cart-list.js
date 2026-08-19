"use client";
import { CartItem } from "./cart-item";
export function CartList({ items }) { return <div className="cart-list">{items.map((item) => <CartItem key={item.variantId} item={item} />)}</div>; }
