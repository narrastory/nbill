import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { publishFrontendBuild } from '../../tools/publish-frontend.mjs'

test('publishes a clean frontend build into the backend static directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nbill-publish-'))
  const sourceDir = join(root, 'dist')
  const targetDir = join(root, 'public')

  await mkdir(join(sourceDir, 'assets'), { recursive: true })
  await mkdir(join(targetDir, 'assets'), { recursive: true })
  await writeFile(join(sourceDir, 'index.html'), '<main>NBill</main>')
  await writeFile(join(sourceDir, 'assets', 'app.js'), 'console.log("new")')
  await writeFile(join(targetDir, 'assets', 'stale.js'), 'stale')

  await publishFrontendBuild({ sourceDir, targetDir })

  assert.equal(await readFile(join(targetDir, 'index.html'), 'utf8'), '<main>NBill</main>')
  assert.equal(await readFile(join(targetDir, 'assets', 'app.js'), 'utf8'), 'console.log("new")')
  await assert.rejects(readFile(join(targetDir, 'assets', 'stale.js'), 'utf8'), { code: 'ENOENT' })
})

test('refuses to publish when the frontend build is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nbill-publish-missing-'))

  await assert.rejects(
    publishFrontendBuild({
      sourceDir: join(root, 'missing-dist'),
      targetDir: join(root, 'public'),
    }),
    /Frontend build not found/,
  )
})

test('refuses to clean a target that is not explicitly named public', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nbill-publish-unsafe-'))
  const sourceDir = join(root, 'dist')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'index.html'), '<main>NBill</main>')

  await assert.rejects(
    publishFrontendBuild({ sourceDir, targetDir: join(root, 'unexpected-target') }),
    /Unsafe frontend publication target/,
  )
})
