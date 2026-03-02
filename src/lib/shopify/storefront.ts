import "server-only";

type ShopifyConfig = {
  domain: string;
  token: string;
  apiVersion: string;
};

function configFromEnv(): ShopifyConfig | null {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || "").trim();
  const token = (process.env.SHOPIFY_STOREFRONT_TOKEN || "").trim();
  const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
  if (!domain || !token) return null;
  return { domain: domain.replace(/^https?:\/\//, ""), token, apiVersion };
}

export class ShopifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyError";
  }
}

async function storefrontFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const cfg = configFromEnv();
  if (!cfg) throw new ShopifyError("Shopify Storefront env vars not configured.");

  const url = `https://${cfg.domain}/api/${cfg.apiVersion}/graphql.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Storefront-Access-Token": cfg.token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new ShopifyError(`Storefront API error (${resp.status}): ${txt}`);
  }

  const json = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new ShopifyError(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new ShopifyError("Storefront API returned no data.");
  return json.data;
}

export async function productFirstVariantIdByHandle(handle: string): Promise<string | null> {
  const query = /* GraphQL */ `
    query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    productByHandle: null | { variants: { edges: Array<{ node: { id: string } }> } };
  }>(query, { handle });

  const edge = data.productByHandle?.variants.edges?.[0];
  return edge?.node.id ?? null;
}

export async function cartCreateWithLine(variantId: string, quantity: number): Promise<{ cartId: string; checkoutUrl: string }> {
  const mutation = /* GraphQL */ `
    mutation CartCreate($lines: [CartLineInput!]!) {
      cartCreate(input: { lines: $lines }) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          message
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    cartCreate: {
      cart: null | { id: string; checkoutUrl: string };
      userErrors: Array<{ message: string }>;
    };
  }>(mutation, { lines: [{ merchandiseId: variantId, quantity }] });

  if (data.cartCreate.userErrors?.length) {
    throw new ShopifyError(data.cartCreate.userErrors.map((e) => e.message).join("; "));
  }
  if (!data.cartCreate.cart) throw new ShopifyError("cartCreate returned no cart.");
  return { cartId: data.cartCreate.cart.id, checkoutUrl: data.cartCreate.cart.checkoutUrl };
}

export async function cartAddLine(cartId: string, variantId: string, quantity: number): Promise<{ cartId: string; checkoutUrl: string }> {
  const mutation = /* GraphQL */ `
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          message
        }
      }
    }
  `;

  const data = await storefrontFetch<{
    cartLinesAdd: {
      cart: null | { id: string; checkoutUrl: string };
      userErrors: Array<{ message: string }>;
    };
  }>(mutation, { cartId, lines: [{ merchandiseId: variantId, quantity }] });

  if (data.cartLinesAdd.userErrors?.length) {
    throw new ShopifyError(data.cartLinesAdd.userErrors.map((e) => e.message).join("; "));
  }
  if (!data.cartLinesAdd.cart) throw new ShopifyError("cartLinesAdd returned no cart.");
  return { cartId: data.cartLinesAdd.cart.id, checkoutUrl: data.cartLinesAdd.cart.checkoutUrl };
}

