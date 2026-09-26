/**
 * Types shared between the three nodes.
 *
 * The two client nodes reach into the configuration node for its token, its REST
 * helper and its observation parser, so the configuration node's shape is the
 * internal contract between them. It is NOT the published compatibility surface —
 * that is the node type names, the `defaults` keys in each .html and the
 * `password` credential (see .agents/compatibility.md). Everything here may be
 * renamed freely as long as all three nodes agree.
 */
import type { Node, NodeDef, NodeMessage, NodeMessageInFlow } from "node-red";
import type { ErrorCategory } from "./errors";

export type LogFn = (message: string, data?: unknown) => void;

/** Credentials Node-RED stores outside the flow file for the configuration node. */
export interface EaseeCredentials {
  username?: string;
  password?: string;
}

/** The configuration node's saved flow properties. */
export interface EaseeConfigurationDef extends NodeDef {
  username?: string;
  debugLogging?: boolean;
  debugToNodeWarn?: boolean;
}

export interface CredentialsValidation {
  valid: boolean;
  message: string;
}

/** What /accounts/login and /accounts/refresh_token return on success. */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType?: string;
}

/** The problem-details body the Easee API returns on an error. */
export interface ApiErrorBody {
  title?: string;
  errorCodeName?: string;
  detail?: string;
}

/**
 * One observation, as it arrives from the stream or the observations endpoint and
 * as parseObservation() decorates it in place.
 */
export interface ObservationData {
  id?: number;
  dataName?: string;
  value?: unknown;
  origValue?: unknown;
  timestamp?: string;
  observationId?: number;
  dataType?: number;
  dataTypeName?: string;
  valueText?: string;
  valueUnit?: string;
  [key: string]: unknown;
}

export interface UpdateEvent {
  update: string;
}

/**
 * Node-RED's `Node` declares `on` for "input" and "close" only, and redeclaring an
 * overload set in a sub-interface replaces it rather than extending it — so a node
 * interface that adds its own events repeats the "input" and "close" overloads
 * first, using this.
 */
export type InputListener = (
  msg: NodeMessageInFlow,
  send: (msg: NodeMessage | Array<NodeMessage | NodeMessage[] | null>) => void,
  done: (err?: Error) => void,
) => void;

/**
 * The outcome of a re-login started from the editor (EASEE-28). It is sent to the
 * browser as it stands, so it must never carry the password or a token.
 */
export interface ReloginResult {
  ok: boolean;
  /** The HTTP status the admin route answers with. */
  status: number;
  error?: string;
}

export interface EaseeConfigurationNode extends Node<EaseeCredentials> {
  username: string;
  debugLogging: boolean;
  debugToNodeWarn: boolean;

  logInfo: LogFn;
  logDebug: LogFn;
  logError: LogFn;
  logWarn: LogFn;

  validateCredentials(): CredentialsValidation;
  isConfigurationValid(): boolean;

  /** The password, both tokens and the username: never in a message or status (EASEE-26). */
  secrets(): unknown[];
  /** Category of the last failed login; null after a good one (EASEE-26). */
  lastAuthFailure: ErrorCategory | null;
  /** Why ensureAuthentication() would return false: `config`, or lastAuthFailure. */
  authFailureCategory(): ErrorCategory;

  signalRpath: string;
  RestApipath: string;
  StateApipath: string;

  accessToken: string | false;
  refreshToken: string | false;
  tokenExpires: Date;
  tokenIssuedAt: Date;
  /** Token lifetime in seconds; 0 when unknown. */
  tokenLifetime: number;

  checkTokenHandler: ReturnType<typeof setTimeout> | null;
  refreshRetryCount: number;
  maxRefreshRetries: number;
  loginRetryCount: number;
  maxLoginRetries: number;
  /** Fresh logins in a row that failed without a credential rejection (network error, 5xx). */
  transportRetryCount: number;
  authenticationInProgress: boolean;

  RENEWAL_THRESHOLD_PERCENTAGE: number;
  MIN_BUFFER_TIME: number;
  EARLY_RENEWAL_THRESHOLD: number;

  genericCall(url: string, method?: string, body?: unknown): Promise<unknown>;
  doAuthRestCall(
    url: string,
    method?: string,
    headers?: Record<string, string> | null,
    body?: unknown,
  ): Promise<unknown>;
  parseObservation(data: ObservationData, mode?: "id" | "name"): ObservationData;
  ensureAuthentication(): Promise<boolean>;
  checkToken(): Promise<void>;
  doRefreshToken(): Promise<TokenResponse | null | undefined>;
  resetAuthenticationState(): void;
  doLogin(username?: string, password?: string): Promise<TokenResponse>;
  relogin(): Promise<ReloginResult>;

  on(event: "input", listener: InputListener): this;
  on(event: "close", listener: () => void): this;
  on(event: "close", listener: (done: () => void) => void): this;
  on(event: "close", listener: (removed: boolean, done: () => void) => void): this;
  on(event: "start", listener: () => void): this;
  on(event: "update", listener: (msg: UpdateEvent) => void): this;
}
