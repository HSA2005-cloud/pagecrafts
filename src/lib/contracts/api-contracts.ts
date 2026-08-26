import type { ErrorCode } from "./error-codes";
import type { Category, FileMap } from "./template";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; detail?: string } };

export interface GenerateSiteRequest {
  projectIntent: Category;
  prompt: string;
  attributes?: {
    tone?: string[];
    paletteHint?: string[];
  };
}

export interface GenerateSiteResponse {
  projectId: string;
  commitSha: string;
  sections: string[];
  warnings: string[];
  generationId: string;
}

export interface GetProjectFilesResponse {
  projectId: string;
  files: FileMap;
  updatedAt: string;
}

export interface PutProjectFilesRequest {
  files: FileMap;
  /** The `updatedAt` this tree was read at. Omit to overwrite unconditionally (R3 D6). */
  expectedUpdatedAt?: string;
}

export interface EditProjectRequest {
  filePath: string;
  instruction: string;
  currentContent: string;
}

export interface EditProjectResponse {
  diff: {
    before: string;
    after: string;
  };
  requiresAccept: true;
  autoCommitSha: string;
}

export interface PublishProjectResponse {
  deploymentId: string;
  status: "pending" | "live" | "failed";
  liveUrl?: string | null;
  error?: string | null;
}

export interface DeploymentResponse {
  status: "pending" | "live" | "failed";
  repoUrl: string | null;
  liveUrl: string | null;
  commitSha: string | null;
  error: string | null;
}
