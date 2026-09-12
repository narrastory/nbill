import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function isInside(parent, child) {
  return child === parent || child.startsWith(`${parent}\\`) || child.startsWith(`${parent}/`)
}

export async function publishFrontendBuild({ sourceDir, targetDir }) {
  const source = resolve(sourceDir)
  const target = resolve(targetDir)

  if (
    source === target ||
    target === parse(target).root ||
    basename(target).toLowerCase() !== 'public' ||
    isInside(target, source)
  ) {
    throw new Error(`Unsafe frontend publication target: ${target}`)
  }

  try {
    const index = await stat(resolve(source, 'index.html'))
    if (!index.isFile()) throw new Error('index.html is not a file')
  } catch {
    throw new Error(`Frontend build not found at ${source}. Run the frontend build first.`)
  }

  await rm(target, { recursive: true, force: true })
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true })
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const sourceDir = resolve(repositoryRoot, 'frontend', 'dist')
  const targetDir = resolve(repositoryRoot, 'backend', 'public')

  await publishFrontendBuild({ sourceDir, targetDir })
  console.log(`Published frontend build to ${targetDir}`)
}
