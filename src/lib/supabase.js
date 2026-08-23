import char from './mockChar.json'

const mockChannel = {
  on: function () {
    return this
  },
  subscribe: function (callback) {
    if (typeof callback === 'function') callback('SUBSCRIBED')
    return this
  },
  unsubscribe: function () {
    return this
  },
}

function rowData() {
  const { id, owner, moduleId, createdAt, updatedAt, ...data } = char
  return {
    id: char.id,
    owner: char.owner,
    module_id: char.moduleId ?? 'default',
    data,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const mockSupabase = {
  from: (table) => ({
    select: () => ({
      eq: (col, val) => ({
        single: async () => {
          if (table === 'characters' && col === 'id' && val === char.id) {
            return { data: rowData(), error: null }
          }
          return { data: null, error: { message: 'not found' } }
        },
        maybeSingle: async () => {
          if (table === 'characters' && col === 'id' && val === char.id) {
            return { data: rowData(), error: null }
          }
          return { data: null, error: null }
        },
        order: () => ({
          data: table === 'characters' ? [rowData()] : [],
          error: null,
        }),
      }),
      order: () => ({
        data: table === 'characters' ? [rowData()] : [],
        error: null,
      }),
    }),
    update: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null }),
  }),
  channel: () => mockChannel,
  removeChannel: () => Promise.resolve(),
  removeAllChannels: () => Promise.resolve(),
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
}

export const supabase = mockSupabase
export function isSupabaseEnabled() {
  return true
}
