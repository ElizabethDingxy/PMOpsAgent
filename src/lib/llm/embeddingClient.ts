export type VectorData = {
  type: "dense" | "sparse"
  dense?: number[]
  sparse?: Record<string, number>
}

/**
 * Tokenize text into Chinese unigrams/bigrams and English/number words.
 * This is a simple, dependency-free tokenizer highly optimized for Chinese and English semantic search.
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const tokens: string[] = []
  const normalized = text.toLowerCase()

  // Extract English words and numbers
  const englishMatches = normalized.match(/[a-z0-9_]+/g) || []
  tokens.push(...englishMatches)

  // Extract Chinese characters and segments
  const chineseMatches = normalized.match(/[\u4e00-\u9fa5]+/g) || []
  for (const part of chineseMatches) {
    const chars = part.split("")
    // 1. Add character unigrams
    tokens.push(...chars)
    // 2. Add character bigrams
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(chars[i] + chars[i + 1])
    }
  }

  return tokens
}

/**
 * Generates local sparse vector based on L2-normalized Term Frequencies.
 */
export function generateLocalSparseVector(text: string): Record<string, number> {
  const tokens = tokenize(text)
  const counts: Record<string, number> = {}

  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1
  }

  // Calculate L2 norm (magnitude)
  let sumSq = 0
  for (const count of Object.values(counts)) {
    sumSq += count * count
  }
  const magnitude = Math.sqrt(sumSq)

  const sparse: Record<string, number> = {}
  if (magnitude > 0) {
    for (const [token, count] of Object.entries(counts)) {
      sparse[token] = count / magnitude
    }
  }

  return sparse
}

/**
 * Calculates cosine similarity between two VectorData representations.
 */
export function getVectorSimilarity(a: VectorData, b: VectorData): number {
  if (a.type !== b.type) {
    // If mismatch, attempt to fallback to word overlap matching
    return calculateSparseOverlap(a, b)
  }

  if (a.type === "dense") {
    if (!a.dense || !b.dense) return 0
    return cosineSimilarityDense(a.dense, b.dense)
  } else {
    if (!a.sparse || !b.sparse) return 0
    return cosineSimilaritySparse(a.sparse, b.sparse)
  }
}

function cosineSimilarityDense(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  if (magnitude === 0) return 0
  return dotProduct / magnitude
}

function cosineSimilaritySparse(vecA: Record<string, number>, vecB: Record<string, number>): number {
  let dotProduct = 0

  // Since both sparse vectors are already L2-normalized, the magnitude is 1.
  // Cosine similarity is simply the dot product.
  for (const [token, weightA] of Object.entries(vecA)) {
    const weightB = vecB[token]
    if (weightB !== undefined) {
      dotProduct += weightA * weightB
    }
  }

  return dotProduct
}

function calculateSparseOverlap(a: VectorData, b: VectorData): number {
  const keysA = a.type === "sparse" && a.sparse ? Object.keys(a.sparse) : []
  const keysB = b.type === "sparse" && b.sparse ? Object.keys(b.sparse) : []

  if (keysA.length === 0 || keysB.length === 0) return 0

  const setB = new Set(keysB)
  let intersect = 0
  for (const k of keysA) {
    if (setB.has(k)) intersect++
  }

  return intersect / Math.sqrt(keysA.length * keysB.length)
}

/**
 * Get embedding vector (dense or sparse VSM fallback).
 */
export async function getVector(text: string): Promise<VectorData> {
  const apiKey = process.env.EMBEDDING_API_KEY?.trim()
  if (apiKey) {
    try {
      const dense = await fetchDenseEmbedding(text, apiKey)
      return { type: "dense", dense }
    } catch (error) {
      console.warn("Embedding API failed, falling back to local VSM:", error)
    }
  }

  return {
    type: "sparse",
    sparse: generateLocalSparseVector(text),
  }
}

/**
 * Fetches dense embedding from OpenAI-compatible API.
 */
async function fetchDenseEmbedding(text: string, apiKey: string): Promise<number[]> {
  const baseUrl = process.env.EMBEDDING_BASE_URL?.trim() || "https://api.openai.com/v1"
  const model = process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      throw new Error(`Embedding API returned HTTP ${response.status}: ${errText}`)
    }

    const payload = await response.json()
    const embedding = payload.data?.[0]?.embedding

    if (!Array.isArray(embedding)) {
      throw new Error("Invalid response format: data[0].embedding is not an array")
    }

    return embedding
  } finally {
    clearTimeout(timeout)
  }
}

export function getEmbeddingEngineStatus() {
  const configured = Boolean(process.env.EMBEDDING_API_KEY?.trim())
  return {
    configured,
    engine: configured ? "Dense Vector (API)" : "Sparse VSM (Local)",
    model: configured ? (process.env.EMBEDDING_MODEL || "text-embedding-3-small") : "TF-IDF Unigram/Bigram",
  }
}
