"use client";

import { useCallback, useState } from "react";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
}

/**
 * An idempotency key for a create action. Keep sending the same key until a create succeeds,
 * then call `renew`, so a retry after a dropped response can never create a duplicate.
 */
export function useRequestKey() {
  const [key, setKey] = useState(newKey);
  const renew = useCallback(() => setKey(newKey()), []);
  return [key, renew] as const;
}
