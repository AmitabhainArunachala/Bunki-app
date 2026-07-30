export async function bunkiDatabase(): Promise<
  (typeof import("cloudflare:workers"))["env"]["DB"]
> {
  const { env } = await import("cloudflare:workers");
  return env.DB;
}
