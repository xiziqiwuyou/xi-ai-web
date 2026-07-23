export type WorkspaceBackupProviderKind = "webdav" | "s3" | "nas-proxy";

export type WorkspaceBackupCapabilities = {
  list: boolean;
  delete: boolean;
  retention: boolean;
};

export type WorkspaceBackupUpload = {
  name: string;
  archive: Blob;
  checksum: string;
  createdAt: string;
  signal?: AbortSignal;
};

export type WorkspaceRemoteBackup = {
  id: string;
  name: string;
  byteLength: number;
  createdAt: string;
  modifiedAt: string;
  checksum?: string;
};

export interface WorkspaceBackupProvider {
  readonly id: string;
  readonly kind: WorkspaceBackupProviderKind;
  readonly capabilities: WorkspaceBackupCapabilities;
  upload(input: WorkspaceBackupUpload): Promise<WorkspaceRemoteBackup>;
  download(id: string, signal?: AbortSignal): Promise<Blob>;
  list(signal?: AbortSignal): Promise<WorkspaceRemoteBackup[]>;
  remove?(id: string, signal?: AbortSignal): Promise<void>;
}
