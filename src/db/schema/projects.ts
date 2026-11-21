import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const PROJECT_STATUSES = [
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export const PROJECT_HEALTHS = ["on_track", "at_risk", "off_track"] as const;
export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "awaiting_approval",
  "approved",
  "changes_requested",
] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: orgId(),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    description: varchar("description", { length: 2000 }).notNull().default(""),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("planning"),
    health: text("health", { enum: PROJECT_HEALTHS }).notNull().default("on_track"),
    startDate: date("start_date", { mode: "string" }),
    targetDate: date("target_date", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("projects_org_code_unique").on(t.orgId, t.code),
    check(
      "projects_status_check",
      sql`${t.status} in ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled')`
    ),
    check("projects_health_check", sql`${t.health} in ('on_track', 'at_risk', 'off_track')`),
    index("projects_org_updated_idx").on(t.orgId, t.updatedAt.desc()),
  ]
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 150 }).notNull(),
    description: varchar("description", { length: 2000 }).notNull().default(""),
    position: integer("position").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status", { enum: MILESTONE_STATUSES }).notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedByName: text("decided_by_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: varchar("decision_note", { length: 1000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "milestones_status_check",
      sql`${t.status} in ('pending', 'in_progress', 'awaiting_approval', 'approved', 'changes_requested')`
    ),
    index("milestones_project_position_idx").on(t.projectId, t.position),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    assigneeName: varchar("assignee_name", { length: 100 }),
    dueDate: date("due_date", { mode: "string" }),
    position: integer("position").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("tasks_status_check", sql`${t.status} in ('todo', 'in_progress', 'done')`),
    index("tasks_milestone_position_idx").on(t.milestoneId, t.position),
    index("tasks_project_idx").on(t.projectId),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    s3Key: text("s3_key").notNull().unique(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedByName: text("uploaded_by_name").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("attachments_project_created_idx").on(t.projectId, t.createdAt.desc())]
);

export type ProjectRow = typeof projects.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
