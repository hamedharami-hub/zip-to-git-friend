import { createServerFn } from "@tanstack/react-start";

export const getFirebaseApiKey = createServerFn({ method: "GET" }).handler(async () => {
  return { apiKey: process.env.GOOGLE_API_KEY ?? "" };
});
