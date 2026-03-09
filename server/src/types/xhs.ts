export type XhsParseStatus = 'parsed' | 'partial' | 'failed';

export type XhsErrorCode = 'private_or_blocked' | 'timeout' | 'unsupported_link' | 'unknown';

export interface XhsLocation {
  placeName?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface XhsNormalizedResponse {
  status: XhsParseStatus;
  originalUrl: string;
  resolvedUrl?: string;
  title?: string;
  fullText?: string;
  images?: string[];
  author?: string;
  publishTime?: string;
  location?: XhsLocation;
  warnings?: string[];
  errorCode?: XhsErrorCode;
  errorMessage?: string;
}

export interface ExtractedXhsPost {
  title?: string;
  fullText?: string;
  images?: string[];
  locationText?: string;
  locationAddress?: string;
  lat?: number;
  lng?: number;
  author?: string;
  publishTime?: string;
}
