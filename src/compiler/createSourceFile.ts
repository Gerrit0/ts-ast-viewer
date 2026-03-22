import type {
  CompilerApi,
  CompilerHost,
  CompilerOptions,
  ParseConfigFileHost,
  Program,
  ScriptTarget,
  SourceFile,
  TypeChecker,
} from "./CompilerApi.js";

export function createSourceFiles(api: CompilerApi, files: Record<string, string>, scriptTarget: ScriptTarget) {
  const sourceFiles: Record<string, SourceFile> = Object.fromEntries(
    Object.entries(files).map(([name, code]) => {
      return [name, api.createSourceFile(name, code, scriptTarget, false)];
    }),
  );
  let bindingResult: { typeChecker: TypeChecker; program: Program } | undefined;

  return { sourceFiles, bindingTools: getBindingTools };

  // binding may be disabled, so make this deferred
  function getBindingTools() {
    if (bindingResult == null) {
      bindingResult = getBindingResult();
    }
    return bindingResult;
  }

  function getBindingResult() {
    const files: { [name: string]: SourceFile | undefined } = {
      ...sourceFiles,
      ...api.tsAstViewer.cachedSourceFiles,
    };

    const compilerHost: CompilerHost = {
      getSourceFile: (fileName: string, _languageVersion: ScriptTarget, _onError?: (message: string) => void) => {
        return files[fileName];
      },
      // getSourceFileByPath: (...) => {}, // not providing these will force it to use the file name as the file path
      // getDefaultLibLocation: (...) => {},
      getDefaultLibFileName: (defaultLibOptions: CompilerOptions) => "/" + api.getDefaultLibFileName(defaultLibOptions),
      writeFile: () => {
        // do nothing
      },
      getCurrentDirectory: () => "/",
      getDirectories: (_path: string) => [],
      fileExists: (fileName: string) => files[fileName] != null,
      readFile: (fileName: string) => files[fileName]?.getFullText(),
      getCanonicalFileName: (fileName: string) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      getEnvironmentVariable: () => "",
    };

    const parseConfigHost: ParseConfigFileHost = {
      onUnRecoverableConfigFileDiagnostic: console.error,
      getCurrentDirectory: () => "/",
      useCaseSensitiveFileNames: compilerHost.useCaseSensitiveFileNames(),
      readDirectory(
        rootDir: string,
        _extensions: readonly string[],
        _excludes: readonly string[] | undefined,
        _includes: readonly string[],
        _depth?: number,
      ): readonly string[] {
        // Uses the same check as @typescript/vfs, though we might need to handle sub-directories
        // for this to work properly if the user picks a file with a slash.
        return rootDir === "/" ? Object.keys(files) : [];
      },
      fileExists: compilerHost.fileExists,
      readFile: compilerHost.readFile,
    };

    const commandLine = api.getParsedCommandLineOfConfigFile("/tsconfig.json", {}, parseConfigHost);
    const options = commandLine?.options ?? {
      strict: true,
      target: scriptTarget,
      allowJs: true,
      module: api.ModuleKind.NodeNext,
      moduleResolution: api.ModuleResolutionKind.NodeNext,
      jsx: api.JsxEmit.Preserve,
    };

    const program = api.createProgram([...Object.keys(files)], options, compilerHost);
    const typeChecker = program.getTypeChecker();

    return { typeChecker, program };
  }
}
