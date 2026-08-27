declare module "proper-lockfile" {
  interface LockOptions {
    readonly lockfilePath: string;
    readonly retries: number;
    readonly stale: number;
    readonly update: number;
    readonly realpath: boolean;
    readonly onCompromised: (error: Error) => void;
  }

  const properLockfile: {
    lock(file: string, options: LockOptions): Promise<() => Promise<void>>;
  };

  export default properLockfile;
}
