import type { FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
export type Privat = <T>(
  req: FastifyRequest,
  run: (db: PoolClient) => Promise<T>,
) => Promise<T>;
export const id = { type: "string", pattern: "^[1-9][0-9]{0,17}$" };
export const version = { type: "string", pattern: "^(0|[1-9][0-9]{0,17})$" };
export const wort = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: "\\S",
});
export const tag = { type: "string", format: "date" };
export const uuid = { type: "string", format: "uuid" };
export const objekt = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required, additionalProperties: false });
export const email = { type: "string", format: "email", maxLength: 250 };
export const passwort = { type: "string", minLength: 12, maxLength: 512 };
export const token = { type: "string", pattern: "^[a-f0-9]{64}$" };
