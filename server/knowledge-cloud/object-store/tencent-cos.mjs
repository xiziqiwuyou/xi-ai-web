import COS from "cos-nodejs-sdk-v5";
import STS from "qcloud-cos-sts";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  redactKnowledgeValue
} from "../errors.mjs";

function trimEtag(value) {
  const text = String(value || "").trim();
  return text.replace(/^W\//, "").replace(/^"|"$/g, "") || null;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  const expected = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === expected);
  return entry?.[1];
}

function normalizeCosError(error, operation, secrets) {
  if (error instanceof KnowledgeError) return error;
  return new KnowledgeError(
    KNOWLEDGE_ERROR_CODES.OBJECT_STORE_UNAVAILABLE,
    "对象存储暂时不可用",
    {
      status: 502,
      details: {
        operation,
        upstream: redactKnowledgeValue(
          { code: error?.code, statusCode: error?.statusCode, requestId: error?.RequestId },
          { secrets }
        )
      },
      cause: error
    }
  );
}

function createSignedObjectUrl(client, config, {
  objectKey,
  method,
  expiresSeconds,
  query
}) {
  return new Promise((resolve, reject) => {
    client.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: objectKey,
      Sign: true,
      Method: method,
      Protocol: "https:",
      Expires: expiresSeconds,
      ...(query && Object.keys(query).length ? { Query: query } : {})
    }, (error, data) => {
      if (error) return reject(error);
      try {
        const url = new URL(String(data?.Url || ""));
        if (url.protocol !== "https:" || !url.hostname || !url.search) {
          throw new Error("Tencent COS returned an invalid signed object URL");
        }
        resolve(url.toString());
      } catch (validationError) {
        reject(validationError);
      }
    });
  });
}

function sourceDispositionQuery({ versionId, disposition, downloadName }) {
  const mode = disposition === "attachment" ? "attachment" : "inline";
  const query = {};
  if (versionId) query.versionId = String(versionId);
  if (mode === "attachment") {
    const safeName = [...String(downloadName || "download")
      .replace(/[\u0000-\u001f\u007f]/gu, "")
      .trim()]
      .slice(0, 160)
      .join("") || "download";
    const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/gu, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
    query["response-content-disposition"] =
      `attachment; filename*=UTF-8''${encodedName}`;
  } else {
    query["response-content-disposition"] = "inline";
  }
  return query;
}

export function createTencentCosObjectStore(
  config,
  { sts = STS, CosClient = COS, clock = () => new Date() } = {}
) {
  if (!config?.secretId || !config?.secretKey || !config?.bucket || !config?.region) {
    throw new TypeError("Tencent COS object store requires complete configuration");
  }
  const secrets = [config.secretId, config.secretKey];
  const cos = new CosClient({ SecretId: config.secretId, SecretKey: config.secretKey });
  const grantTtlSeconds = Number.isSafeInteger(config.uploadGrantTtlSeconds)
    ? config.uploadGrantTtlSeconds
    : 15 * 60;
  const sourceUrlTtlSeconds = Number.isSafeInteger(config.sourceUrlTtlSeconds)
    ? config.sourceUrlTtlSeconds
    : 5 * 60;

  return Object.freeze({
    bucket: config.bucket,
    region: config.region,
    grantTtlSeconds,
    sourceUrlTtlSeconds,

    async createUploadGrant({ objectKey }) {
      try {
        const policy = sts.getPolicy([
          {
            action: "name/cos:PutObject",
            bucket: config.bucket,
            region: config.region,
            prefix: objectKey
          }
        ]);
        const result = await sts.getCredential({
          secretId: config.secretId,
          secretKey: config.secretKey,
          durationSeconds: grantTtlSeconds,
          policy
        });
        if (
          !result?.credentials?.tmpSecretId ||
          !result.credentials.tmpSecretKey ||
          !result.credentials.sessionToken ||
          !Number.isSafeInteger(Number(result.startTime)) ||
          !Number.isSafeInteger(Number(result.expiredTime)) ||
          Number(result.expiredTime) <= Number(result.startTime)
        ) {
          throw new Error("Tencent STS returned incomplete credentials");
        }
        const credentials = {
          tmpSecretId: result.credentials.tmpSecretId,
          tmpSecretKey: result.credentials.tmpSecretKey,
          sessionToken: result.credentials.sessionToken
        };
        const expiresSeconds = Math.max(
          1,
          Math.min(grantTtlSeconds, Number(result.expiredTime) - Number(result.startTime))
        );
        const temporaryClient = new CosClient({
          SecretId: credentials.tmpSecretId,
          SecretKey: credentials.tmpSecretKey,
          SecurityToken: credentials.sessionToken
        });
        const uploadUrl = await createSignedObjectUrl(temporaryClient, config, {
          objectKey,
          method: "PUT",
          expiresSeconds
        });
        return {
          provider: "tencent-cos",
          bucket: config.bucket,
          region: config.region,
          objectKey,
          startTime: Number(result.startTime),
          expiredTime: Number(result.expiredTime),
          uploadUrl,
          credentials
        };
      } catch (error) {
        throw normalizeCosError(error, "create_upload_grant", secrets);
      }
    },

    async createSourceDownloadUrl({
      objectKey,
      versionId,
      disposition = "inline",
      downloadName,
      expiresSeconds
    }) {
      const requestedTtl = Number(expiresSeconds);
      const ttl = Math.min(
        sourceUrlTtlSeconds,
        Math.max(1, Number.isSafeInteger(requestedTtl) ? requestedTtl : sourceUrlTtlSeconds)
      );
      try {
        const url = await createSignedObjectUrl(cos, config, {
          objectKey,
          method: "GET",
          expiresSeconds: ttl,
          query: sourceDispositionQuery({ versionId, disposition, downloadName })
        });
        const now = clock();
        const createdAt = now instanceof Date ? now : new Date(now);
        return {
          provider: "tencent-cos",
          url,
          expiresInSeconds: ttl,
          expiresAt: new Date(createdAt.getTime() + ttl * 1000).toISOString()
        };
      } catch (error) {
        throw normalizeCosError(error, "create_source_url", secrets);
      }
    },

    async headObject({ objectKey, versionId }) {
      try {
        const result = await cos.headObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: objectKey,
          ...(versionId ? { VersionId: versionId } : {})
        });
        const contentLength = Number(headerValue(result?.headers, "content-length"));
        const contentType = headerValue(result?.headers, "content-type");
        const checksumSha256 = headerValue(result?.headers, "x-cos-checksum-sha256");
        return {
          objectKey,
          bytes: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : null,
          contentType: contentType ? String(contentType) : null,
          etag: trimEtag(result?.ETag || headerValue(result?.headers, "etag")),
          versionId: result?.VersionId || headerValue(result?.headers, "x-cos-version-id") || null,
          checksumSha256: /^[a-f0-9]{64}$/i.test(String(checksumSha256 || ""))
            ? String(checksumSha256).toLowerCase()
            : null
        };
      } catch (error) {
        if (error?.statusCode === 404 || error?.code === "NoSuchKey") {
          throw new KnowledgeError(
            KNOWLEDGE_ERROR_CODES.UPLOAD_NOT_FOUND,
            "尚未检测到已上传文件",
            { status: 409 }
          );
        }
        throw normalizeCosError(error, "head_object", secrets);
      }
    },

    async downloadObjectToFile({ objectKey, versionId, destinationPath, maxBytes }) {
      let bytes = 0;
      const hash = crypto.createHash("sha256");
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.byteLength;
          if (bytes > maxBytes) {
            callback(Object.assign(new Error("COS object exceeded download limit"), {
              code: "KB_OBJECT_DOWNLOAD_LIMIT"
            }));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });
      const output = fs.createWriteStream(destinationPath, { flags: "wx", mode: 0o600 });
      const writer = pipeline(limiter, output);
      try {
        const result = await cos.getObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: objectKey,
          ...(versionId ? { VersionId: versionId } : {}),
          Output: limiter
        });
        await writer;
        return {
          objectKey,
          bytes,
          checksumSha256: hash.digest("hex"),
          etag: trimEtag(result?.ETag || headerValue(result?.headers, "etag")),
          versionId: result?.VersionId || headerValue(result?.headers, "x-cos-version-id") || null
        };
      } catch (error) {
        limiter.destroy();
        output.destroy();
        await writer.catch(() => {});
        await fsp.rm(destinationPath, { force: true }).catch(() => {});
        if (error?.statusCode === 404 || error?.code === "NoSuchKey") {
          throw new KnowledgeError(
            KNOWLEDGE_ERROR_CODES.UPLOAD_NOT_FOUND,
            "源文件已不存在",
            { status: 409 }
          );
        }
        if (error?.code === "KB_OBJECT_DOWNLOAD_LIMIT") {
          throw new KnowledgeError(
            KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE,
            "源文件超过解析下载限制",
            { status: 413 }
          );
        }
        throw normalizeCosError(error, "download_object", secrets);
      }
    },

    async putObjectFromFile({ objectKey, filePath, bytes, contentType }) {
      const body = fs.createReadStream(filePath);
      try {
        const result = await cos.putObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: objectKey,
          Body: body,
          ContentLength: bytes,
          ContentType: contentType
        });
        return {
          objectKey,
          bytes,
          etag: trimEtag(result?.ETag || headerValue(result?.headers, "etag")),
          versionId: result?.VersionId || headerValue(result?.headers, "x-cos-version-id") || null
        };
      } catch (error) {
        body.destroy();
        throw normalizeCosError(error, "put_object", secrets);
      }
    },

    async deleteObject({ objectKey, versionId }) {
      try {
        await cos.deleteObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: objectKey,
          ...(versionId ? { VersionId: versionId } : {})
        });
        return { deleted: true };
      } catch (error) {
        if (error?.statusCode === 404 || error?.code === "NoSuchKey") return { deleted: true };
        throw normalizeCosError(error, "delete_object", secrets);
      }
    }
  });
}
