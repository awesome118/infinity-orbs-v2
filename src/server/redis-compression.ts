import { gunzipSync, gzipSync } from 'node:zlib';

export const REDIS_COMPRESSION_PREFIX = '__gz:b64__:';

export function compressRedisString(value: string): string {
  if (value.length < 80 || value.startsWith(REDIS_COMPRESSION_PREFIX)) return value;
  try {
    const encoded = REDIS_COMPRESSION_PREFIX + gzipSync(value).toString('base64');
    return encoded.length < value.length ? encoded : value;
  } catch {
    return value;
  }
}

export function decompressRedisString(value: string): string {
  if (!value.startsWith(REDIS_COMPRESSION_PREFIX)) return value;
  try {
    return gunzipSync(Buffer.from(value.slice(REDIS_COMPRESSION_PREFIX.length), 'base64')).toString('utf8');
  } catch {
    return value;
  }
}

function compressString(value: unknown): unknown {
  return typeof value === 'string' ? compressRedisString(value) : value;
}

function decompressString(value: unknown): unknown {
  return typeof value === 'string' ? decompressRedisString(value) : value;
}

function mapStringValues<T extends Record<string, unknown>>(
  values: T,
  transform: (value: unknown) => unknown,
): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) output[key] = transform(value);
  return output as T;
}

type RedisMethod = (...args: unknown[]) => unknown;
const call = (method: unknown, receiver: object, args: unknown[]): unknown =>
  Reflect.apply(method as RedisMethod, receiver, args);

/**
 * Adds the same gzip envelope used by Devvit's redisCompressed client while
 * retaining WATCH/MULTI transactions. The SDK compression proxy does not
 * compress TxClient.set(), so this proxy explicitly handles transaction writes.
 */
export function createRedisCompressionProxy<T extends object>(client: T): T {
  const proxies = new WeakMap<object, object>();

  const wrap = <U extends object>(target: U): U => {
    const existing = proxies.get(target);
    if (existing) return existing as U;

    const proxy = new Proxy(target, {
      get(current, property) {
        const name = String(property);
        const value = Reflect.get(current, property, current) as unknown;
        if (typeof value !== 'function') return value;

        if (name === 'watch') {
          return async (...args: unknown[]) => {
            const transaction = await call(value, current, args) as object;
            return wrap(transaction);
          };
        }
        if (name === 'set') {
          return (key: string, stored: unknown, options?: unknown) =>
            call(value, current, [key, compressString(stored), options]);
        }
        if (name === 'hSet') {
          return (key: string, fields: Record<string, unknown>) =>
            call(value, current, [key, mapStringValues(fields, compressString)]);
        }
        if (name === 'hSetNX') {
          return (key: string, field: string, stored: unknown) =>
            call(value, current, [key, field, compressString(stored)]);
        }
        if (name === 'mSet') {
          return (fields: Record<string, unknown>) =>
            call(value, current, [mapStringValues(fields, compressString)]);
        }
        if (name === 'get') {
          return async (...args: unknown[]) =>
            decompressString(await call(value, current, args));
        }
        if (name === 'hGet') {
          return async (...args: unknown[]) =>
            decompressString(await call(value, current, args));
        }
        if (name === 'hGetAll') {
          return async (...args: unknown[]) => {
            const fields = await call(value, current, args);
            return fields && typeof fields === 'object'
              ? mapStringValues(fields as Record<string, unknown>, decompressString)
              : fields;
          };
        }
        if (name === 'hMGet' || name === 'mGet') {
          return async (...args: unknown[]) => {
            const values = await call(value, current, args);
            return Array.isArray(values) ? values.map(decompressString) : values;
          };
        }
        if (name === 'global') {
          return value && typeof value === 'object' ? wrap(value as object) : value;
        }
        return (value as RedisMethod).bind(current);
      },
    });

    proxies.set(target, proxy);
    return proxy;
  };

  return wrap(client);
}
