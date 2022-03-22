import * as fs from 'fs'
import * as path from 'path'
import * as process from 'child_process'
import * as util from 'util'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

const exec = util.promisify(process.exec),
  { access, mkdir, readFile, copyFile, unlink } = fs.promises

const tmpDir = '/tmp/vscode-ocaml-reason-format'

async function prepareTmpDir() {
  try {
    await access(tmpDir)
  } catch (e) {
    await mkdir(tmpDir, { recursive: true })
  }
}

function getFullTextRange(textEditor: vscode.TextEditor) {
  const firstLine = textEditor.document.lineAt(0)
  const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1)

  return new vscode.Range(
    0,
    firstLine.range.start.character,
    textEditor.document.lineCount - 1,
    lastLine.range.end.character,
  )
}

export function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration('ocaml-reason-format')
  const rootPath = vscode.workspace.rootPath || ''

  const disposable1 = vscode.languages.registerDocumentFormattingEditProvider(
    'ocaml',
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        P,
      ): Promise<vscode.TextEdit[]> {
        const formatterPath = configuration.get<string | undefined>(
          'ocamlformat',
        )
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'ocamlformat'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

          await prepareTmpDir()
          await exec(
            `cd ${rootPath} && ${formatter} ${filePath} > ${tmpFilePath}`,
          )

          // TODO: Replace this with `document.getText()`, lest it break Format On Save:
          //   <https://github.com/microsoft/vscode/issues/90273#issuecomment-584087026>
          const formattedText = await readFile(tmpFilePath, 'utf8')
          const textRange = getFullTextRange(textEditor)

          return [vscode.TextEdit.replace(textRange, formattedText)]
        } else {
          return []
        }
      },
    },
  )

  const disposable2 = vscode.languages.registerDocumentFormattingEditProvider(
    'reason',
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
      ): Promise<vscode.TextEdit[]> {
        const formatterPath = configuration.get<string | undefined>('refmt')
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'refmt'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

          prepareTmpDir()
          await copyFile(filePath, tmpFilePath)
          await exec(`${formatter} ${tmpFilePath}`)

          // TODO: Replace this with `document.getText()`, lest it break Format On Save:
          //   <https://github.com/microsoft/vscode/issues/90273#issuecomment-584087026>
          const formattedText = await readFile(tmpFilePath, 'utf8')
          const textRange = getFullTextRange(textEditor)

          unlink(tmpFilePath)

          return [vscode.TextEdit.replace(textRange, formattedText)]
        } else {
          return []
        }
      },
    },
  )

  context.subscriptions.push(disposable1, disposable2)
}

export function deactivate() {}
