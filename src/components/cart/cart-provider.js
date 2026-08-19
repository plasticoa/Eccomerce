"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCartItemAction,
  getCartAction,
  mergeGuestCartAction,
  reconcileCartAction,
  removeCartItemAction,
  updateCartQuantityAction,
  validateCartQuantityAction,
  validateGuestCartAction,
} from "@/features/cart/actions";
import {
  GUEST_CART_KEY,
  addGuestItem,
  cartUnitCount,
  emptyGuestCart,
  normalizeGuestCart,
  removeGuestItem,
  setGuestQuantity,
} from "@/features/cart/guest-cart";

const CartContext = createContext(null);
const emptyDetailedCart = { items: [], subtotal: 0, warnings: [] };

function newCartId() {
  return globalThis.crypto?.randomUUID?.() || "00000000-0000-4000-8000-000000000001";
}

function readGuestCart() {
  try { return normalizeGuestCart(JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "null"), newCartId); }
  catch { return emptyGuestCart(newCartId()); }
}

function writeGuestCart(cart) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
}

export function CartProvider({ userId, children }) {
  const router = useRouter();
  const [rawCart, setRawCart] = useState(() => emptyGuestCart(""));
  const [cart, setCart] = useState(emptyDetailedCart);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadAuthenticated = useCallback(async () => {
    let result = await getCartAction();
    if (!result.success) throw new Error(result.error);
    let next = result.cart || { rawItems: [], items: [], subtotal: 0, warnings: [] };
    if (next.items?.some((item) => item.available && item.requestedQuantity !== item.quantity)) {
      const reconciled = await reconcileCartAction();
      if (reconciled.success && reconciled.updated) {
        result = await getCartAction();
        if (result.success) next = result.cart;
      }
    }
    setRawCart({ version: 1, id: "authenticated", items: next.rawItems || [] });
    setCart(next);
  }, []);

  const loadGuest = useCallback(async (guest) => {
    const result = await validateGuestCartAction(guest.items);
    if (!result.success) throw new Error(result.error);
    const quantities = new Map(result.cart.items.filter((item) => item.available).map((item) => [item.variantId, item.quantity]));
    const canonical = { ...guest, items: guest.items.map((item) => quantities.has(item.variantId) ? { ...item, quantity: quantities.get(item.variantId) } : item) };
    if (JSON.stringify(canonical.items) !== JSON.stringify(guest.items)) writeGuestCart(canonical);
    setRawCart(canonical);
    setCart(result.cart);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setReady(false);
      try {
        const guest = readGuestCart();
        if (userId) {
          if (guest.items.length) {
            const merge = await mergeGuestCartAction(guest);
            if (merge.success) {
              localStorage.removeItem(GUEST_CART_KEY);
              const limited = Number(merge.result?.limitedItems || 0);
              const skipped = Number(merge.result?.skippedItems || 0);
              if (limited || skipped) setMessage("Fusionamos tu carrito y ajustamos artículos según existencias.");
              else setMessage("Tu carrito de visitante se asoció con tu cuenta.");
            } else setMessage(merge.error);
          }
          if (active) await loadAuthenticated();
        } else if (active) await loadGuest(guest);
      } catch (error) {
        if (active) setMessage(error.message || "No pudimos cargar el carrito.");
      } finally {
        if (active) setReady(true);
      }
    }
    bootstrap();
    return () => { active = false; };
  }, [userId, loadAuthenticated, loadGuest]);

  const refresh = useCallback(async () => {
    if (userId) await loadAuthenticated();
    else await loadGuest(rawCart);
  }, [userId, loadAuthenticated, loadGuest, rawCart]);

  const addItem = useCallback(async (variantId, quantity) => {
    setBusy(true); setMessage("");
    try {
      if (userId) {
        const result = await addCartItemAction(variantId, quantity);
        if (!result.success) throw new Error(result.error);
        await loadAuthenticated();
      } else {
        const current = rawCart.id ? rawCart : emptyGuestCart(newCartId());
        const existing = current.items.find((item) => item.variantId === variantId)?.quantity || 0;
        const desired = existing + Number(quantity);
        const validation = await validateCartQuantityAction(variantId, desired);
        if (!validation.success) throw new Error(validation.error);
        const next = addGuestItem(current, variantId, quantity, validation.stock);
        writeGuestCart(next);
        await loadGuest(next);
      }
      setMessage("Producto agregado al carrito.");
      router.refresh();
      return true;
    } catch (error) { setMessage(error.message || "No pudimos agregar el producto."); return false; }
    finally { setBusy(false); }
  }, [userId, rawCart, loadAuthenticated, loadGuest, router]);

  const updateItem = useCallback(async (variantId, quantity) => {
    setBusy(true); setMessage("");
    try {
      if (userId) {
        const result = await updateCartQuantityAction(variantId, quantity);
        if (!result.success) throw new Error(result.error);
        await loadAuthenticated();
      } else {
        const validation = await validateCartQuantityAction(variantId, quantity);
        if (!validation.success) throw new Error(validation.error);
        const next = setGuestQuantity(rawCart, variantId, quantity, validation.stock);
        writeGuestCart(next); await loadGuest(next);
      }
      setMessage("Cantidad actualizada.");
      return true;
    } catch (error) { setMessage(error.message || "No pudimos actualizar la cantidad."); return false; }
    finally { setBusy(false); }
  }, [userId, rawCart, loadAuthenticated, loadGuest]);

  const removeItem = useCallback(async (variantId) => {
    setBusy(true); setMessage("");
    try {
      if (userId) {
        const result = await removeCartItemAction(variantId);
        if (!result.success) throw new Error(result.error);
        await loadAuthenticated();
      } else {
        const next = removeGuestItem(rawCart, variantId);
        writeGuestCart(next); await loadGuest(next);
      }
      setMessage("Artículo eliminado.");
      return true;
    } catch (error) { setMessage(error.message || "No pudimos eliminar el artículo."); return false; }
    finally { setBusy(false); }
  }, [userId, rawCart, loadAuthenticated, loadGuest]);

  const value = useMemo(() => ({ cart, rawCart, unitCount: cartUnitCount(rawCart.items), ready, busy, message, setMessage, addItem, updateItem, removeItem, refresh, authenticated: Boolean(userId) }), [cart, rawCart, ready, busy, message, addItem, updateItem, removeItem, refresh, userId]);
  return <CartContext.Provider value={value}>{children}<div className="cart-announcer" aria-live="polite" aria-atomic="true">{message}</div></CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart debe utilizarse dentro de CartProvider");
  return value;
}
