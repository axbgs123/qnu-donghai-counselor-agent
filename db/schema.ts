import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["counselor", "teacher", "admin", "service"] })
    .notNull()
    .default("counselor"),
  department: text("department").notNull().default("文学与传播学院"),
  campus: text("campus").notNull().default("东海校区"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    studentNo: text("student_no").notNull().unique(),
    name: text("name").notNull(),
    department: text("department").notNull(),
    grade: text("grade").notNull(),
    className: text("class_name").notNull(),
    community: text("community").notNull(),
    building: text("building").notNull(),
    room: text("room").notNull(),
    phone: text("phone"),
    status: text("status", { enum: ["normal", "follow_up", "assisting"] })
      .notNull()
      .default("normal"),
    counselorId: text("counselor_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_students_counselor_status").on(table.counselorId, table.status),
    index("idx_students_building_room").on(table.building, table.room),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").references(() => users.id),
    title: text("title").notNull(),
    module: text("module").notNull(),
    dueAt: text("due_at"),
    priority: text("priority", { enum: ["urgent", "important", "normal"] })
      .notNull()
      .default("normal"),
    status: text("status", { enum: ["todo", "doing", "done"] })
      .notNull()
      .default("todo"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_tasks_owner_status_due").on(table.ownerId, table.status, table.dueAt),
  ],
);

export const workflowCases = sqliteTable(
  "workflow_cases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    studentId: text("student_id").references(() => students.id),
    subject: text("subject").notNull().default(""),
    stage: text("stage").notNull(),
    status: text("status", { enum: ["open", "waiting", "closed"] })
      .notNull()
      .default("open"),
    ownerId: text("owner_id").references(() => users.id),
    ownerName: text("owner_name").notNull().default("负责老师"),
    payload: text("payload", { mode: "json" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_cases_type_status").on(table.type, table.status),
    index("idx_cases_student").on(table.studentId),
  ],
);

export const knowledgeDocuments = sqliteTable(
  "knowledge_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    sourceUrl: text("source_url"),
    version: text("version").notNull().default("V1.0"),
    effectiveAt: text("effective_at"),
    expiresAt: text("expires_at"),
    status: text("status", { enum: ["active", "expiring", "expired"] })
      .notNull()
      .default("active"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_knowledge_category_status").on(table.category, table.status)],
);

export const studentRecords = sqliteTable(
  "student_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: text("student_id").notNull().references(() => students.id),
    domain: text("domain").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status", { enum: ["recorded", "follow_up", "completed"] })
      .notNull()
      .default("recorded"),
    happenedAt: text("happened_at").notNull(),
    followUpAt: text("follow_up_at"),
    ownerId: text("owner_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_student_records_student_time").on(table.studentId, table.happenedAt),
    index("idx_student_records_domain_status").on(table.domain, table.status),
  ],
);

export const participationRecords = sqliteTable(
  "participation_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: text("student_id").notNull().references(() => students.id),
    category: text("category", { enum: ["sport", "competition", "club", "volunteer"] }).notNull(),
    activityName: text("activity_name").notNull(),
    occurredAt: text("occurred_at").notNull(),
    hours: integer("hours"),
    result: text("result"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_participation_student_category").on(table.studentId, table.category),
  ],
);

export const classWork = sqliteTable(
  "class_work",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    className: text("class_name").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    scheduledAt: text("scheduled_at"),
    participantCount: integer("participant_count"),
    status: text("status", { enum: ["planned", "doing", "completed"] })
      .notNull()
      .default("planned"),
    ownerId: text("owner_id").references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_class_work_class_status").on(table.className, table.status)],
);

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    ownerTeacherId: text("owner_teacher_id"),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key"),
    status: text("status", { enum: ["analyzed", "committed", "failed"] }).notNull().default("analyzed"),
    totalRows: integer("total_rows").notNull().default(0),
    sheetCount: integer("sheet_count").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    committedAt: text("committed_at"),
  },
  (table) => [index("idx_import_jobs_created").on(table.createdAt), index("idx_import_jobs_owner_created").on(table.ownerTeacherId, table.createdAt)],
);

export const importStagingRows = sqliteTable(
  "import_staging_rows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull().references(() => importJobs.id),
    sheetName: text("sheet_name").notNull(),
    rowNumber: integer("row_number").notNull(),
    rawJson: text("raw_json").notNull(),
  },
  (table) => [index("idx_import_staging_job_sheet").on(table.jobId, table.sheetName, table.rowNumber)],
);

export const importRecords = sqliteTable(
  "import_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordType: text("record_type").notNull(),
    externalKey: text("external_key").notNull(),
    studentNo: text("student_no"),
    studentName: text("student_name"),
    title: text("title"),
    className: text("class_name"),
    occurredAt: text("occurred_at"),
    payloadJson: text("payload_json").notNull(),
    sourceJobId: text("source_job_id").notNull().references(() => importJobs.id),
    sourceSheet: text("source_sheet").notNull(),
    sourceRow: integer("source_row").notNull(),
    reviewStatus: text("review_status", { enum: ["verified", "needs_review"] }).notNull().default("verified"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_import_records_type_key").on(table.recordType, table.externalKey),
    index("idx_import_records_type_student").on(table.recordType, table.studentNo),
    index("idx_import_records_student_name").on(table.studentName),
  ],
);

export const importRecordVersions = sqliteTable(
  "import_record_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordType: text("record_type").notNull(), externalKey: text("external_key").notNull(),
    studentNo: text("student_no"), studentName: text("student_name"), title: text("title"), className: text("class_name"),
    occurredAt: text("occurred_at"), payloadJson: text("payload_json").notNull(), sourceJobId: text("source_job_id").notNull(),
    sourceSheet: text("source_sheet").notNull(), sourceRow: integer("source_row").notNull(), reviewStatus: text("review_status").notNull(),
    capturedByJobId: text("captured_by_job_id").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_import_versions_key").on(table.recordType, table.externalKey, table.id),
    index("idx_import_versions_jobs").on(table.sourceJobId, table.capturedByJobId),
  ],
);

export const studentArchiveBlocks = sqliteTable("student_archive_blocks", {
  studentNo: text("student_no").primaryKey(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().unique().references(() => importJobs.id),
    ownerTeacherId: text("owner_teacher_id"),
    visibility: text("visibility", { enum: ["global", "teacher_private"] }).notNull().default("teacher_private"),
    visibilityReason: text("visibility_reason"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    extension: text("extension").notNull(),
    storageKey: text("storage_key"),
    documentType: text("document_type", { enum: ["chat", "notice", "policy", "student_material", "meeting", "form", "report", "other"] }).notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull(),
    extractedText: text("extracted_text").notNull(),
    peopleJson: text("people_json").notNull().default("[]"),
    studentNosJson: text("student_nos_json").notNull().default("[]"),
    datesJson: text("dates_json").notNull().default("[]"),
    tasksJson: text("tasks_json").notNull().default("[]"),
    tagsJson: text("tags_json").notNull().default("[]"),
    processingMethod: text("processing_method").notNull(),
    confidence: real("confidence").notNull().default(0),
    reviewStatus: text("review_status", { enum: ["verified", "needs_review"] }).notNull().default("verified"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_source_documents_type_updated").on(table.documentType, table.updatedAt),
    index("idx_source_documents_title").on(table.title),
    index("idx_source_documents_access").on(table.visibility, table.ownerTeacherId, table.updatedAt),
  ],
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id").notNull().references(() => sourceDocuments.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_document_chunks_document_index").on(table.documentId, table.chunkIndex),
  ],
);

export const pilotStudents = sqliteTable("pilot_students", {
  studentNo: text("student_no").primaryKey(),
  name: text("name").notNull(),
  className: text("class_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studentSessions = sqliteTable(
  "student_sessions",
  {
    token: text("token").primaryKey(),
    studentNo: text("student_no").notNull().references(() => pilotStudents.studentNo),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: text("last_active_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_sessions_student").on(table.studentNo)],
);

export const studentDailyUsage = sqliteTable(
  "student_daily_usage",
  {
    studentNo: text("student_no").notNull().references(() => pilotStudents.studentNo),
    usageDate: text("usage_date").notNull(),
    turnCount: integer("turn_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.studentNo, table.usageDate] })],
);

export const aiProviderSettings = sqliteTable("ai_provider_settings", {
  provider: text("provider", { enum: ["zhipu", "deepseek"] }).primaryKey(),
  apiKey: text("api_key").notNull().default(""),
  model: text("model").notNull(),
  baseUrl: text("base_url").notNull(),
  isActive: integer("is_active").notNull().default(0),
  lastTestStatus: text("last_test_status"),
  lastTestAt: text("last_test_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teacherAiSettings = sqliteTable(
  "teacher_ai_settings",
  {
    teacherId: text("teacher_id").notNull(),
    provider: text("provider", { enum: ["zhipu", "deepseek"] }).notNull(),
    apiKey: text("api_key").notNull().default(""),
    model: text("model").notNull(),
    baseUrl: text("base_url").notNull(),
    isActive: integer("is_active").notNull().default(0),
    lastTestStatus: text("last_test_status"),
    lastTestAt: text("last_test_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.teacherId, table.provider] }),
    index("idx_teacher_ai_active").on(table.teacherId, table.isActive),
  ],
);

export const assistantConversations = sqliteTable(
  "assistant_conversations",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").notNull(),
    title: text("title").notNull(),
    messagesJson: text("messages_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_assistant_conversations_teacher_updated").on(table.teacherId, table.updatedAt)],
);

export const notificationReads = sqliteTable(
  "notification_reads",
  {
    teacherId: text("teacher_id").notNull(),
    notificationKey: text("notification_key").notNull(),
    readAt: text("read_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.teacherId, table.notificationKey] })],
);

export const appAccounts = sqliteTable(
  "app_accounts",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "teacher", "student"] }).notNull(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    permissionsJson: text("permissions_json").notNull().default("[]"),
    teacherId: text("teacher_id"),
    studentNo: text("student_no").unique(),
    className: text("class_name"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_accounts_role_status").on(table.role, table.status),
    index("idx_accounts_teacher_role").on(table.teacherId, table.role),
  ],
);

export const teacherClasses = sqliteTable(
  "teacher_classes",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").notNull(),
    name: text("name").notNull(),
    grade: text("grade").notNull().default(""),
    department: text("department").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_teacher_classes_teacher_name").on(table.teacherId, table.name),
    index("idx_teacher_classes_teacher").on(table.teacherId, table.name),
  ],
);

export const appSessions = sqliteTable(
  "app_sessions",
  {
    token: text("token").primaryKey(),
    accountId: text("account_id").notNull().references(() => appAccounts.id),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: text("last_active_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_sessions_account_expiry").on(table.accountId, table.expiresAt)],
);

export const studentRequests = sqliteTable(
  "student_requests",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id"),
    studentNo: text("student_no").notNull(),
    studentName: text("student_name").notNull(),
    className: text("class_name").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    conversationJson: text("conversation_json").notNull(),
    status: text("status", { enum: ["new", "processing", "resolved"] }).notNull().default("new"),
    urgency: text("urgency", { enum: ["normal", "urgent"] }).notNull().default("normal"),
    teacherReply: text("teacher_reply"),
    replyChannel: text("reply_channel"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_student_requests_status_created").on(table.status, table.createdAt),
    index("idx_student_requests_student").on(table.studentNo, table.createdAt),
    index("idx_student_requests_class_status").on(table.className, table.status),
    index("idx_student_requests_teacher_status").on(table.teacherId, table.status, table.createdAt),
  ],
);

export const welcomeItems = sqliteTable("welcome_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().unique(),
  description: text("description").notNull(),
  dueAt: text("due_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("published"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const welcomeCompletions = sqliteTable(
  "welcome_completions",
  {
    itemId: integer("item_id").notNull().references(() => welcomeItems.id),
    studentNo: text("student_no").notNull().references(() => pilotStudents.studentNo),
    completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.studentNo] })],
);
