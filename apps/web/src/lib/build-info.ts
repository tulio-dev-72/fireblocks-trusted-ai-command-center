export interface BuildInfo {
  version: string;
  mode: string;
  buildTime: string;
  vercelEnv: string;
  gitSha: string;
}

export const BUILD_INFO: BuildInfo = {
  version: __BUILD_INFO__.version,
  mode: __BUILD_INFO__.mode,
  buildTime: __BUILD_INFO__.buildTime,
  vercelEnv: __BUILD_INFO__.vercelEnv,
  gitSha: __BUILD_INFO__.gitSha,
};
