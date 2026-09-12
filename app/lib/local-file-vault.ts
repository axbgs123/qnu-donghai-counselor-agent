"use client";

const DATABASE_NAME = "qz-teacher-local-files";
const STORE_NAME = "files";
const DATABASE_VERSION = 1;

export type LocalFileEntry = {
  jobId: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  savedAt: string;
  blob: Blob;
};

function openVault() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地文件库"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "jobId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地文件库"));
  });
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地文件操作失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地文件操作已取消"));
  });
}

export async function saveLocalFile(jobId: string, file: File) {
  const db = await openVault();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      jobId,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
      savedAt: new Date().toISOString(),
      blob: file,
    } satisfies LocalFileEntry);
    await complete(transaction);
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  } finally {
    db.close();
  }
}

export async function getLocalFile(jobId: string) {
  const db = await openVault();
  try {
    return await new Promise<LocalFileEntry | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(jobId);
      request.onsuccess = () => resolve((request.result as LocalFileEntry | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("读取本地文件失败"));
    });
  } finally {
    db.close();
  }
}

export async function getLocalFileIds() {
  const db = await openVault();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error ?? new Error("读取本地文件目录失败"));
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalFile(jobId: string) {
  const db = await openVault();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(jobId);
    await complete(transaction);
  } finally {
    db.close();
  }
}

export async function downloadLocalFile(jobId: string) {
  const entry = await getLocalFile(jobId);
  if (!entry) throw new Error("这份原文件不在当前电脑，请在最初上传的教师电脑上打开");
  const url = URL.createObjectURL(entry.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = entry.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
