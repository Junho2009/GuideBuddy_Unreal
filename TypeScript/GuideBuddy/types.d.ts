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
  ShowBattleEndMenu?(title: string, message: string): void;
  ShowCoachingReviewCard?(
    title: string,
    diagnosis: string,
    evidence: string,
    nextAction: string,
    successCondition: string,
    drillTemplateId: string
  ): void;
}

interface CombatControlBridge {
  SetSoulslikeControlsEnabled(isEnabled: boolean): void;
  ConfigureSoulslikeControls(
    moveDeadZone: number,
    lateralPriorityRatio: number,
    actionPrimeWindowSeconds: number,
    lockFacingEnabled: boolean,
    manageDodgeInput: boolean,
    manageAttackInput: boolean,
    manageTargetInput: boolean
  ): void;
  HandlePlayerInput(inputName: string, triggerEvent: string, watchListTag: string): string;
  RequestDodge(): boolean;
  RequestLightAttack(): boolean;
  RequestToggleTargetLock(): boolean;
  RequestFaceLockedTarget(): boolean;
  GetCombatControlSnapshotJson(): string;
  GetLastError(): string;
}

interface SoulslikeControls {
  handleTelemetrySignal(signal: { signal_type: string; payload: Record<string, unknown> }): void;
  getLastSnapshot(): Record<string, unknown>;
}
