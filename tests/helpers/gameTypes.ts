import ts from 'typescript';

/**
 * The type errors of a game's own source, compiled in memory as `file` against the declarations it
 * imports or references, and nothing else.
 */
export function gameDiagnostics(file: string, source: string): string[] {
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
    };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;

    host.getSourceFile = (name, ...rest) =>
        name === file
            ? ts.createSourceFile(name, source, ts.ScriptTarget.ES2022, true)
            : getSourceFile.call(host, name, ...rest);
    host.fileExists = (name) => name === file || fileExists.call(host, name);
    host.readFile = (name) => (name === file ? source : readFile.call(host, name));

    const program = ts.createProgram([file], options, host);

    return ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((diagnostic) => {
        const { line } = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        return `game.ts:${line + 1} TS${diagnostic.code}: ${message.split('\n')[0]}`;
    });
}
