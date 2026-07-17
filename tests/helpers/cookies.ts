type CookieHeader = string | string[] | undefined;

const normalizeSetCookie = (headers: CookieHeader): string[] => {
  if (!headers) return [];
  return Array.isArray(headers) ? headers : [headers];
};

export const getSetCookieHeaders = (headers: CookieHeader) => {
  return normalizeSetCookie(headers);
};

export const findCookie = (
  setCookieHeaders: CookieHeader,
  cookieName: string,
) => {
  const cookies = normalizeSetCookie(setCookieHeaders);
  return cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));
};

export const hasCookie = (
  setCookieHeaders: CookieHeader,
  cookieName: string,
) => {
  return Boolean(findCookie(setCookieHeaders, cookieName));
};

export const extractCookieValue = (
  setCookieHeaders: CookieHeader,
  cookieName: string,
) => {
  const cookie = findCookie(setCookieHeaders, cookieName);
  if (!cookie) return null;

  const firstPart = cookie.split(";")[0];
  const value = firstPart.slice(`${cookieName}=`.length);

  return value;
};
