"use client";

import Image from "next/image";
import { useState } from "react";
import { getProductImageUrl } from "@/features/catalog/catalog-utils";

export function ProductGallery({ images, productName }) {
  const safeImages = images.length ? images : [{ id: "placeholder", path: "", alt: productName }];
  const [selectedId, setSelectedId] = useState(safeImages[0].id);
  const selected = safeImages.find((image) => image.id === selectedId) || safeImages[0];

  return (
    <div className="product-gallery">
      <div className="gallery-main">
        <Image src={getProductImageUrl(selected.path)} alt={selected.alt || productName} fill priority sizes="(max-width: 760px) 100vw, 50vw" />
      </div>
      {safeImages.length > 1 ? (
        <div className="gallery-thumbnails" role="list" aria-label="Imágenes del producto">
          {safeImages.map((image, index) => (
            <button
              className={image.id === selected.id ? "gallery-thumb gallery-thumb-active" : "gallery-thumb"}
              type="button"
              key={image.id}
              onClick={() => setSelectedId(image.id)}
              aria-label={`Ver imagen ${index + 1}: ${image.alt || productName}`}
              aria-pressed={image.id === selected.id}
            >
              <Image src={getProductImageUrl(image.path)} alt="" fill sizes="80px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
