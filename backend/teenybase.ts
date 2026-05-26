// backend/teenybase.ts
import {
  DatabaseSettings, TableAuthExtensionData, TableRulesExtensionData,
} from 'teenybase'
import { baseFields, authFields, createdTrigger, updatedTrigger } from 'teenybase/scaffolds/fields'

export default {
  appUrl: '$APP_URL',
  jwtSecret: '$JWT_SECRET',

  tables: [
    {
      name: 'users',
      autoSetUid: true,
      fields: [...baseFields, ...authFields],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'auth',
          jwtSecret: '$JWT_SECRET_USERS',
          jwtTokenDuration: 3600,
          maxTokenRefresh: 5,
          authCookie: { name: 'teeny_auth' },
          passwordConfirmSuffix: 'Confirm',
        } as TableAuthExtensionData,
        {
          name: 'rules',
          createRule: 'true',
          viewRule: 'auth.uid == id',
          updateRule: 'auth.uid == id',
          deleteRule: 'auth.uid == id',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'facilities',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'ridb_id',          type: 'text',    sqlType: 'text',      notNull: true, unique: true },
        { name: 'name',             type: 'text',    sqlType: 'text',      notNull: true },
        { name: 'lat',              type: 'number',  sqlType: 'real',      notNull: true },
        { name: 'lng',              type: 'number',  sqlType: 'real',      notNull: true },
        { name: 'forest',           type: 'text',    sqlType: 'text'       },
        { name: 'district',         type: 'text',    sqlType: 'text'       },
        { name: 'description',      type: 'text',    sqlType: 'text'       },
        { name: 'fee_min',          type: 'number',  sqlType: 'real'       },
        { name: 'fee_max',          type: 'number',  sqlType: 'real'       },
        { name: 'season_start',     type: 'text',    sqlType: 'text'       },
        { name: 'season_end',       type: 'text',    sqlType: 'text'       },
        { name: 'fcfs_total',       type: 'integer', sqlType: 'integer'    },
        { name: 'reservable_total', type: 'integer', sqlType: 'integer'    },
        { name: 'is_fully_fcfs',    type: 'bool',    sqlType: 'boolean'    },
        { name: 'is_partial_fcfs',  type: 'bool',    sqlType: 'boolean'    },
        { name: 'amenities',        type: 'json',    sqlType: 'json'       },
        { name: 'ridb_data_quality',type: 'select',  sqlType: 'text'       },
        { name: 'fs_url',           type: 'url',     sqlType: 'text'       },
        { name: 'last_synced',      type: 'date',    sqlType: 'timestamp'  },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',
          viewRule: 'true',
          createRule: 'false',
          updateRule: 'false',
          deleteRule: 'false',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'alerts',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'facility_id', type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'content',     type: 'text',    sqlType: 'text'      },
        { name: 'scraped_at',  type: 'date',    sqlType: 'timestamp' },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',
          viewRule: 'true',
          createRule: 'false',
          updateRule: 'false',
          deleteRule: 'false',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'ratings',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'facility_id', type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'user_id',     type: 'relation', sqlType: 'text',
          foreignKey: { table: 'users', column: 'id', onDelete: 'CASCADE' } },
        { name: 'score',       type: 'integer',  sqlType: 'integer', notNull: true },
        { name: 'notes',       type: 'text',     sqlType: 'text'     },
        { name: 'visited_at',  type: 'date',     sqlType: 'timestamp'},
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',
          viewRule: 'true',
          createRule: 'auth.uid != null',
          updateRule: 'auth.uid == user_id',
          deleteRule: 'auth.uid == user_id',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'saved_campgrounds',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'user_id',        type: 'relation', sqlType: 'text',
          foreignKey: { table: 'users', column: 'id', onDelete: 'CASCADE' } },
        { name: 'facility_id',    type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'personal_notes', type: 'text',     sqlType: 'text' },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'auth.uid == user_id',
          viewRule: 'auth.uid == user_id',
          createRule: 'auth.uid != null',
          updateRule: 'auth.uid == user_id',
          deleteRule: 'auth.uid == user_id',
        } as TableRulesExtensionData,
      ],
    },
  ],
} satisfies DatabaseSettings
