import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/server/config";
import type { FileKind, FileStore } from "@/server/adapters/types";

/** Development stand-in for Drive: .data/files/<id> holds the bytes and <id>.json the metadata. */

interface LocalMeta {
  id: string;
  name: string;
  mimeType: string;
  kind: FileKind;
  uploader: string;
}

function filesDir(): string {
  return path.join(process.cwd(), config.localDataDir, "files");
}

const isSafeId = (id: string) => /^[A-Za-z0-9_-]{8,64}$/.test(id);

export const localFileStore: FileStore = {
  async put({ name, mimeType, bytes, kind, uploader }) {
    const id = crypto.randomUUID().replace(/-/g, "");
    await fs.mkdir(filesDir(), { recursive: true });
    await fs.writeFile(path.join(filesDir(), id), bytes);
    const meta: LocalMeta = { id, name, mimeType, kind, uploader };
    await fs.writeFile(path.join(filesDir(), `${id}.json`), JSON.stringify(meta, null, 2));
    return { id };
  },

  async get(id) {
    if (!isSafeId(id)) return null;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(filesDir(), `${id}.json`), "utf8")) as LocalMeta;
      const bytes = new Uint8Array(await fs.readFile(path.join(filesDir(), id)));
      return { mimeType: meta.mimeType, kind: meta.kind, bytes };
    } catch {
      return null;
    }
  },
};
