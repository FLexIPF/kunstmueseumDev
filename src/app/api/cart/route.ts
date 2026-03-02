import { NextRequest, NextResponse } from "next/server";

import { getArtwork } from "@/content/artworks";
import {
  ShopifyError,
  cartAddLine,
  cartCreateWithLine,
  productFirstVariantIdByHandle,
} from "@/lib/shopify/storefront";

const CART_COOKIE = "km_cart_id";

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as { artworkId?: unknown };
    const artworkId = typeof json.artworkId === "string" ? json.artworkId : "";
    if (!artworkId) return NextResponse.json({ error: "Missing artworkId" }, { status: 400 });

    const artwork = getArtwork(artworkId);
    if (!artwork) return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    if (artwork.status !== "available") {
      return NextResponse.json({ error: "Artwork not available" }, { status: 409 });
    }

    let variantId: string | null = artwork.shopify?.variantId ?? null;
    if (!variantId && artwork.shopify?.productHandle) {
      variantId = await productFirstVariantIdByHandle(artwork.shopify.productHandle);
    }
    if (!variantId) {
      return NextResponse.json(
        { error: "No Shopify link configured for this artwork" },
        { status: 400 },
      );
    }

    const existingCartId = req.cookies.get(CART_COOKIE)?.value;
    const quantity = 1;

    const { cartId, checkoutUrl } = existingCartId
      ? await cartAddLine(existingCartId, variantId, quantity)
      : await cartCreateWithLine(variantId, quantity);

    const res = NextResponse.json({ cartId, checkoutUrl });
    res.cookies.set(CART_COOKIE, cartId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (e) {
    if (e instanceof ShopifyError) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

