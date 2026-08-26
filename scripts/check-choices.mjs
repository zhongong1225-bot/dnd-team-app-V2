import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data } = await sb.from('characters').select('id,data')
for (const c of data) {
  const d = c.data
  const classes = d.classes || []
  const mainClass = classes[0]?.name || d.class || '?'
  if (mainClass.includes('德鲁伊') || mainClass.includes('牧师')) {
    console.log(c.id, d.name?.slice(0,30), mainClass, 'choices:', JSON.stringify(d.classFeatureChoices || {}))
  }
}
