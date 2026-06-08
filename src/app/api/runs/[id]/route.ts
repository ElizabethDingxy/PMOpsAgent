import { NextResponse } from "next/server"
import { deleteSavedRunById, readSavedRunById, RunStoreError } from "@/lib/runs/runStore"

type RouteContext = {
  params: Promise<unknown>
}

export async function GET(_request: Request, context: RouteContext) {
  const id = await getRouteId(context)

  try {
    const run = await readSavedRunById(id)

    return NextResponse.json({
      ok: true,
      run,
    })
  } catch (error) {
    return handleRunStoreError(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const id = await getRouteId(context)

  try {
    await deleteSavedRunById(id)

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return handleRunStoreError(error)
  }
}

async function getRouteId(context: RouteContext) {
  const params = (await context.params) as {
    id?: string
  }

  return params.id || ""
}

function handleRunStoreError(error: unknown) {
  if (error instanceof RunStoreError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.code === "RUN_NOT_FOUND" ? 404 : 400 },
    )
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "RUN_STORE_FAILED",
        message: "运行记录读取失败。",
      },
    },
    { status: 500 },
  )
}
