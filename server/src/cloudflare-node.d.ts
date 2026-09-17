declare module "cloudflare:node" {
  /** Routes a Node HTTP server through the Workers Fetch API. */
  export function httpServerHandler(server: unknown): unknown;
}
