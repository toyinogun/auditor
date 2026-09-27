/** Expected failures come back as values; throw only for bugs. */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E = string>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
