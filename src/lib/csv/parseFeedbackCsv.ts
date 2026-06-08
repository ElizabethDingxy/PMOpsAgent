import type { FeedbackItem } from "@/types/product"

export type CsvParseErrorCode =
  | "CSV_EMPTY"
  | "CSV_MISSING_CONTENT"
  | "CSV_TOO_FEW_ROWS"
  | "CSV_INVALID_ROW"

export class CsvParseError extends Error {
  code: CsvParseErrorCode
  fix: string

  constructor(code: CsvParseErrorCode, message: string, fix: string) {
    super(message)
    this.name = "CsvParseError"
    this.code = code
    this.fix = fix
  }
}

export function parseFeedbackCsv(csvText: string): FeedbackItem[] {
  const rows = parseCsvRows(csvText)

  if (rows.length === 0) {
    throw new CsvParseError("CSV_EMPTY", "CSV 文件为空。", "请上传包含表头和用户反馈内容的 CSV 文件。")
  }

  const headers = rows[0].map((header) => normalizeHeader(header))
  const contentIndex = findHeaderIndex(headers, ["content", "反馈内容", "用户反馈", "反馈", "内容", "正文", "text", "comment", "description"])

  if (contentIndex === -1) {
    throw new CsvParseError(
      "CSV_MISSING_CONTENT",
      "CSV 缺少反馈内容字段。",
      "请确认 CSV 表头包含 content、反馈内容、用户反馈、反馈、内容、text 或 comment 中的一个。",
    )
  }

  const idIndex = findHeaderIndex(headers, ["id", "反馈id", "反馈_id", "编号", "序号"])
  const userTypeIndex = findHeaderIndex(headers, ["user_type", "usertype", "用户类型", "用户人群", "人群", "用户"])
  const sourceIndex = findHeaderIndex(headers, ["source", "来源", "反馈来源", "渠道"])
  const createdAtIndex = findHeaderIndex(headers, ["created_at", "createdat", "创建时间", "反馈时间", "时间", "日期"])

  const feedbackItems = rows.slice(1).reduce<FeedbackItem[]>((items, row, index) => {
    const content = getCell(row, contentIndex)

    if (!content && row.every((cell) => cell.trim() === "")) {
      return items
    }

    if (!content) {
      throw new CsvParseError(
        "CSV_INVALID_ROW",
        `第 ${index + 2} 行缺少用户反馈内容。`,
        "请补充该行的反馈内容，或删除空白反馈行后重新上传。",
      )
    }

    items.push({
      id: getCell(row, idIndex) || `F${String(items.length + 1).padStart(3, "0")}`,
      userType: getOptionalCell(row, userTypeIndex),
      source: getOptionalCell(row, sourceIndex),
      content,
      createdAt: getOptionalCell(row, createdAtIndex),
    })

    return items
  }, [])

  if (feedbackItems.length === 0) {
    throw new CsvParseError("CSV_EMPTY", "CSV 没有可用反馈。", "请至少保留 3 条包含反馈内容的用户反馈。")
  }

  if (feedbackItems.length < 3) {
    throw new CsvParseError(
      "CSV_TOO_FEW_ROWS",
      `当前只有 ${feedbackItems.length} 条反馈，少于 3 条。`,
      "请补充更多用户反馈，以便 Agent 能做基础聚类和 MVP 判断。",
    )
  }

  return feedbackItems
}

function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "").trim()
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let currentCell = ""
  let currentRow: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      currentCell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }

      currentRow.push(currentCell.trim())
      rows.push(currentRow)
      currentRow = []
      currentCell = ""
      continue
    }

    currentCell += char
  }

  currentRow.push(currentCell.trim())
  rows.push(currentRow)

  return rows.filter((row) => row.some((cell) => cell.trim() !== ""))
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const candidates = [",", ";", "\t"]

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: countDelimiter(firstLine, delimiter),
    }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ","
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      count += 1
    }
  }

  return count
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, "_")
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias))
  return headers.findIndex((header) => normalizedAliases.includes(header))
}

function getCell(row: string[], index: number) {
  if (index < 0) return ""
  return row[index]?.trim() ?? ""
}

function getOptionalCell(row: string[], index: number) {
  const value = getCell(row, index)
  return value || undefined
}
