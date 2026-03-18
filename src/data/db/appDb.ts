import { openDB } from "idb";
import type { AppState } from "../../shared/types/models";

const DB_NAME = "household_webapp_db";
const STORE_NAME = "app_state";
const RECORD_ID = "main";

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export async function loadAppState<T extends AppState>(fallback: T): Promise<T> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, RECORD_ID);
  if (!record?.value) return fallback;
  return { ...fallback, ...record.value } as T;
}

export async function saveAppState(state: AppState): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, { id: RECORD_ID, value: state });
}

export async function clearAppState(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, RECORD_ID);
}
