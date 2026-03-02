export type ArtworkStatus = "available" | "sold" | "not_for_sale";

export type ArtworkCategory = "canvas_large" | "canvas_small" | "paper" | "merch" | "other";

export type ArtistId = string;

export type ArtworkId = string;

export type ShopifyLink = {
  productHandle?: string;
  variantId?: string;
  collectionUrl?: string;
};

export type ArtworkImages = {
  texture: string; // used in WebGL room (<= 2048px)
  full: string; // modal / detail page (<= 3000px)
  thumb: string; // grid thumb (<= 600px)
};

export type Artwork = {
  id: ArtworkId;
  artistId: ArtistId;
  title: string;
  year?: number;
  medium?: string;
  widthCm?: number;
  heightCm?: number;
  aspect?: number; // width/height ratio (from image or dims)
  category: ArtworkCategory;
  status: ArtworkStatus;
  priceEur?: number;
  zoneId: number;
  dominantColor?: string;
  images: ArtworkImages;
  shopify?: ShopifyLink;
  infoBox?: string;
};

export type Artist = {
  id: ArtistId;
  slug: string;
  name: string;
  bioMarkdown: string;
  bioPdf?: string;
  contact?: {
    email?: string;
    phone?: string;
    website?: string;
    instagram?: string;
  };
  links?: { label: string; href: string }[];
  exhibitions?: string[];
};

export type GalleryTheme = "loft" | "modern" | "castle";

export type GalleryZone = {
  id: string;
  title: string;
  theme: GalleryTheme;
  length: number;
  width: number;
  height: number;
  centerX?: number;
  centerZ?: number;
  artistId?: ArtistId;
  accentColor?: string;
  leadArtworkId?: ArtworkId;
  categoryFilter?: ArtworkCategory[];
  artworkIds?: ArtworkId[];
  maxArtworks?: number;
  wallTexture?: string;
  wallTextureAlt?: string;
  wallTextureLeft?: string;
  wallTextureRight?: string;
  wallTextureFront?: string;
  wallTextureBack?: string;
  floorTexture?: string;
  ceilingTexture?: string;
};

export type MuseumGallery = {
  galleryId: string;
  artistId: ArtistId;
  zones: GalleryZone[];
};

export type ArtistRoom = {
  id: string;
  title: string;
  theme: GalleryTheme;
  length: number;
  width: number;
  height: number;
  centerX?: number;
  centerZ?: number;
  accentColor?: string;
  categoryFilter?: ArtworkCategory[];
  artworkIds?: ArtworkId[];
  maxArtworks?: number;
  wallTexture?: string;
  wallTextureAlt?: string;
  wallTextureLeft?: string;
  wallTextureRight?: string;
  wallTextureFront?: string;
  wallTextureBack?: string;
  floorTexture?: string;
  ceilingTexture?: string;
};

export type ArtistPack = {
  artist: Artist;
  rooms: ArtistRoom[];
  artworks?: Artwork[];
};
