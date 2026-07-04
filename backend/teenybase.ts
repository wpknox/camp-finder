// backend/teenybase.ts
import {
  DatabaseSettings,
  TableAuthExtensionData,
  TableRulesExtensionData,
} from "teenybase";
import {
  baseFields,
  authFields,
  createdTrigger,
  updatedTrigger,
} from "teenybase/scaffolds/fields";

// Shared moderation-review fields for edit_suggestions / merge_suggestions.
const moderationFields = [
  { name: "note", type: "text", sqlType: "text" },
  { name: "status", type: "select", sqlType: "text", notNull: true }, // pending | approved | rejected
  // reviewed_by is deliberately loose text (not a relation) so review
  // audit info survives if an admin account is deleted.
  { name: "reviewed_by", type: "text", sqlType: "text" },
  { name: "reviewed_at", type: "date", sqlType: "timestamp" },
  { name: "admin_note", type: "text", sqlType: "text" },
] as const;

export default {
  appUrl: "$APP_URL",
  jwtSecret: "$JWT_SECRET",

  tables: [
    {
      name: "users",
      autoSetUid: true,
      // Note: `authFields` already includes a `role` text column (usage:
      // auth_audience) — reused here as our 'admin' | null moderation
      // role rather than adding a duplicate field (teenybase rejects
      // duplicate field names). WARNING: the Teenybase sign-up endpoint
      // (POST /api/v1/table/users/auth/sign-up) mass-assigns this field
      // AND embeds it as the JWT `aud` claim if the client passes
      // `"role"` in the request body — verified via manual curl test.
      // The SvelteKit register route (/api/auth/register) does NOT
      // forward a `role` field today, which mitigates this, but the
      // Teenybase Worker itself is directly reachable and unprotected.
      // role must only ever be set directly in sqlite by an operator;
      // never trust or forward client-supplied `role` in any server route.
      fields: [...baseFields, ...authFields],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "auth",
          jwtSecret: "$JWT_SECRET_USERS",
          jwtTokenDuration: 3600,
          maxTokenRefresh: 5,
          passwordType: "sha256",
          authCookie: { name: "teeny_auth" },
          passwordConfirmSuffix: "Confirm",
        } satisfies TableAuthExtensionData,
        {
          name: "rules",
          listRule: "false",
          createRule: "true",
          viewRule: "auth.uid == id",
          updateRule: "auth.uid == id",
          deleteRule: "auth.uid == id",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "facilities",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "ridb_id",
          type: "text",
          sqlType: "text",
          notNull: true,
          unique: true,
        },
        { name: "name", type: "text", sqlType: "text", notNull: true },
        { name: "lat", type: "number", sqlType: "real", notNull: true },
        { name: "lng", type: "number", sqlType: "real", notNull: true },
        { name: "forest", type: "text", sqlType: "text" },
        { name: "district", type: "text", sqlType: "text" },
        { name: "description", type: "text", sqlType: "text" },
        { name: "fee_min", type: "number", sqlType: "real" },
        { name: "fee_max", type: "number", sqlType: "real" },
        { name: "season_start", type: "text", sqlType: "text" },
        { name: "season_end", type: "text", sqlType: "text" },
        { name: "fcfs_total", type: "integer", sqlType: "integer" },
        { name: "reservable_total", type: "integer", sqlType: "integer" },
        { name: "is_fully_fcfs", type: "bool", sqlType: "boolean" },
        { name: "is_partial_fcfs", type: "bool", sqlType: "boolean" },
        { name: "amenities", type: "json", sqlType: "json" },
        { name: "ridb_data_quality", type: "select", sqlType: "text" },
        { name: "fs_url", type: "url", sqlType: "text" },
        { name: "is_closed", type: "bool", sqlType: "boolean" },
        { name: "last_synced", type: "date", sqlType: "timestamp" },
        // JSON array of ridb_ids absorbed by merges — ETL must not re-create these.
        { name: "merged_ridb_ids", type: "json", sqlType: "json" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "true",
          viewRule: "true",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "alerts",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "CASCADE",
          },
        },
        { name: "content", type: "text", sqlType: "text" },
        { name: "scraped_at", type: "date", sqlType: "timestamp" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "true",
          viewRule: "true",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "ratings",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "CASCADE",
          },
        },
        {
          name: "user_id",
          type: "relation",
          sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" },
        },
        { name: "score", type: "integer", sqlType: "integer", notNull: true },
        { name: "notes", type: "text", sqlType: "text" },
        { name: "visited_at", type: "date", sqlType: "timestamp" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      indexes: [
        {
          name: "ratings_user_facility_unique",
          unique: true,
          fields: ["user_id", "facility_id"],
        },
      ],
      extensions: [
        {
          name: "rules",
          listRule: "true",
          viewRule: "true",
          createRule: "auth.uid == user_id",
          updateRule: "auth.uid == user_id",
          deleteRule: "auth.uid == user_id",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "saved_campgrounds",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "user_id",
          type: "relation",
          sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" },
        },
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "CASCADE",
          },
        },
        { name: "personal_notes", type: "text", sqlType: "text" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      indexes: [
        {
          name: "saved_user_facility_unique",
          unique: true,
          fields: ["user_id", "facility_id"],
        },
      ],
      extensions: [
        {
          name: "rules",
          listRule: "auth.uid == user_id",
          viewRule: "auth.uid == user_id",
          createRule: "auth.uid != null",
          updateRule: "auth.uid == user_id",
          deleteRule: "auth.uid == user_id",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "edit_suggestions",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "CASCADE",
          },
        },
        {
          name: "user_id",
          type: "relation",
          sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" },
        },
        // Partial facility patch: { fee_min?, fee_max?, season_start?, season_end?, amenities?: Partial<Amenities> }
        { name: "changes", type: "json", sqlType: "json", notNull: true },
        ...moderationFields,
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "false",
          viewRule: "false",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
    {
      name: "merge_suggestions",
      autoSetUid: true,
      fields: [
        ...baseFields,
        // facility_a / facility_b are deliberately UNORDERED — the
        // winner/survivor is chosen by the admin at review time, so the
        // names carry no direction.
        // SET NULL (not CASCADE): a merge deletes the loser facility, and we
        // want the merge_suggestion to SURVIVE as an approved audit record.
        // CASCADE here would delete the suggestion mid-merge, which then makes
        // the "mark approved" step 404 and falsely report the merge as failed.
        {
          name: "facility_a",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "SET NULL",
          },
        },
        {
          name: "facility_b",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "SET NULL",
          },
        },
        {
          name: "user_id",
          type: "relation",
          sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" },
        },
        ...moderationFields,
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "false",
          viewRule: "false",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
  ],
} satisfies DatabaseSettings;
