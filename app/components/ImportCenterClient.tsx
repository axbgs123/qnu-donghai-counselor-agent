"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Download, FileImage, Files, FileSpreadsheet, FileText, History, LoaderCircle, RotateCcw, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClientId } from "../lib/client-id";
import { importDefinitionList, importDefinitions, normalizeImportRow, suggestMapping, type ImportFieldDefinition, type ImportRecordType } from "../lib/import-definitions";
import { convertDocumentToMarkdown, supportsLocalMarkdown } from "../lib/local-document-markdown";
import { deleteLocalFile, getLocalFileIds, saveLocalFile } from "../lib/local-file-vault";

type PreviewRow = { rowNumber: number; values: Record<string, unknown> };
type AnalyzedSheet = {
  name: string; headerRow: number; rowCount: number; headers: string[]; detectedType: ImportRecordType; confidence: number;
  mapping: Record<string, string>; fields: ImportFieldDefinition[]; missingRequired: string[]; preview: PreviewRow[];
};
type Analysis = {
  job: { id: string; fileName: string; fileSize: number; totalRows: number; sheetCount: number; rawFileStored: boolean };
  sheets: AnalyzedSheet[];
};
type ImportJob = { id: string; file_name: string; status: string; total_rows: number; sheet_count: number; created_at: string };
type CommitResult = {
  total: number; inserted: number; updated: number; skipped: number;
  errors: Array<{ rowNumber: number; messages: string[] }>;
  accounts?: { created: number; skipped: number; failed: Array<{ studentNo: string; reason: string }> };
};
type MaterialAnalysis = {
  title: string; category: string; documentType: string; summary: string; extractedText: string;
  people: string[]; studentNos: string[]; dates: Array<{ date: string; event: string }>;
  studentRecords: Array<{ studentNo: string; name: string; className: string; department: string; grade: string; gender: string; phone: string; status: string; tags: string }>;
  tasks: Array<{ title: string; owner: string; dueAt: string; relatedPeople: string[] }>;
  tags: string[]; confidence: number; processingMethod: string; needsReview: boolean;
};
type MaterialResponse = {
  job: { id: string; fileName: string; fileSize: number; rawFileStored: boolean };
  material: MaterialAnalysis;
  recommendedVisibility: "global" | "teacher_private";
  visibilityReason: string;
};
type MaterialCommitResult = { id: string; chunkCount: number; title: string; textLength: number; taskCount: number };
type BatchItem = { id: string; file: File; status: "ready" | "processing" | "done" | "error"; message: string; location?: string };

const structuredFileExtensions = new Set(["xlsx", "xls", "csv", "tsv", "json"]);
const supportedFileExtensions = new Set(["xlsx", "xls", "csv", "tsv", "json", "docx", "pdf", "pptx", "txt", "md", "html", "htm", "rtf", "eml", "xml", "png", "jpg", "jpeg", "webp", "gif"]);
const DIRECT_UPLOAD_LIMIT = 700 * 1024;
const LOCAL_MARKDOWN_CHUNK_SIZE = 60_000;

const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

async function readApiResponse<T>(response: Response, fallback: string): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text) {
    return { error: response.status === 413 ? "文件超过服务器直接上传限制，请使用支持本地转 Markdown 的 PDF、DOCX 或文本格式" : fallback } as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: response.status === 413 ? "文件过大，服务器未接收；请改用本地转 Markdown" : `${fallback}（服务器返回内容异常）` } as T & { error?: string };
  }
}

async function convertScannedPdfWithMineru(file: File, onProgress?: (message: string) => void) {
  onProgress?.("本地未检测到文字，正在调用 MinerU OCR…");
  onProgress?.("正在将扫描件发送到 MinerU 进行 OCR…");
  const encodedName = btoa(String.fromCharCode(...new TextEncoder().encode(file.name)));
  const uploadEndpoint = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3002/mineru-upload"
    : "/ocr/mineru-upload";
  const uploadResponse = await fetch(uploadEndpoint, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || "application/pdf", "x-file-name-base64": encodedName },
    body: file,
  });
  const uploaded = await readApiResponse<{ taskId?: string; mode?: "flash" | "precision" }>(uploadResponse, "扫描件发送失败");
  if (!uploadResponse.ok || !uploaded.taskId || !uploaded.mode) throw new Error(uploaded.error || "扫描件发送失败");
  const deadline = Date.now() + 6 * 60 * 1000;
  let interval = 2_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const statusResponse = await fetch("/api/materials/mineru", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", taskId: uploaded.taskId, mode: uploaded.mode }),
    });
    const status = await readApiResponse<{ state?: string; markdown?: string; resultReady?: boolean; progress?: { extracted_pages?: number; total_pages?: number } }>(statusResponse, "读取OCR进度失败");
    if (!statusResponse.ok) throw new Error(status.error || "读取OCR进度失败");
    if (status.state === "failed") throw new Error(status.error || "MinerU OCR转换失败");
    if (status.state === "done" && status.markdown?.trim()) return { markdown: status.markdown.trim(), method: "MinerU OCR 转 Markdown", pages: status.progress?.total_pages ?? null };
    if (status.state === "done" && status.resultReady) {
      onProgress?.("OCR已完成，正在当前电脑解压Markdown结果…");
      const resultEndpoint = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? `http://localhost:3002/mineru-result?taskId=${encodeURIComponent(uploaded.taskId)}`
        : `/ocr/mineru-result?taskId=${encodeURIComponent(uploaded.taskId)}`;
      const resultResponse = await fetch(resultEndpoint, { credentials: "include" });
      if (!resultResponse.ok) {
        const resultError = await readApiResponse<Record<string, never>>(resultResponse, "OCR结果包下载失败");
        throw new Error(resultError.error || "OCR结果包下载失败");
      }
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await resultResponse.arrayBuffer());
      const markdownName = Object.keys(zip.files).find((name) => /(^|\/)full\.md$/i.test(name))
        ?? Object.keys(zip.files).find((name) => name.toLowerCase().endsWith(".md"));
      const markdown = markdownName ? await zip.file(markdownName)?.async("string") : "";
      if (!markdown?.trim()) throw new Error("MinerU结果包中没有Markdown正文");
      return { markdown: markdown.trim().slice(0, 650_000), method: "MinerU OCR 转 Markdown", pages: status.progress?.total_pages ?? null };
    }
    const progress = status.progress;
    onProgress?.(progress?.total_pages ? `MinerU 正在 OCR（${progress.extracted_pages ?? 0}/${progress.total_pages}页）…` : "MinerU 正在排队并识别扫描件…");
    interval = Math.min(interval * 1.5, 10_000);
  }
  throw new Error("MinerU OCR等待超时，请稍后重试");
}

export function ImportCenterClient({
  initialType,
  knowledgeOnly = false,
  administratorKnowledge = false,
  onCommitted,
}: {
  initialType?: ImportRecordType;
  knowledgeOnly?: boolean;
  administratorKnowledge?: boolean;
  onCommitted?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "mapping" | "committing" | "done" | "material-review" | "material-committing" | "material-done">("idle");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [recordType, setRecordType] = useState<ImportRecordType>(initialType ?? "students");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [material, setMaterial] = useState<MaterialResponse | null>(null);
  const [materialResult, setMaterialResult] = useState<MaterialCommitResult | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialSummary, setMaterialSummary] = useState("");
  const [materialVisibility, setMaterialVisibility] = useState<"global" | "teacher_private">(administratorKnowledge ? "global" : "teacher_private");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [localFileIds, setLocalFileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/imports").then((response) => response.json()).then((data: { jobs?: ImportJob[] }) => setJobs(data.jobs ?? [])).catch(() => undefined);
    getLocalFileIds().then((ids) => setLocalFileIds(new Set(ids))).catch(() => undefined);
  }, []);

  const keepOriginalOnThisComputer = async (jobId: string, file: File) => {
    if (file.size > 50 * 1024 * 1024) return false;
    try {
      await saveLocalFile(jobId, file);
      setLocalFileIds((current) => new Set(current).add(jobId));
      return true;
    } catch (caught) {
      await fetch(`/api/imports?id=${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
      throw new Error(caught instanceof Error ? `原文件无法保存在当前电脑：${caught.message}` : "原文件无法保存在当前电脑");
    }
  };

  const analyzeKnowledgeFile = async (file: File, onProgress?: (message: string) => void) => {
    if (file.size <= DIRECT_UPLOAD_LIMIT) {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/materials/analyze", { method: "POST", body: form });
      const data = await readApiResponse<MaterialResponse>(response, "资料识别失败");
      if (!response.ok || !data.job) throw new Error(data.error || "资料识别失败");
      return data;
    }
    if (!supportsLocalMarkdown(file)) {
      throw new Error("该大文件暂不能在浏览器本地转换。大文件请使用 PDF、DOCX、Markdown 或文本格式；图片和表格请压缩到 700KB 以下后导入");
    }
    onProgress?.("正在当前电脑将文件转换为 Markdown…");
    let converted;
    try {
      converted = await convertDocumentToMarkdown(file);
    } catch (caught) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (extension !== "pdf") throw caught;
      converted = await convertScannedPdfWithMineru(file, onProgress);
    }
    const startResponse = await fetch("/api/materials/local-extraction", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", fileName: file.name, fileSize: file.size, mimeType: file.type }),
    });
    const started = await readApiResponse<{ jobId?: string }>(startResponse, "创建本地导入任务失败");
    if (!startResponse.ok || !started.jobId) throw new Error(started.error || "创建本地导入任务失败");
    try {
      const chunks = Math.ceil(converted.markdown.length / LOCAL_MARKDOWN_CHUNK_SIZE);
      for (let index = 0; index < chunks; index += 1) {
        onProgress?.(`正在写入 Markdown 检索内容（${index + 1}/${chunks}）…`);
        const response = await fetch("/api/materials/local-extraction", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "chunk", jobId: started.jobId, chunkIndex: index, text: converted.markdown.slice(index * LOCAL_MARKDOWN_CHUNK_SIZE, (index + 1) * LOCAL_MARKDOWN_CHUNK_SIZE) }),
        });
        const data = await readApiResponse<{ accepted?: boolean }>(response, "Markdown 分块写入失败");
        if (!response.ok || !data.accepted) throw new Error(data.error || "Markdown 分块写入失败");
      }
      onProgress?.("正在生成摘要、分类和检索索引…");
      const finishResponse = await fetch("/api/materials/local-extraction", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finish", jobId: started.jobId, processingMethod: converted.method }),
      });
      const finished = await readApiResponse<MaterialResponse>(finishResponse, "Markdown 资料识别失败");
      if (!finishResponse.ok || !finished.job) throw new Error(finished.error || "Markdown 资料识别失败");
      return finished;
    } catch (caught) {
      await fetch(`/api/imports?id=${encodeURIComponent(started.jobId)}`, { method: "DELETE" }).catch(() => undefined);
      throw caught;
    }
  };

  const activeSheet = analysis?.sheets.find((sheet) => sheet.name === sheetName) ?? analysis?.sheets[0];
  const definition = importDefinitions[recordType];
  const missingRequired = definition.fields.filter((field) => field.required && !mapping[field.key]);
  const mappedFields = definition.fields.filter((field) => mapping[field.key]);
  const mappedPreview = useMemo(() => activeSheet?.preview.map((preview) => ({
    rowNumber: preview.rowNumber,
    values: normalizeImportRow(recordType, preview.values, mapping),
  })) ?? [], [activeSheet, mapping, recordType]);

  const selectSheet = (name: string) => {
    const sheet = analysis?.sheets.find((item) => item.name === name);
    if (!sheet) return;
    setSheetName(name);
    setRecordType(sheet.detectedType);
    setMapping(sheet.mapping);
    setResult(null);
  };

  const changeType = (nextType: ImportRecordType) => {
    setRecordType(nextType);
    setMapping(activeSheet ? suggestMapping(activeSheet.headers, importDefinitions[nextType]) : {});
    setResult(null);
  };

  const analyzeFile = async (file?: File) => {
    if (!file) return;
    setError(""); setResult(null); setPhase("analyzing");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isStructured = structuredFileExtensions.has(extension) && !administratorKnowledge && !knowledgeOnly;
      if (!isStructured) {
        const data = await analyzeKnowledgeFile(file);
        data.job.rawFileStored = await keepOriginalOnThisComputer(data.job.id, file);
        setAnalysis(null); setMaterial(data); setMaterialTitle(data.material.title); setMaterialCategory(data.material.category); setMaterialSummary(data.material.summary); setMaterialVisibility(administratorKnowledge ? "global" : data.recommendedVisibility || "teacher_private");
        setPhase("material-review");
        return;
      }
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/imports/analyze", { method: "POST", body: form });
      const data = await readApiResponse<Analysis>(response, "文件分析失败");
      if (!response.ok || !data.job) throw new Error(data.error ?? "文件分析失败");
      data.job.rawFileStored = await keepOriginalOnThisComputer(data.job.id, file);
      setAnalysis(data);
      const first = data.sheets[0];
      setSheetName(first.name);
      setRecordType(initialType ?? first.detectedType);
      setMapping(initialType ? suggestMapping(first.headers, importDefinitions[initialType]) : first.mapping);
      setPhase("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件分析失败");
      setPhase("idle");
    }
  };

  const chooseFiles = (files?: FileList | File[] | null) => {
    if (!files?.length) return;
    const incoming = [...files];
    const accepted = incoming.filter((file) => supportedFileExtensions.has(file.name.split(".").pop()?.toLowerCase() ?? ""));
    const rejected = incoming.filter((file) => !accepted.includes(file));
    const selected = accepted.map((file) => ({ id: createClientId(), file, status: "ready" as const, message: "等待导入" }));
    setBatchItems((current) => [...current, ...selected].slice(0, 30));
    setError(rejected.length ? `已忽略 ${rejected.length} 个不支持的文件：${rejected.slice(0, 3).map((file) => file.name).join("、")}` : "");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (phase === "idle" && !batchRunning) setDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = phase === "idle" && !batchRunning ? "copy" : "none";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (phase !== "idle" || batchRunning) return;
    chooseFiles(event.dataTransfer.files);
  };

  const updateBatchItem = (id: string, update: Partial<Omit<BatchItem, "id" | "file">>) => {
    setBatchItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  };

  const runBatchImport = async () => {
    const queue = batchItems.filter((item) => item.status === "ready" || item.status === "error");
    if (!queue.length || batchRunning) return;
    setBatchRunning(true); setError("");
    let committedAny = false;
    for (const item of queue) {
      updateBatchItem(item.id, { status: "processing", message: "正在识别、清洗并归档…" });
      try {
        const form = new FormData(); form.append("file", item.file);
        const extension = item.file.name.split(".").pop()?.toLowerCase() ?? "";
        if (structuredFileExtensions.has(extension) && !administratorKnowledge && !knowledgeOnly) {
          const response = await fetch("/api/imports/analyze", { method: "POST", body: form });
          const data = await readApiResponse<Analysis>(response, "表格识别失败");
          if (!response.ok || !data.job) throw new Error(data.error || "表格识别失败");
          await keepOriginalOnThisComputer(data.job.id, item.file);
          let total = 0; let inserted = 0; let updated = 0; let skipped = 0; let accountsCreated = 0;
          const locations = new Set<string>();
          for (const sheet of data.sheets) {
            const type = initialType ?? sheet.detectedType;
            const sheetMapping = initialType ? suggestMapping(sheet.headers, importDefinitions[type]) : sheet.mapping;
            const missing = importDefinitions[type].fields.filter((field) => field.required && !sheetMapping[field.key]);
            if (missing.length) throw new Error(`${sheet.name} 缺少可识别字段：${missing.map((field) => field.label).join("、")}`);
            const committed = await fetch("/api/imports/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: data.job.id, sheetName: sheet.name, recordType: type, mapping: sheetMapping }) });
            const saved = await committed.json() as { result?: CommitResult; error?: string };
            if (!committed.ok || !saved.result) throw new Error(saved.error || `${sheet.name}保存失败`);
            total += saved.result.total; inserted += saved.result.inserted; updated += saved.result.updated; skipped += saved.result.skipped;
            accountsCreated += saved.result.accounts?.created ?? 0;
            locations.add(type === "students" ? "学生档案" : importDefinitions[type].label);
          }
          updateBatchItem(item.id, { status: "done", message: `${total}行：新增${inserted}、更新${updated}${skipped ? `、跳过${skipped}` : ""}${accountsCreated ? `；自动创建${accountsCreated}个学生账号` : ""}`, location: [...locations].join("、") });
        } else {
          const data = await analyzeKnowledgeFile(item.file, (message) => updateBatchItem(item.id, { message }));
          await keepOriginalOnThisComputer(data.job.id, item.file);
          if (!knowledgeOnly && (initialType === "students" || data.material.studentRecords.length)) {
            const committed = await fetch("/api/imports/material-students", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: data.job.id, confirmed: true }) });
            const saved = await committed.json() as { result?: CommitResult; error?: string };
            if (!committed.ok || !saved.result) throw new Error(saved.error || "学生档案保存失败");
            updateBatchItem(item.id, { status: "done", message: `${saved.result.total}名：新增${saved.result.inserted}、更新${saved.result.updated}${saved.result.skipped ? `、跳过${saved.result.skipped}` : ""}${saved.result.accounts?.created ? `；自动创建${saved.result.accounts.created}个学生账号` : ""}`, location: "学生档案" });
            continue;
          }
          const committed = await fetch("/api/materials/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: data.job.id, title: data.material.title, category: data.material.category, summary: data.material.summary, visibility: administratorKnowledge ? "global" : data.recommendedVisibility, visibilityReason: administratorKnowledge ? "平台管理员确认为普遍通用资料" : data.visibilityReason, confirmed: true }) });
          const saved = await committed.json() as { result?: MaterialCommitResult; error?: string };
          if (!committed.ok || !saved.result) throw new Error(saved.error || "资料保存失败");
          const linked = data.material.studentNos.length ? `，已关联${data.material.studentNos.length}个学号` : "";
          updateBatchItem(item.id, { status: "done", message: `已提取${saved.result.textLength}字并拆分${saved.result.chunkCount}段${linked}`, location: "助手资料库" });
          committedAny = true;
        }
      } catch (caught) {
        updateBatchItem(item.id, { status: "error", message: caught instanceof Error ? caught.message : "导入失败" });
      }
    }
    setBatchRunning(false);
    if (committedAny) onCommitted?.();
    fetch("/api/imports").then((response) => response.json()).then((data: { jobs?: ImportJob[] }) => setJobs(data.jobs ?? [])).catch(() => undefined);
  };

  const commitMaterial = async () => {
    if (!material || !materialTitle.trim() || !materialCategory.trim() || !materialSummary.trim()) return;
    setError(""); setPhase("material-committing");
    try {
      if (!knowledgeOnly && (initialType === "students" || material.material.studentRecords.length)) {
        const response = await fetch("/api/imports/material-students", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: material.job.id, confirmed: true }) });
        const data = await response.json() as { result?: CommitResult; error?: string };
        if (!response.ok || !data.result) throw new Error(data.error ?? "学生档案保存失败");
        setRecordType("students"); setResult(data.result); setPhase("done");
        setJobs((current) => [{ id: material.job.id, file_name: material.job.fileName, status: "committed", total_rows: data.result!.total, sheet_count: 1, created_at: new Date().toISOString() }, ...current.filter((job) => job.id !== material.job.id)].slice(0, 12));
        return;
      }
      const response = await fetch("/api/materials/commit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: material.job.id, title: materialTitle, category: materialCategory, summary: materialSummary, visibility: materialVisibility, visibilityReason: materialVisibility === material.recommendedVisibility ? material.visibilityReason : "上传教师手动调整资料范围", confirmed: true }),
      });
      const data = await response.json() as { result?: MaterialCommitResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "资料保存失败");
      setMaterialResult(data.result); setPhase("material-done"); onCommitted?.();
      setJobs((current) => [{ id: material.job.id, file_name: material.job.fileName, status: "committed", total_rows: 1, sheet_count: 1, created_at: new Date().toISOString() }, ...current.filter((job) => job.id !== material.job.id)].slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "资料保存失败");
      setPhase("material-review");
    }
  };

  const commit = async () => {
    if (!analysis || !activeSheet || missingRequired.length) return;
    setError(""); setPhase("committing");
    try {
      const response = await fetch("/api/imports/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: analysis.job.id, sheetName: activeSheet.name, recordType, mapping }) });
      const data = await response.json() as { result?: CommitResult; error?: string; errors?: CommitResult["errors"] };
      if (!response.ok || !data.result) throw new Error(data.error ?? "保存失败");
      setResult(data.result); setPhase("done");
      setJobs((current) => [{ id: analysis.job.id, file_name: analysis.job.fileName, status: "committed", total_rows: activeSheet.rowCount, sheet_count: analysis.job.sheetCount, created_at: new Date().toISOString() }, ...current.filter((job) => job.id !== analysis.job.id)].slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
      setPhase("mapping");
    }
  };

  const reset = () => { setAnalysis(null); setMaterial(null); setMaterialResult(null); setMaterialTitle(""); setMaterialCategory(""); setMaterialSummary(""); setMaterialVisibility(administratorKnowledge ? "global" : "teacher_private"); setSheetName(""); setMapping({}); setResult(null); setError(""); setPhase("idle"); if (fileRef.current) fileRef.current.value = ""; };
  const removeJob = async (job: ImportJob) => {
    if (!window.confirm(`确定删除“${job.file_name}”及本次导入的数据吗？`)) return;
    const response = await fetch(`/api/imports?id=${encodeURIComponent(job.id)}`, { method: "DELETE" });
    if (response.ok) {
      await deleteLocalFile(job.id).catch(() => undefined);
      setLocalFileIds((current) => { const next = new Set(current); next.delete(job.id); return next; });
      setJobs((current) => current.filter((item) => item.id !== job.id));
    }
  };
  const downloadErrorReport = () => {
    if (!result?.errors.length) return;
    const csv = `\uFEFF原行号,错误原因\n${result.errors.map((item) => `${item.rowNumber},"${item.messages.join("；").replace(/"/g, '""')}"`).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "导入错误报告.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  const materialIsStudentImport = Boolean(material && !knowledgeOnly && (initialType === "students" || material.material.studentRecords.length));

  return <div className="import-layout">
    <section className="import-main">
      <div className="import-steps panel" aria-label="导入步骤">
        {["选择文件", "识别与映射", "校验保存"].map((label, index) => {
          const activeIndex = phase === "idle" || phase === "analyzing" ? 0 : ["mapping", "committing", "material-review", "material-committing"].includes(phase) ? 1 : 2;
          return <div className={index <= activeIndex ? "active" : ""} key={label}><span>{index < activeIndex ? "✓" : index + 1}</span><b>{label}</b>{index < 2 && <i/>}</div>;
        })}
      </div>

      {phase === "idle" || phase === "analyzing" ? <section
        className={`import-upload panel${dragActive ? " drag-active" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input ref={fileRef} multiple type="file" accept=".xlsx,.xls,.csv,.tsv,.json,.docx,.pdf,.pptx,.txt,.md,.html,.htm,.rtf,.eml,.xml,.png,.jpg,.jpeg,.webp,.gif" onChange={(event) => chooseFiles(event.target.files)} />
        <span><UploadCloud size={30}/></span>
        <h2>{phase === "analyzing" ? "正在读取并理解资料…" : dragActive ? "松开鼠标，加入待导入列表" : initialType === "students" ? "批量添加学生档案" : administratorKnowledge ? "上传学校通用资料" : knowledgeOnly ? "上传知识资料" : "一次选择多份资料"}</h2>
        <p>{initialType === "students" ? "学生表格、Word、PDF、文本和名单截图可以混合选择；确认导入后自动保存学生档案并创建登录账号，账号为学号、初始密码为姓名全拼。" : administratorKnowledge ? "支持批量上传表格、Word、PDF、PPT、文本和图片；确认后的内容将作为学生智能问答的学校资料依据。" : knowledgeOnly ? "表格、Word、PDF、PPT、文本和图片均按知识资料识别；确认后进入当前教师的助手资料库。" : "表格、Word、PDF、PPT 和聊天截图可以混合选择；原文件只保存在当前教师电脑，可检索内容进入资料库。"}</p>
        <button className="primary-button" disabled={phase === "analyzing" || batchRunning} onClick={() => fileRef.current?.click()}><Files size={16}/>选择一个或多个文件</button>
        <b className="import-drop-hint">也可以把文件直接拖到此区域</b>
        <small>最多同时选择30个文件；PDF、DOCX 大文件会先在本机转 Markdown（教师100MB、管理员300MB）；扫描版PDF会调用 MinerU OCR。请保留电脑中的源文件。</small>
      </section> : null}

      {phase === "idle" && batchItems.length ? <section className="batch-import-panel panel"><header><div><h2>待导入文件</h2><p>系统将逐个识别、清洗、拆分并写入对应业务位置。</p></div><b>{batchItems.length}份</b></header><div>{batchItems.map((item) => <article key={item.id} className={item.status}><span>{item.status === "processing" ? <LoaderCircle className="spin" size={16}/> : item.status === "done" ? <CheckCircle2 size={16}/> : item.status === "error" ? <AlertCircle size={16}/> : <FileText size={16}/>}</span><p><b>{item.file.name}</b><small>{item.message}</small></p>{item.location && <em>已保存到：{item.location}</em>}<button disabled={batchRunning} onClick={() => setBatchItems((current) => current.filter((currentItem) => currentItem.id !== item.id))} aria-label={`移除${item.file.name}`}><Trash2 size={14}/></button></article>)}</div><footer>{batchItems.length === 1 && batchItems[0].status === "ready" ? <button className="secondary-button" onClick={() => { const file = batchItems[0].file; setBatchItems([]); void analyzeFile(file); }}>逐项核对后导入</button> : null}<button className="primary-button" disabled={batchRunning || !batchItems.some((item) => item.status === "ready" || item.status === "error")} onClick={runBatchImport}>{batchRunning ? <LoaderCircle className="spin" size={15}/> : <CheckCircle2 size={15}/>}确认并批量导入</button></footer></section> : null}

      {analysis && activeSheet && (phase === "mapping" || phase === "committing") ? <>
        <section className="import-file-bar panel"><span><FileSpreadsheet size={20}/></span><div><b>{analysis.job.fileName}</b><small>{formatSize(analysis.job.fileSize)} · {analysis.job.sheetCount}个工作表 · 共{analysis.job.totalRows}行</small></div><em>{analysis.job.rawFileStored ? "原件已存本机" : "数据已暂存"}</em><button onClick={reset}><RotateCcw size={14}/>重新选择</button></section>
        {analysis.sheets.length > 1 && <div className="import-sheet-tabs">{analysis.sheets.map((sheet) => <button className={sheet.name === activeSheet.name ? "active" : ""} onClick={() => selectSheet(sheet.name)} key={sheet.name}>{sheet.name}<small>{sheet.rowCount}行</small></button>)}</div>}
        <section className="import-detection panel">
          <div><small>识别的业务类型</small><select value={recordType} onChange={(event) => changeType(event.target.value as ImportRecordType)}>{importDefinitionList.map((item) => <option value={item.type} key={item.type}>{item.label}</option>)}</select><p>{definition.description}</p></div>
          <div className="confidence"><span style={{ "--confidence": `${Math.round(activeSheet.confidence * 100)}%` } as React.CSSProperties}/><b>{Math.round(activeSheet.confidence * 100)}%</b><small>自动识别置信度</small></div>
          <a className="secondary-button" href={`/api/imports/template?type=${recordType}`}><Download size={14}/>下载标准模板</a>
        </section>
        <section className="import-mapping panel">
          <header><div><h2>字段映射</h2><p>左侧是系统字段，右侧选择表格中的对应列；带 * 的字段必须确认。</p></div><span className={missingRequired.length ? "warning" : "ready"}>{missingRequired.length ? `${missingRequired.length}个必填字段未映射` : "必填字段已完整"}</span></header>
          <div className="mapping-grid">{definition.fields.map((field) => <label key={field.key}><span>{field.label}{field.required && <b>*</b>}<small>{field.type === "date" ? "日期" : field.type === "number" ? "数字" : field.type === "student_no" ? "唯一学号" : "文本"}</small></span><ArrowRight size={14}/><select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">不导入此字段</option>{activeSheet.headers.map((header) => <option value={header} key={header}>{header}</option>)}</select></label>)}</div>
        </section>
        <section className="import-preview panel">
          <header><div><h2>导入预览</h2><p>展示前{mappedPreview.length}行映射结果；保存时将校验全部{activeSheet.rowCount}行。</p></div><span><ShieldCheck size={15}/>逐行校验</span></header>
          <div className="import-preview-table"><table><thead><tr><th>原行号</th>{mappedFields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{mappedPreview.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{mappedFields.map((field) => <td key={field.key}>{row.values[field.key] || <em>空</em>}</td>)}</tr>)}</tbody></table></div>
          <footer><p><CheckCircle2 size={16}/><span><b>保存策略</b>正确行写入，重复记录更新；错误行跳过并生成报告，不会静默写入。</span></p><button className="primary-button" disabled={Boolean(missingRequired.length) || phase === "committing"} onClick={commit}>{phase === "committing" ? <LoaderCircle className="spin" size={16}/> : <CheckCircle2 size={16}/>}确认导入 {activeSheet.rowCount} 行</button></footer>
        </section>
      </> : null}

      {material && (phase === "material-review" || phase === "material-committing") ? <>
        <section className="import-file-bar panel"><span>{/\.(png|jpe?g|webp|gif)$/i.test(material.job.fileName) ? <FileImage size={20}/> : <FileText size={20}/>}</span><div><b>{material.job.fileName}</b><small>{formatSize(material.job.fileSize)} · {material.material.processingMethod} · 已提取 {material.material.extractedText.length.toLocaleString()} 字</small></div><em>{material.job.rawFileStored ? "原件已存本机" : "内容已暂存"}</em><button onClick={reset}><RotateCcw size={14}/>重新选择</button></section>
        <section className="material-review panel">
          <header><div><small>资料智能识别</small><h2>{materialIsStudentImport ? "核对后进入学生档案" : "核对后进入助手资料库"}</h2><p>AI 只负责整理，不会在你确认前写入正式数据区。</p></div><div className="material-confidence"><strong>{Math.round(material.material.confidence * 100)}%</strong><span>识别置信度</span></div></header>
          {!knowledgeOnly && (initialType === "students" || material.material.studentRecords.length > 0) && <div className="material-student-preview"><b>识别到 {material.material.studentRecords.length} 名学生</b>{material.material.studentRecords.length ? material.material.studentRecords.slice(0, 12).map((student) => <span key={student.studentNo}>{student.studentNo} · {student.name} · {student.className}</span>) : <p>未识别到同时包含学号、姓名和班级的记录，请换用更清晰的文件或截图。</p>}</div>}
          <div className="material-edit-grid">
            <label><span>资料标题 *</span><input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} /></label>
            <label><span>业务分类 *</span><input value={materialCategory} onChange={(event) => setMaterialCategory(event.target.value)} /></label>
            <label className="wide"><span>内容摘要 *</span><textarea value={materialSummary} onChange={(event) => setMaterialSummary(event.target.value)} /></label>
            {!materialIsStudentImport && (administratorKnowledge ? <fieldset className="material-visibility wide"><legend>学生智能体使用范围</legend><label className="selected"><input type="radio" checked readOnly/><span><b>普遍通用 · 已确认</b><small>保存后，学生智能体可检索这份资料；回答时会同时展示资料来源。</small></span></label><p>请在保存前核对标题、摘要和下方提取原文，避免把班级内部材料作为全校通用依据。</p></fieldset> : <fieldset className="material-visibility wide"><legend>智能体可使用范围 *</legend><label className={materialVisibility === "global" ? "selected" : ""}><input type="radio" name="visibility" checked={materialVisibility === "global"} onChange={() => setMaterialVisibility("global")}/><span><b>普遍通用</b><small>其他教师和学生提问时也可引用，例如学校制度、公开通知和通用流程。</small></span></label><label className={materialVisibility === "teacher_private" ? "selected" : ""}><input type="radio" name="visibility" checked={materialVisibility === "teacher_private"} onChange={() => setMaterialVisibility("teacher_private")}/><span><b>教师专用</b><small>仅当前上传教师的智能助手可检索，例如班级名单、谈话材料和内部安排。</small></span></label><p>智能建议：{material.visibilityReason}</p></fieldset>)}
          </div>
          <div className="material-facts">
            <article><b>涉及人员</b><p>{material.material.people.length ? material.material.people.join("、") : "未明确识别"}</p></article>
            <article><b>关联学号</b><p>{material.material.studentNos.length ? material.material.studentNos.join("、") : "未明确识别"}</p></article>
            <article><b>日期事件</b>{material.material.dates.length ? material.material.dates.slice(0, 6).map((item, index) => <p key={`${item.date}-${index}`}><span>{item.date}</span>{item.event}</p>) : <p>未明确识别</p>}</article>
            <article><b>识别待办</b>{material.material.tasks.length ? material.material.tasks.slice(0, 8).map((task, index) => <p key={`${task.title}-${index}`}>□ {task.title}{task.dueAt ? <span>{task.dueAt}</span> : null}</p>) : <p>资料中没有明确待办</p>}</article>
          </div>
          <details className="material-text-preview"><summary>查看提取原文（{material.material.extractedText.length.toLocaleString()}字）</summary><pre>{material.material.extractedText.slice(0, 12000)}{material.material.extractedText.length > 12000 ? "\n\n……仅预览前12000字，完整内容会保存并分段检索。" : ""}</pre></details>
          <footer><p><ShieldCheck size={16}/><span><b>保存内容</b>{materialIsStudentImport ? "原件保存在本机；学号、姓名、班级及已识别字段写入学生档案。" : "原件保存在本机；提取文字、摘要和检索索引保存到平台数据库。"}</span></p><button className="primary-button" disabled={phase === "material-committing" || !materialTitle.trim() || !materialCategory.trim() || !materialSummary.trim() || (materialIsStudentImport && !material.material.studentRecords.length)} onClick={commitMaterial}>{phase === "material-committing" ? <LoaderCircle className="spin" size={16}/> : <CheckCircle2 size={16}/>}确认并保存{materialIsStudentImport ? ` ${material.material.studentRecords.length} 名学生` : "资料"}</button></footer>
        </section>
      </> : null}

      {phase === "done" && result ? <section className="import-result panel">
        <span className="result-check"><CheckCircle2 size={30}/></span><h2>{definition.label}导入完成</h2><p>已完成逐行校验，并自动保存到{recordType === "students" ? "“学生档案”" : `“${definition.label}”数据区`}；错误行未写入。</p>
        {recordType === "students" && <p className="all-valid"><CheckCircle2 size={15}/>已同步创建 {result.accounts?.created ?? 0} 个学生登录账号；已有账号保持不变。登录账号为学号，初始密码为姓名全拼（小写、无空格）。</p>}
        <div><article><small>新增</small><strong>{result.inserted}</strong></article><article><small>更新</small><strong>{result.updated}</strong></article><article><small>跳过</small><strong>{result.skipped}</strong></article><article><small>总计</small><strong>{result.total}</strong></article></div>
        {result.errors.length ? <section><h3><AlertCircle size={15}/>需要修正的行</h3>{result.errors.slice(0, 12).map((item) => <p key={item.rowNumber}><b>第{item.rowNumber}行</b>{item.messages.join("；")}</p>)}</section> : <p className="all-valid"><CheckCircle2 size={15}/>所有数据均通过校验</p>}
        <footer>{result.errors.length ? <button className="secondary-button" onClick={downloadErrorReport}><Download size={14}/>下载错误报告</button> : null}<button className="secondary-button" onClick={reset}>继续导入</button><a className="primary-button" href={recordType === "students" ? "/students" : "/assistant?prompt=%E6%9F%A5%E7%9C%8B%E5%88%9A%E6%89%8D%E5%AF%BC%E5%85%A5%E7%9A%84%E6%95%B0%E6%8D%AE"}>{recordType === "students" ? "打开学生档案" : "让智能助手查询"}</a></footer>
      </section> : null}

      {phase === "material-done" && materialResult ? <section className="import-result panel">
        <span className="result-check"><CheckCircle2 size={30}/></span><h2>资料已进入助手知识范围</h2><p>“{materialResult.title}”的原件已保存在当前电脑，可检索内容已进入平台，现在可以按人物、学号、主题、日期或待办提问。</p>
        <div><article><small>提取文字</small><strong>{materialResult.textLength.toLocaleString()}</strong></article><article><small>检索分段</small><strong>{materialResult.chunkCount}</strong></article><article><small>识别待办</small><strong>{materialResult.taskCount}</strong></article></div>
        <footer><button className="secondary-button" onClick={reset}>继续上传</button>{administratorKnowledge ? <button className="primary-button" onClick={onCommitted}>刷新资料列表</button> : <a className="primary-button" href={`/assistant?prompt=${encodeURIComponent(`请总结刚才上传的${materialResult.title}，列出涉及人员和待办`)}`}>让智能助手处理</a>}</footer>
      </section> : null}

      {error && <div className="import-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    </section>

    <aside className="import-side">
      <section className="panel import-destination"><h2>导入后会保存到哪里？</h2><dl><div><dt>原始文件</dt><dd>只保存在当前{administratorKnowledge ? "管理员" : "教师"}电脑的浏览器本地文件库</dd></div><div><dt>学生与业务数据</dt><dd>清洗后进入平台数据库，并关联学生学号</dd></div><div><dt>知识资料内容</dt><dd>提取文字和检索索引进入助手资料库</dd></div></dl></section>
      <section className="panel import-coverage"><h2>可处理的资料</h2><p>一个入口同时处理结构化表格和非结构化材料。</p><div>
        <article><span>表</span><p><b>业务表格</b><small>Excel、CSV、TSV、JSON；映射字段并逐行校验</small></p></article>
        <article><span>文</span><p><b>Word 与文本</b><small>DOCX、TXT、Markdown、HTML、RTF、邮件</small></p></article>
        <article><span>PDF</span><p><b>PDF 与演示文稿</b><small>文本PDF、扫描PDF、PPTX；提取正文和事项</small></p></article>
        <article><span>图</span><p><b>聊天截图与照片</b><small>PNG、JPG、WebP、GIF；视觉识别对话和关键信息</small></p></article>
      </div><details><summary>查看{importDefinitionList.length}类结构化业务数据</summary><div>{importDefinitionList.map((item) => <article key={item.type}><span>{item.icon}</span><p><b>{item.label}</b><small>{item.description}</small></p></article>)}</div></details></section>
      <section className="panel import-history"><header><History size={15}/><h2>最近导入</h2></header>{jobs.length ? jobs.slice(0, 8).map((job) => <article key={job.id}><span>{job.status === "committed" ? "✓" : "…"}</span><p><b>{job.file_name}</b><small>{job.total_rows}行 · {job.sheet_count}个工作表 · {localFileIds.has(job.id) ? "原件在本机" : "本机无原件"}</small></p><button onClick={() => removeJob(job)} aria-label={`删除${job.file_name}`}><Trash2 size={13}/></button></article>) : <p className="history-empty">还没有导入记录</p>}</section>
    </aside>
  </div>;
}
