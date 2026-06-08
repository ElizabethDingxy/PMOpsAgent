import type { BusinessMetric } from "@/types/product"

export type MetricCsvParseErrorCode =
  | "METRIC_CSV_EMPTY"
  | "METRIC_CSV_MISSING_REQUIRED_FIELDS"
  | "METRIC_CSV_INVALID_ROW"

export class MetricCsvParseError extends Error {
  code: MetricCsvParseErrorCode
  fix: string

  constructor(code: MetricCsvParseErrorCode, message: string, fix: string) {
    super(message)
    this.name = "MetricCsvParseError"
    this.code = code
    this.fix = fix
  }
}

export function parseMetricCsv(csvText: string): BusinessMetric[] {
  const rows = parseCsvRows(csvText)

  if (rows.length === 0) {
    throw new MetricCsvParseError("METRIC_CSV_EMPTY", "指标 CSV 文件为空。", "请上传包含 metric 和 value 表头的指标 CSV。")
  }

  const headers = rows[0].map((header) => normalizeHeader(header))
  const metricIndex = findHeaderIndex(headers, ["metric", "指标", "指标名", "指标名称", "name"])
  const valueIndex = findHeaderIndex(headers, ["value", "数值", "值", "当前值"])

  if (metricIndex === -1 || valueIndex === -1) {
    throw new MetricCsvParseError(
      "METRIC_CSV_MISSING_REQUIRED_FIELDS",
      "指标 CSV 缺少 metric 或 value 字段。",
      "请确认 CSV 表头包含 metric,value。可选字段包括 period,segment,note。",
    )
  }

  const periodIndex = findHeaderIndex(headers, ["period", "周期", "时间", "日期"])
  const segmentIndex = findHeaderIndex(headers, ["segment", "分群", "人群", "渠道"])
  const noteIndex = findHeaderIndex(headers, ["note", "备注", "说明", "口径"])

  const metrics = rows.slice(1).reduce<BusinessMetric[]>((items, row, index) => {
    const metric = getCell(row, metricIndex)
    const value = getCell(row, valueIndex)

    if (!metric && !value && row.every((cell) => cell.trim() === "")) {
      return items
    }

    if (!metric || !value) {
      throw new MetricCsvParseError(
        "METRIC_CSV_INVALID_ROW",
        `指标 CSV 第 ${index + 2} 行缺少 metric 或 value。`,
        "请补充该行的指标名和数值，或删除空白指标行后重新上传。",
      )
    }

    items.push({
      metric,
      value,
      period: getOptionalCell(row, periodIndex),
      segment: getOptionalCell(row, segmentIndex),
      note: getOptionalCell(row, noteIndex),
    })

    return items
  }, [])

  if (metrics.length === 0) {
    throw new MetricCsvParseError("METRIC_CSV_EMPTY", "指标 CSV 没有可用指标。", "请至少保留 1 行包含 metric 和 value 的指标数据。")
  }

  return metrics
}

function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "").trim()
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

    if (char === "," && !inQuotes) {
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

function normalizeHeader(header: string) {
  return header.trim().toLowerCase()
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header))
}

function getCell(row: string[], index: number) {
  if (index < 0) return ""
  return row[index]?.trim() ?? ""
}

function getOptionalCell(row: string[], index: number) {
  const value = getCell(row, index)
  return value || undefined
}
