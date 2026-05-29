// URL-safe base64 helpers used to encode song ids in routes (yt:abc:def
// can't go directly in a URL because of the colons). Same alphabet on
// both sides — server uses Buffer, client uses btoa/atob.

export function encodeBase64Url(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // Browser path
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  // Browser path
  return decodeURIComponent(escape(atob(padded)));
}

// Decode a songId taken from a URL segment. Tolerant of both how we
// encode now (url-safe base64) and older / hand-built links that used a
// percent-encoded literal id (the `:` shows up as %3A). Shared by the
// share page and the OG image route so they decode identically.
export function decodeSongIdParam(s: string): string {
  try {
    return decodeBase64Url(s);
  } catch {
    return decodeURIComponent(s);
  }
}
