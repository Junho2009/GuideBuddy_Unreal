declare const require: (moduleName: string) => any;
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface PuertsArgv {
  getByName(name: string): unknown;
}

interface PuertsModule {
  argv: PuertsArgv;
}

interface MulticastDelegate<T extends (...args: any[]) => void> {
  Add(callback: T): void;
  Remove?(callback: T): void;
}

interface GuideBuddyBridge {
  OnTelemetrySignal: MulticastDelegate<(signalJson: string) => void>;
  GetInitialContextJson(): string;
  GetTelemetryRootDirectory(): string;
  CreateDirectoryTree(absolutePath: string): boolean;
  WriteUtf8File(absolutePath: string, contents: string): boolean;
  GetLastError(): string;
  GetTelemetryStorageDescription?(): string;
  ShowRuntimeStatusMessage?(message: string, isSuccess: boolean): void;
}
