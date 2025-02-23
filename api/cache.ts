// This module implements a naive cache system that stores JSON data in the system's temporary directory.
// If this was meant for production, replace with redis or at least make sure it's on a ramdisk

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const CACHE_DIR = join(Deno.env.get("TMPDIR") || "/tmp", "app_cache");

console.info("CACHE_DIR", CACHE_DIR);

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function getCacheFilePath(key: string): string {
  return join(CACHE_DIR, `${encodeURIComponent(key)}.json`);
}

export async function readCache<T>(key: string): Promise<T | null> {
  await ensureCacheDir();
  const cacheFile = getCacheFilePath(key);

  try {
    const data = await readFile(cacheFile, "utf8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  await ensureCacheDir();
  const cacheFile = getCacheFilePath(key);
  await writeFile(cacheFile, JSON.stringify(data), "utf8");
}
