// =============================================================================
//  CONFIGURATION — à remplir une seule fois
// =============================================================================
//
//  1. Ouvre ton projet sur https://supabase.com/dashboard
//  2. Va dans « Project Settings » > « API » (ou « Data API » / « API Keys »)
//  3. Copie :
//       - la « Project URL »            -> SUPABASE_URL
//       - la clé « anon » / « public »  -> SUPABASE_ANON_KEY
//
//  La clé « anon » est faite pour être publique : elle est protégée par les
//  règles RLS définies dans supabase/schema.sql.
//  ⚠️ Ne mets JAMAIS ici la clé « service_role » (elle donne tous les droits).
// =============================================================================

// URL de ton projet Supabase (détectée depuis ton dashboard)
export const SUPABASE_URL = 'https://vwcqiffpdzkfvfcqlhyx.supabase.co';

// Clé publique / publishable de ton projet Supabase
export const SUPABASE_ANON_KEY = 'sb_publishable_SqWEdr3yfyDpQ4NZTwdcHA_vDdcVqa_';

// (Facultatif) Ton e-mail pour l'API de traduction MyMemory.
// Sans e-mail : environ 5 000 mots traduits par jour. Avec : environ 50 000.
// Laisse '' si tu ne veux pas le renseigner.
export const MYMEMORY_EMAIL = '';
