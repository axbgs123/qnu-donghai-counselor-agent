import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION = process.env.QDRANT_COLLECTION?.trim() || "qz_knowledge_chunks";
const VECTOR_SIZE = 512;

export type KnowledgeAccess = { audience: "student" } | { audience: "teacher"; teacherId: string };
export type VectorChunk = { documentId: string; chunkIndex: number; content: string; score: number };

function vectorClient() {
  const url = process.env.QDRANT_URL?.trim();
  if (!url) return null;
  return new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY?.trim() || undefined, checkCompatibility: false });
}

function textFeatures(text: string) {
  const compact = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").slice(0, 30_000);
  const features: string[] = [];
  const chinese = [...compact].filter((char) => /[\u3400-\u9fff]/.test(char));
  for (let index = 0; index < chinese.length; index += 1) {
    features.push(chinese[index]);
    if (index + 1 < chinese.length) features.push(`${chinese[index]}${chinese[index + 1]}`);
  }
  features.push(...compact.match(/[a-z0-9_-]{2,32}/g) ?? []);
  return features;
}

function hashFeature(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function embedKnowledgeText(text: string) {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  for (const feature of textFeatures(text)) {
    const hash = hashFeature(feature);
    vector[hash % VECTOR_SIZE] += (hash & 1) === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function pointId(key: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function ensureCollection(client: QdrantClient) {
  const collections = await client.getCollections();
  if (!collections.collections.some((item) => item.name === COLLECTION)) {
    await client.createCollection(COLLECTION, { vectors: { size: VECTOR_SIZE, distance: "Cosine" } });
    await client.createPayloadIndex(COLLECTION, { field_name: "visibility", field_schema: "keyword", wait: true });
    await client.createPayloadIndex(COLLECTION, { field_name: "ownerTeacherId", field_schema: "keyword", wait: true });
    await client.createPayloadIndex(COLLECTION, { field_name: "documentId", field_schema: "keyword", wait: true });
  }
}

export async function indexKnowledgeDocument(input: {
  documentId: string;
  title: string;
  ownerTeacherId: string;
  visibility: "global" | "teacher_private";
  chunks: string[];
}) {
  const client = vectorClient();
  if (!client) return { indexed: false, reason: "QDRANT_URL 未配置，当前使用数据库关键词检索" };
  try {
    await ensureCollection(client);
    await client.delete(COLLECTION, { filter: { must: [{ key: "documentId", match: { value: input.documentId } }] }, wait: true });
    const batchSize = 60;
    for (let offset = 0; offset < input.chunks.length; offset += batchSize) {
      const points = await Promise.all(input.chunks.slice(offset, offset + batchSize).map(async (content, index) => {
        const chunkIndex = offset + index;
        return {
          id: await pointId(`${input.documentId}:${chunkIndex}`),
          vector: embedKnowledgeText(`${input.title}\n${content}`),
          payload: {
            documentId: input.documentId,
            chunkIndex,
            content: content.slice(0, 2200),
            visibility: input.visibility,
            ownerTeacherId: input.ownerTeacherId,
          },
        };
      }));
      await client.upsert(COLLECTION, { points, wait: true });
    }
    return { indexed: true, chunkCount: input.chunks.length };
  } catch (error) {
    console.error("knowledge vector indexing fallback", error);
    return { indexed: false, reason: "向量库暂不可用，已保留数据库关键词检索" };
  }
}

export async function deleteKnowledgeVectors(documentId: string) {
  const client = vectorClient();
  if (!client) return;
  try {
    await ensureCollection(client);
    await client.delete(COLLECTION, { filter: { must: [{ key: "documentId", match: { value: documentId } }] }, wait: true });
  } catch (error) {
    console.error("knowledge vector delete fallback", error);
  }
}

export async function searchKnowledgeVectors(queryText: string, access: KnowledgeAccess, limit = 10): Promise<VectorChunk[]> {
  const client = vectorClient();
  if (!client || !queryText.trim()) return [];
  try {
    await ensureCollection(client);
    const filter = access.audience === "student"
      ? { must: [{ key: "visibility", match: { value: "global" } }] }
      : { should: [
        { key: "visibility", match: { value: "global" } },
        { must: [
          { key: "visibility", match: { value: "teacher_private" } },
          { key: "ownerTeacherId", match: { value: access.teacherId } },
        ] },
      ] };
    const result = await client.query(COLLECTION, {
      query: embedKnowledgeText(queryText), filter, limit, with_payload: true, score_threshold: access.audience === "student" ? 0.18 : 0.12,
    });
    return result.points.flatMap((point) => {
      const payload = point.payload as Record<string, unknown> | null | undefined;
      if (!payload || typeof payload.documentId !== "string" || typeof payload.content !== "string") return [];
      return [{ documentId: payload.documentId, chunkIndex: Number(payload.chunkIndex ?? 0), content: payload.content, score: Number(point.score ?? 0) }];
    });
  } catch (error) {
    console.error("knowledge vector search fallback", error);
    return [];
  }
}

export async function getKnowledgeVectorStatus() {
  const client = vectorClient();
  if (!client) return { configured: false, available: false };
  try {
    await ensureCollection(client);
    return { configured: true, available: true, collection: COLLECTION };
  } catch {
    return { configured: true, available: false, collection: COLLECTION };
  }
}
