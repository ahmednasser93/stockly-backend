export const API_KEY = "z5xjUUlsab7zBKntL5QnMzWyPuq2iWsM";
export const API_URL = "https://financialmodelingprep.com/stable";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const json = (data: unknown, status = 200): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
};
