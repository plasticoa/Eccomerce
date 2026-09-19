"use client";

import { useState } from "react";
import { formatCurrency, getVariantAvailability } from "@/features/catalog/catalog-utils";
import { ProductAvailability } from "./product-availability";
import { QuantitySelector } from "@/components/cart/quantity-selector";
import { useCart } from "@/components/cart/cart-provider";
import { useStoreSettings } from "./store-settings-provider";

export function ProductVariantSelector({ variants }) {
  const { addItem, busy, message } = useCart();
  const {currency}=useStoreSettings();
  const [selectedId, setSelectedId] = useState(variants.length === 1 ? variants[0].id : "");
  const [quantity, setQuantity] = useState(1);
  const selected = variants.find((variant) => variant.id === selectedId) || null;
  const availability = selected ? getVariantAvailability(selected) : null;
  const canBuy = availability?.key !== "out" && Boolean(selected);

  return (
    <div className="variant-purchase-panel">
      {variants.length > 1 ? (
        <fieldset className="variant-selector">
          <legend>Selecciona una opción</legend>
          <div className="variant-options">
            {variants.map((variant) => (
              <label className={variant.id === selectedId ? "variant-option variant-option-active" : "variant-option"} key={variant.id}>
                <input type="radio" name="variant" value={variant.id} checked={variant.id === selectedId} onChange={() => { setSelectedId(variant.id); setQuantity(1); }} />
                <span>{variant.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {selected ? (
        <div className="selected-variant" aria-live="polite">
          <div className="detail-price">
            <strong>{formatCurrency(selected.price,currency)}</strong>
            {selected.compareAtPrice > selected.price ? <del>{formatCurrency(selected.compareAtPrice,currency)}</del> : null}
          </div>
          <dl>
            <div><dt>Presentación</dt><dd>{selected.name}</dd></div>
            <div><dt>SKU</dt><dd>{selected.sku}</dd></div>
            <div><dt>Disponibilidad</dt><dd><ProductAvailability availability={availability} compact /></dd></div>
            <div><dt>Existencias</dt><dd>{selected.quantity > 0 ? `${selected.quantity} unidades` : "Sin existencias"}</dd></div>
          </dl>
        </div>
      ) : <p className="selection-prompt" role="status">Elige una variante para consultar precio y disponibilidad.</p>}

      {selected && canBuy ? <div className="purchase-quantity"><span>Cantidad</span><QuantitySelector value={quantity} max={selected.quantity} onChange={setQuantity} disabled={busy} /></div> : null}
      <button className="button button-primary add-to-cart-preview" type="button" disabled={!canBuy || busy} onClick={() => addItem(selected.id, quantity)} aria-describedby="cart-preview-note">
        {!selected ? "Selecciona una opción" : canBuy ? "Agregar al carrito" : "Agotado"}
      </button>
      <p id="cart-preview-note" className="cart-preview-note">{message || "Validaremos precio y stock antes de agregar."}</p>
    </div>
  );
}
